/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { Disposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IAuthService, IUser, IOrgMember, IOrgSettings, IOrg } from 'vs/platform/auth/common/auth';
import { IRemoteService, requestGraphQL, requestGraphQLMutation } from 'vs/platform/remote/node/remote';
import { IRemoteConfiguration } from 'vs/platform/remote/common/remote';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ModalIdentifiers } from 'vs/workbench/parts/modal/modal';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ThrottledDelayer, IntervalTimer } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';
import * as objects from 'vs/base/common/objects';
import { IFileService } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IOutputService, IOutputChannelRegistry, Extensions } from 'vs/workbench/parts/output/common/output';
import { Registry } from 'vs/platform/registry/common/platform';
import { first } from 'vs/base/common/arrays';

export { Event };


const CHANNEL_ID = 'sourcegraphAuth';

Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels)
	.registerChannel(CHANNEL_ID, localize('authChannelLabel', "Auth"));

/**
 * This service exposes the currently authenticated user and organization context.
 */
export class AuthService extends Disposable implements IAuthService {
	_serviceBrand: any;

	private static MEMENTO_KEY = 'auth.currentuser';
	private static CURRENT_USER_KEY = 'currentUser';
	private static UPLOAD_CONFIG_KEY = 'shouldUpload';

	private globalState: Memento;
	private memento: object;

	private didChangeCurrentUser = this._register(new Emitter<void>());
	public onDidChangeCurrentUser = this.didChangeCurrentUser.event;

	private _currentUser?: User;

	/**
	 * Cached value of user setting remote.cookie. Only used to validate that the property
	 * changed onDidupdateConfiguration events.
	 */
	private _currentSessionId?: string;

