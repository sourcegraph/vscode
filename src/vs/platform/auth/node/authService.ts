/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IAuthService, IUser, IOrgMember, IOrgSettings } from 'vs/platform/auth/common/auth';
import { IRemoteService, IRemoteConfiguration, requestGraphQL, requestGraphQLMutation } from 'vs/platform/remote/node/remote';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ModalIdentifiers } from 'vs/workbench/parts/modal/modal';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ThrottledDelayer } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';
import * as objects from 'vs/base/common/objects';
import { IFileService } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';

export { Event }

/**
 * This service exposes the currently authenticated user and organization context.
 */
export class AuthService extends Disposable implements IAuthService {
	_serviceBrand: any;

	private static MEMENTO_KEY = 'auth.currentuser';
	private static CURRENT_USER_KEY = 'currentUser';

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

	private updateConfigDelayer: ThrottledDelayer<void>;

	/**
	 * This flag gets enabled whenever we detect that the organization settings were saved,
	 * and is reset whenever the organization settings are uploaded.
	 */
	private shouldUploadConfigurationSettings = false;

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
	) {
		super();
		this.globalState = new Memento(AuthService.MEMENTO_KEY);
		this.memento = this.globalState.getMemento(storageService);
		if (this.memento[AuthService.CURRENT_USER_KEY]) {
			this._currentUser = new User(this.memento[AuthService.CURRENT_USER_KEY], this.telemetryService);
		}

		this.updateConfigDelayer = new ThrottledDelayer<void>(1000);

		// Load user profile data from remote endpoint on initial load
		this._register(this.configurationService.onDidUpdateConfiguration(() => this.onDidUpdateConfiguration()));

		this._register(this.windowsService.onWindowFocus(() => {
			this.refresh();
		}));

		this._register(this.textFileService.models.onModelSaved(model => {
			if (model.resource.fsPath === this.environmentService.appOrganizationSettingsPath) {
				this.shouldUploadConfigurationSettings = true;
				this.onDidUpdateConfiguration();
			}
		}));

		this.onDidUpdateConfiguration();
	}

	public get currentUser(): IUser | undefined {
		return this._currentUser;
	}

	private equalUsers(a: User, b: User): boolean {
		if (!a && b || a && !b) {
			return false;
		}

		return a === b || objects.equals(a.toMemento(), b.toMemento());
	}

	private setCurrentUser(newUser: User | undefined): TPromise<void> {
		if (this.equalUsers(newUser, this._currentUser)) {
			return TPromise.as(undefined);
		}
		const newSettings = newUser && newUser.currentOrgMember && newUser.currentOrgMember.org.latestSettings;
		return this.saveOrgSettingsToDisk(newSettings).then(() => {
			dispose(this._currentUser);
			this.toDisposeOnCurrentUserChange = dispose(this.toDisposeOnCurrentUserChange);

			this._currentUser = newUser;
			if (this._currentUser) {
				this.toDisposeOnCurrentUserChange.push(this._currentUser.onDidChangeCurrentOrgMember(() => {
					const newOrgMember = this._currentUser.currentOrgMember;
					const newOrgSettings = newOrgMember && newOrgMember.org.latestSettings;
					this.saveOrgSettingsToDisk(newOrgSettings, true);
					this.globalState.saveMemento();
					this.didChangeCurrentUser.fire();
				}));
				this.memento[AuthService.CURRENT_USER_KEY] = newUser;
			} else {
				this.memento[AuthService.CURRENT_USER_KEY] = undefined;
			}
			this.globalState.saveMemento();
			this.didChangeCurrentUser.fire();
		});
	}

	private toDisposeOnCurrentUserChange: IDisposable[] = [];

	/**
	 * Executed when the user first opens the editor, changes their configuration,
	 * saves their organization settings file, completes signing in, signs out, or
	 * switches accounts and successfully updates their remote.cookie setting.
	 *
	 * This method uploads a organization settings file if the file has been saved with contents
	 * that differ from the most recently fetched user profile.
	 *
	 * This method also requests updated user profile data from the remote endpoint.
	 */
	private onDidUpdateConfiguration(): void {
		this.updateConfigDelayer.trigger(() => {
			const config = this.configurationService.getConfiguration<IRemoteConfiguration>();
			this._currentSessionId = config.remote.cookie;
			if (!this._currentSessionId) {
				// If user is already signed in, notify them that their signout was successful and log telemetry.
				// If not, it's possible they ran into this failed request during app launch.
				if (this.currentUser) {
					this.telemetryService.publicLog('LogoutClicked');
					this.messageService.show(Severity.Info, localize('remote.auth.signedOutConfirmation', "Your editor has been signed out of Sourcegraph. Visit {0} to end your web session.", urlToSignOut(this.configurationService)));
				}

				// Delete user from memory
				this.setCurrentUser(undefined);
				this.telemetryService.publicLog('CurrentUserSignedOut');
				return TPromise.as(undefined);
			}

			// If the org configuration was just updated, grab it, and upload to the server.
			if (this.shouldUploadConfigurationSettings) {
				const activeOrg = this.currentUser.currentOrgMember && this.currentUser.currentOrgMember.org;
				if (activeOrg) {
					const orgSettingsFile = URI.file(this.environmentService.appOrganizationSettingsPath);
					return this.fileService.resolveContent(orgSettingsFile).then(content => {
						const newSettingsBlob = content.value;

						// Don't bother uploading if the settings haven't changed.
						const lastFetchedSettings = activeOrg.latestSettings;
						if (this.getSettingsBlob(lastFetchedSettings) === newSettingsBlob) {
							this.shouldUploadConfigurationSettings = false;
							return this.requestCurrentUser()
								.then(user => {
									this.handleUserResponse(user);
								});
						}

						return this.uploadNewOrgSettings(lastFetchedSettings, newSettingsBlob)
							.then(user => {
								this.shouldUploadConfigurationSettings = false;
								this.handleUserResponse(user);
							});
					});
				}
				this.shouldUploadConfigurationSettings = false;
			}
			// Request updated user profile information
			return this.requestCurrentUser()
				.then(user => this.handleUserResponse(user));
		});
	}

	private uploadNewOrgSettings(lastFetchedSettings: IOrgSettings | undefined, newSettingsBlob: string): TPromise<GQL.IUser> {
		const orgID = this.currentUser.currentOrgMember.org.id;
		return requestGraphQLMutation<{ updateOrgSettings: { author: GQL.IUser } }>(this.remoteService, `mutation UpdateOrgSettings {
			updateOrgSettings(orgID: $orgID, lastKnownSettingsID: $lastKnownSettingsID, contents: $newSettingsBlob) {
				author {
					${userGraphQLRequest}
				}
			}
		}`, {
				orgID,
				lastKnownSettingsID: lastFetchedSettings && lastFetchedSettings.id,
				newSettingsBlob,
			}).then(response => response.updateOrgSettings.author);
	}

	private requestCurrentUser(): TPromise<GQL.IUser> {
		return requestGraphQL<{ currentUser: GQL.IUser }>(this.remoteService, `query CurrentUser {
			root {
				currentUser {
					${userGraphQLRequest}
				}
			}
		}`, {}).then(response => response.currentUser);
	}

	private handleUserResponse(user: GQL.IUser) {
		const orgMemberships = user.orgMemberships.map(membership => ({
			id: membership.id,
			email: membership.email,
			username: membership.username,
			displayName: membership.displayName,
			avatarUrl: membership.avatarURL,
			org: membership.org,
		}));
		return this.setCurrentUser(new User({
			id: user.sourcegraphID,
			auth0Id: user.id,
			username: user.username,
			email: user.email,
			avatarUrl: user.avatarURL,
			orgMemberships,
			currentOrgMember: orgMemberships[0],
		}, this.telemetryService))
			.then(() => {
				if (this._currentUser) {
					this.telemetryService.publicLog('CurrentUserSignedIn', this._currentUser.getTelemetryData());
				}
			});
	}

	public inviteTeammate(emailAddress: string): void {
		const email = emailAddress.trim();
		if (!email.length) {
			return;
		}
		if (!this.currentUser || !this.currentUser.currentOrgMember || !this.currentUser.currentOrgMember.org) {
			return;
		}
		const orgID = this.currentUser.currentOrgMember.org.id;
		requestGraphQLMutation<{ response: any }>(this.remoteService, `mutation inviteUser(
			$email: String!, $orgID: Int!
		) {
			inviteUser(email: $email, orgID: $orgID) {
				alwaysNil
			}
		}`, { orgID, email })
			.then(() => {
				this.telemetryService.publicLog('InviteTeammateSuccess');
				this.messageService.show(Severity.Info, localize('inviteTeammate.success', "Invited {0} to {1}", email, this.currentUser.currentOrgMember.org.name));
			}, (err) => {
				this.messageService.show(Severity.Error, err);
			});
	}

	public refresh(): void {
		this.onDidUpdateConfiguration();
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

	private saveOrgSettingsToDisk(newSettings: IOrgSettings, force: boolean = false): TPromise<void> {
		const newSettingsBlob = this.getSettingsBlob(newSettings);
		if (!force) {
			const currentOrgMember = this.currentUser && this.currentUser.currentOrgMember;
			const oldSettings = currentOrgMember && currentOrgMember.org.latestSettings;

			const oldSettingsBlob = this.getSettingsBlob(oldSettings);

			if (oldSettingsBlob === newSettingsBlob) {
				return TPromise.as(undefined);
			}
		}

		const orgSettingsFile = URI.file(this.environmentService.appOrganizationSettingsPath);

		return this.fileService.createFile(orgSettingsFile, newSettingsBlob, { overwrite: true })
			.then(() => this.configurationService.reloadConfiguration());
	}

	private getSettingsBlob(settings: IOrgSettings): string {
		return (settings && settings.contents) || '{}';
	}
}


const userGraphQLRequest = `
	id
	sourcegraphID
	username
	avatarURL
	email
	orgMemberships {
		id
		username
		email
		displayName
		avatarURL
		org {
			id
			name
			latestSettings {
				id
				contents
			}
		}
	}`;

interface UserMemento {
	readonly id: number;
	readonly auth0Id: string;
	readonly username: string;
	readonly email: string;
	readonly avatarUrl: string | undefined;
	readonly orgMemberships: IOrgMember[];
	readonly currentOrgMember: IOrgMember;
}

class User extends Disposable implements IUser, UserMemento {

	public readonly id: number;
	public readonly auth0Id: string;
	public readonly username: string;
	public readonly email: string;
	public readonly avatarUrl: string | undefined;
	public readonly orgMemberships: IOrgMember[];

	constructor(user: UserMemento, @ITelemetryService private telemetryService: ITelemetryService) {
		super();
		this.id = user.id;
		this.auth0Id = user.auth0Id;
		this.username = user.username;
		this.email = user.email;
		this.avatarUrl = user.avatarUrl;
		this.orgMemberships = user.orgMemberships;
		this._currentOrgMember = user.currentOrgMember;
	}

	private _currentOrgMember: IOrgMember | undefined;
	private didChangeCurrentOrgMember = this._register(new Emitter<void>());
	public onDidChangeCurrentOrgMember = this.didChangeCurrentOrgMember.event;
	public get currentOrgMember(): IOrgMember { return this._currentOrgMember; }
	public set currentOrgMember(orgMember: IOrgMember) {
		if (this._currentOrgMember !== orgMember) {
			this._currentOrgMember = orgMember;
			this.didChangeCurrentOrgMember.fire();
			this.telemetryService.publicLog('CurrentOrgMemberChanged', this.getTelemetryData());
		}
	}