	/**
	 * This flag gets enabled whenever we detect that the organization settings were saved,
	 * and is reset whenever the organization settings are uploaded.
	 */
	private _shouldUploadConfigurationSettings = false;

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@IRemoteService private remoteService: IRemoteService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService,
		@IMessageService private messageService: IMessageService,
		@IWindowsService private windowsService: IWindowsService,
		@IStorageService private storageService: IStorageService,
		@IFileService private fileService: IFileService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITextFileService private textFileService: ITextFileService,
		@IOutputService private outputService: IOutputService,
	) {
		super();
		this.globalState = new Memento(AuthService.MEMENTO_KEY);
		this.memento = this.globalState.getMemento(this.storageService);
		if (this.memento[AuthService.CURRENT_USER_KEY]) {
			// Restore the signed in state.
			this.setCurrentUser(this.memento[AuthService.CURRENT_USER_KEY]);
		}

		if (this.memento[AuthService.UPLOAD_CONFIG_KEY]) {
			this._shouldUploadConfigurationSettings = this.memento[AuthService.UPLOAD_CONFIG_KEY];
		}

		// Refresh when config changes (auth token may have changed).
		this._register(this.configurationService.onDidChangeConfiguration(() => this.refresh()));

		// Refresh on window focus to get the latest user data (including configuration).
		this._register(this.windowsService.onWindowFocus(() => this.refresh()));

		// Upload organization settings to the server when they change.
		this._register(this.textFileService.models.onModelSaved(model => {
			if (model.resource.fsPath === this.environmentService.appOrganizationSettingsPath) {
				if (!this.currentAuthCookie()) {
					this.messageService.show(Severity.Warning, localize(
						'uploadOrgSettings.signedOut', "You are not signed in to Sourcegraph. When you sign in, your editor will show your organization's settings."));
					return;
				}

				this.shouldUploadConfigurationSettings = true;
				this.refresh();
			}
		}));

		// Load user profile data from remote endpoint on initial load
		this.refresh();

		const refreshTimer = this._register(new IntervalTimer());
		refreshTimer.cancelAndSet(() => this.refresh(), 1000 * 60 * 5); // 5 minute interval
	}

	private refreshDelayer = new ThrottledDelayer<void>(1000);
	public refresh(): void {
		this.refreshDelayer.trigger(() => TPromise.wrap(this.refreshNow()));
	}

	/**
	 * Refreshes the user model with the latest data from the server.
	 * If there are any local changes to org settings, they are first uploaded to the server.
	 */
	private async refreshNow(): Promise<void> {
		this._currentSessionId = this.currentAuthCookie();
		if (!this._currentSessionId) {
			// If user is already signed in, notify them that their signout was successful and log telemetry.
			// If not, it's possible they ran into this failed request during app launch.
			if (this.currentUser) {
				this.telemetryService.publicLog('LogoutClicked');
				this.messageService.show(Severity.Info, localize('remote.auth.signedOutConfirmation', "Your editor has been signed out of Sourcegraph. Visit {0} to end your web session.", urlToSignOut(this.configurationService)));
			}

			// Delete user from memory
			this.setCurrentUser(undefined);
			return;
		}

		try {
			const user = await this.syncUser();
			const orgMemberships = user.orgMemberships;
			await this.setCurrentUser({
				memento: true,
				id: user.sourcegraphID,
				auth0ID: user.auth0ID,
				username: user.username,
				email: user.email,
				displayName: user.displayName,
				avatarUrl: user.avatarURL,
				orgMemberships,
				currentOrgMember: this.getUpdatedCurrentOrgMember(orgMemberships),
			});
		} catch (e) {
			if (this.isNoCurrentUserErr(e)) {
				this.signOut();
			}

			throw e;
		}
	}

	private currentAuthCookie(): string {
		const config = this.configurationService.getValue<IRemoteConfiguration>();
		return config.remote.cookie;
	}

	private isNoCurrentUserErr(err: any): boolean {
		// TODO@sourcegraph: Don't rely on string comparisons. See https://github.com/sourcegraph/sourcegraph/issues/7761
		const message: string = (err && err.message) || '';
		return message.indexOf('no current user') !== -1;
	}

	private get shouldUploadConfigurationSettings(): boolean {
		return this._shouldUploadConfigurationSettings;
	}

	private set shouldUploadConfigurationSettings(shouldUpload: boolean) {
		this._shouldUploadConfigurationSettings = shouldUpload;
		this.memento[AuthService.UPLOAD_CONFIG_KEY] = shouldUpload;
		this.globalState.saveMemento();
	}

	public get currentUser(): IUser | undefined {
		return this._currentUser;
	}

	private async setCurrentUser(user: UserMemento | undefined): Promise<void> {
		if (objects.equals(user, this._currentUser && this._currentUser.toMemento())) {
			return;
		}
		dispose(this._currentUser);
		if (user) {
			this.telemetryService.publicLog('CurrentUserSignedIn', getTelemetryData(user));
			this._currentUser = new User(user, this.telemetryService);
			this._currentUser.onDidChangeCurrentOrgMember(this.handleUserChanged, this);
			this.memento[AuthService.CURRENT_USER_KEY] = user;
			this.log('updated user');
		} else {
			this.telemetryService.publicLog('CurrentUserSignedOut');
			this._currentUser = undefined;
			this.memento[AuthService.CURRENT_USER_KEY] = undefined;
			this.log('removed user');
		}
		await this.handleUserChanged();
	}

	private async handleUserChanged(): Promise<void> {
		// If the user changed, then the org may have changed.
		// If the org changed, then we need to write the org settings to disk
		// so they can be applied.
		await this.applyOrgSettings();

		// After we know the user's settings are up to date, we fire the change event.
		this.globalState.saveMemento();
		this.didChangeCurrentUser.fire();
		this.log('updated org settings');
	}

	/**
	 * This method returns a promise that resolves after the current user's
	 * org settings are written to disk a loaded in the editor.
	 */
	private async applyOrgSettings(): Promise<void> {
		const currentOrg = this.getCurrentOrg();
		const newSettings = currentOrg && currentOrg.latestSettings;
		const newSettingsBlob = getSettingsBlob(newSettings);
		const orgSettingsFile = URI.file(this.environmentService.appOrganizationSettingsPath);
		await this.fileService.createFile(orgSettingsFile, newSettingsBlob, { overwrite: true });
		await this.configurationService.reloadConfiguration();
	}

	/**
	 * Uploads the current org settings to the server if necessary
	 * and fetches the latest user information from the server.
	 */
	private async syncUser(): Promise<GQL.IUser> {
		if (!this.shouldUploadConfigurationSettings) {
			return this.requestCurrentUser();
		}

		const activeOrg = this.getCurrentOrg();
		if (!activeOrg) {
			this.shouldUploadConfigurationSettings = false;
			this.messageService.show(Severity.Warning, localize(
				'uploadOrgSettings.noOrg', "You are not currently in an organization. When you join one, its settings will be reflected here."));
			return this.requestCurrentUser();
		}

		const orgSettingsFile = URI.file(this.environmentService.appOrganizationSettingsPath);
		const newSettingsBlob = (await this.fileService.resolveContent(orgSettingsFile)).value;

		// Don't bother uploading if the settings haven't changed.
		const lastFetchedSettings = activeOrg.latestSettings;
		if (getSettingsBlob(lastFetchedSettings) === newSettingsBlob) {
			this.shouldUploadConfigurationSettings = false;
			return this.requestCurrentUser();
		}

		try {
			const response = await requestGraphQLMutation<{ updateOrgSettings: { author: GQL.IUser } }>(this.remoteService, `mutation UpdateOrgSettings {
			updateOrgSettings(orgID: $orgID, lastKnownSettingsID: $lastKnownSettingsID, contents: $newSettingsBlob) {
				author {
					${userGraphQLRequest}
				}
			}
		}`, {
					orgID: activeOrg.id,
					lastKnownSettingsID: lastFetchedSettings && lastFetchedSettings.id,
					newSettingsBlob,
				});
			this.shouldUploadConfigurationSettings = false;
			this.log('uploaded organization settings');
			return response.updateOrgSettings.author;

		} catch (e) {
			this.messageService.show(Severity.Warning, localize(
				'uploadOrgSettings.failure', "Failed to sync organization settings. Synchronization will be re-attempted later."));
			throw e;
		}
	}

	private async requestCurrentUser(): Promise<GQL.IUser> {
		const response = await requestGraphQL<{ currentUser: GQL.IUser }>(this.remoteService, `query CurrentUser {
			root {
				currentUser {
					${userGraphQLRequest}
				}
			}
		}`, {});
		return response.currentUser;
	}

	public inviteTeammate(emailAddress: string): void {
		const email = emailAddress.trim();
		if (!email.length) {
			return;
		}
		const currentOrg = this.getCurrentOrg();
		if (!currentOrg) {
			return;
		}
		requestGraphQLMutation<{ response: any }>(this.remoteService, `mutation inviteUser(
			$email: String!, $orgID: Int!
		) {
			inviteUser(email: $email, orgID: $orgID) {
				alwaysNil
			}
		}`, { orgID: currentOrg.id, email })
			.then(() => {
				this.telemetryService.publicLog('InviteTeammateSuccess', {
					organization: {
						invite: {
							user_email: email,
						},
						org_id: currentOrg.id,
					},
				});
				this.messageService.show(Severity.Info, localize('inviteTeammate.success', "Invited {0} to {1}", email, currentOrg.name));
			}, (err) => {
				this.messageService.show(Severity.Error, err);
			});
	}

	/**
	 * showSignInFlow opens a browser to the remote endpoint for authentication.
	 * Upon completion there, the user will receive instructions for updating
	 * their editor settings.
	 */
	public showSignInFlow() {
		this.telemetryService.publicLog('SignInModalInitiated');

		// Initiate the modal that walks the user through authenticating their editor
		this.commandService.executeCommand('sg.modal.pushModal', ModalIdentifiers.SIGNIN);

		// Open browser to remote endpoint
		window.open(urlToSignIn(this.configurationService).toString(true));
	}

	public signOut(): void {
		// Delete cookie value from user settings. This will trigger the
		// onDidUpdateConfiguration handler, which clears local memory and fires notifications.
		this.configurationService.updateValue('remote.cookie', '', ConfigurationTarget.USER);
	}

	/**
	 * getUpdatedCurrentOrgMember finds what the new value of user.currentOrgMember should be after a
	 * server fetch. It attempts to maintain the user's currently selected org.
	 * @param newOrgMemberships The newly updated orgMemberships list after a sever fetch.
	 */
	private getUpdatedCurrentOrgMember(newOrgMemberships: IOrgMember[]): IOrgMember | undefined {
		if (newOrgMemberships.length === 0) {
			return undefined;
		}
		const currentOrg = this.getCurrentOrg();
		if (currentOrg) {
			const updatedOrgMember = first(newOrgMemberships, orgMember => orgMember.org.id === currentOrg.id);
			if (updatedOrgMember) {
				return updatedOrgMember;
			}
		}
		return newOrgMemberships[0];
	}

	private getCurrentOrg(): IOrg | undefined {
		const currentOrgMember = this._currentUser && this._currentUser.currentOrgMember;
		return currentOrgMember && currentOrgMember.org;
	}

	private log(message: string): void {
		this.outputService.getChannel(CHANNEL_ID).append(message + '\n');
	}
}

function getSettingsBlob(settings: IOrgSettings): string {
	return (settings && settings.contents) || '{}';
}

const userGraphQLRequest = `
	id
	sourcegraphID
	username
	avatarURL
	displayName
	email
	orgMemberships {
		id
		org {
			id
			name
			latestSettings {
				id
				contents
			}
		}
	}`;

/**
 * A serializable version of a User.
 */
interface UserMemento {
	// This property is to prevent us from accidentally using a User as a UserMemento
	readonly memento: true;

	readonly id: number;
	readonly auth0ID: string;
	readonly username: string;
	readonly email: string;
	readonly displayName: string;
	readonly avatarUrl: string | undefined;
	readonly orgMemberships: IOrgMember[];
	readonly currentOrgMember: IOrgMember | undefined;
}

class User extends Disposable implements IUser {
	public readonly id: number;
	public readonly auth0ID: string;
	public readonly username: string;
	public readonly email: string;
	public readonly avatarUrl: string | undefined;
	public readonly displayName: string | undefined;
	public readonly orgMemberships: IOrgMember[];

	constructor(user: UserMemento, @ITelemetryService private telemetryService: ITelemetryService) {
		super();
		this.id = user.id;
		this.auth0ID = user.auth0ID;
		this.username = user.username;
		this.email = user.email;
		this.avatarUrl = user.avatarUrl;
		this.displayName = user.displayName;
		this.orgMemberships = user.orgMemberships;
		this._currentOrgMember = user.currentOrgMember || user.orgMemberships[0];
	}