	public toMemento(): UserMemento {
		return {
			id: this.id,
			auth0Id: this.auth0Id,
			username: this.username,
			email: this.email,
			avatarUrl: this.avatarUrl,
			orgMemberships: this.orgMemberships,
			currentOrgMember: this.currentOrgMember,
		};
	}

	public getTelemetryData(): any {
		return {
			auth: {
				user: {
					id: this.id,
					auth0_id: this.auth0Id,
					username: this.username,
					email: this.email,
					orgMemberships: this.orgMemberships,
				},
				currentOrgMember: this.currentOrgMember,
			}
		};
	}
}

export function urlToSignIn(configService: IConfigurationService): URI {
	const config = configService.getConfiguration<IRemoteConfiguration>();
	if (!config.remote || !config.remote.endpoint) {
		throw new Error('unable to sign in because remote.endpoint configuration setting is not present');
	}

	return URI.parse(config.remote.endpoint).with({
		path: '/settings/editor-auth',
		query: 'utm_source=editor&referrer=editor'
	});
}

export function urlToSignOut(configService: IConfigurationService): URI {
	const config = configService.getConfiguration<IRemoteConfiguration>();
	if (!config.remote || !config.remote.endpoint) {
		throw new Error('unable to sign out because remote.endpoint configuration setting is not present');
	}

	return URI.parse(config.remote.endpoint).with({
		path: '/-/logout'
	});
}