	private _currentOrgMember: IOrgMember | undefined;
	private didChangeCurrentOrgMember = this._register(new Emitter<void>());
	public onDidChangeCurrentOrgMember = this.didChangeCurrentOrgMember.event;
	public get currentOrgMember(): IOrgMember { return this._currentOrgMember; }
	public set currentOrgMember(orgMember: IOrgMember) {
		if (!objects.equals(this._currentOrgMember, orgMember)) {
			this._currentOrgMember = orgMember;
			this.didChangeCurrentOrgMember.fire();
			this.telemetryService.publicLog('CurrentOrgMemberChanged', this.getTelemetryData());
		}
	}

	public toMemento(): UserMemento {
		return {
			memento: true,
			id: this.id,
			auth0ID: this.auth0ID,
			username: this.username,
			email: this.email,
			avatarUrl: this.avatarUrl,
			displayName: this.displayName,
			orgMemberships: this.orgMemberships,
			currentOrgMember: this.currentOrgMember,
		};
	}

	public getTelemetryData(): any {
		return getTelemetryData(this.toMemento());
	}
}

function getTelemetryData(user: UserMemento): any {
	return {
		auth: {
			user: {
				id: user.id,
				auth0_id: user.auth0ID,
				username: user.username,
				email: user.email,
				orgMemberships: user.orgMemberships,
			},
			currentOrgMember: user.currentOrgMember,
		}
	};
}

export function urlToSignIn(configService: IConfigurationService): URI {
	return getRemoteEndpoint(configService).with({
		path: '/settings/editor-auth',
		query: 'utm_source=editor&referrer=editor'
	});
}

export function urlToCreateOrg(configService: IConfigurationService): URI {
	return getRemoteEndpoint(configService).with({
		path: '/settings/orgs/new',
		query: 'utm_source=editor&referrer=editor'
	});
}

export function urlToSignOut(configService: IConfigurationService): URI {
	return getRemoteEndpoint(configService).with({
		path: '/-/logout'
	});
}

function getRemoteEndpoint(configService: IConfigurationService): URI {
	const config = configService.getValue<IRemoteConfiguration>();
	if (!config.remote || !config.remote.endpoint) {
		throw new Error('unable to sign out because remote.endpoint configuration setting is not present');
	}
	return URI.parse(config.remote.endpoint);
}