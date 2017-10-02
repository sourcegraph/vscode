/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { Disposable, IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IAuthService, IOrg, IUser, IOrgMember } from 'vs/platform/auth/common/auth';
import { IRemoteService, IRemoteConfiguration, requestGraphQL } from 'vs/platform/remote/node/remote';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ModalIdentifiers } from 'vs/workbench/parts/modal/modal';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ThrottledDelayer } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';

export { Event }

/**
 * This service exposes the currently authenticated user and organization context.
 */
export class AuthService extends Disposable implements IAuthService {
	_serviceBrand: any;

	private didChangeCurrentUser = this._register(new Emitter<void>());
	public onDidChangeCurrentUser = this.didChangeCurrentUser.event;

	private _currentUser?: User;

	/**
	 * Cached value of user setting remote.cookie. Only used to validate that the property
	 * changed onDidupdateConfiguration events.
	 */
	private _currentSessionId?: string;

	private updateConfigDelayer: ThrottledDelayer<void>;

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@IRemoteService private remoteService: IRemoteService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@ICommandService private commandService: ICommandService,
		@IMessageService private messageService: IMessageService,
		@IWindowsService private windowsService: IWindowsService

	) {
		super();
		this.updateConfigDelayer = new ThrottledDelayer<void>(1000);

		// Load user profile data from remote endpoint on initial load
		this._register(this.configurationService.onDidUpdateConfiguration(() => this.onDidUpdateConfiguration()));

		this._register(this.windowsService.onWindowFocus(() => {
			this.refresh();
		}));

		this.onDidUpdateConfiguration();
	}

	public get currentUser(): IUser | undefined {
		return this._currentUser;
	}

	private toDisposeOnCurrentUserChange: IDisposable[] = [];

	/**
	 * Executed on 'remote.cookie' user setting updates. When the user first opens
	 * the editor, changes their remote.cookie setting manually, or completes
	 * signing in, signing out, or switching accounts and successfully
	 * updates their remote.cookie setting, this method requests updated
	 * user profile data from the remote endpoint.
	 */
	private onDidUpdateConfiguration(force?: boolean): void {
		this.updateConfigDelayer.trigger(() => {
			const config = this.configurationService.getConfiguration<IRemoteConfiguration>();
			// Only re-request user data, fire an event, and log telemetry if the cookie actually changed
			if (!force && this._currentSessionId === config.remote.cookie) {
				return TPromise.as(null);
			}
			this._currentSessionId = config.remote.cookie;
			// Request updated user profile information
			return requestGraphQL<{ currentUser: GQL.IUser }>(this.remoteService, `query CurrentUser {
					root {
						currentUser {
							id
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
								}
							}
						}
					}
				}`, {})
				.then(response => {
					dispose(this._currentUser);
					this.toDisposeOnCurrentUserChange = dispose(this.toDisposeOnCurrentUserChange);

					this._currentUser = new User(response.currentUser, this.telemetryService);
					this.toDisposeOnCurrentUserChange.push(this._currentUser.onDidChangeCurrentOrgMember(() => {
						this.didChangeCurrentUser.fire();
					}));
					this.telemetryService.publicLog('CurrentUserSignedIn', this._currentUser.getTelemetryData());
					this.didChangeCurrentUser.fire();
				}, () => {
					dispose(this._currentUser);
					this.toDisposeOnCurrentUserChange = dispose(this.toDisposeOnCurrentUserChange);

					// If user is already signed in, notify them that their signout was successful and log telemetry.
					// If not, it's possible they ran into this failed request during app launch.
					if (this.currentUser) {
						this.telemetryService.publicLog('LogoutClicked');
						this.messageService.show(Severity.Info, localize('remote.auth.signedOutConfirmation', "Your editor has been signed out of Sourcegraph. Visit {0} to end your web session.", urlToSignOut(this.configurationService)));
					}

					// Delete user from memory
					this._currentUser = undefined;
					this._currentSessionId = undefined;

					// Fire event
					this.telemetryService.publicLog('CurrentUserSignedOut');
					this.didChangeCurrentUser.fire();
				});
		});
	}

	public refresh(): void {
		this.onDidUpdateConfiguration(true);
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
		this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, {
			key: 'remote.cookie',
			value: ''
		});
	}
}

class User extends Disposable implements IUser {
	public readonly id: string;
	public readonly email: string;
	public readonly avatarUrl: string | undefined;
	public readonly orgMemberships: OrgMember[];

	constructor(user: GQL.IUser, @ITelemetryService private telemetryService: ITelemetryService) {
		super();
		this.id = user.id;
		this.email = user.email;
		this.avatarUrl = user.avatarURL;
		this.orgMemberships = user.orgMemberships.map(m => new OrgMember(m));
		this._currentOrgMember = this.orgMemberships[0];
	}

	private _currentOrgMember: OrgMember | undefined;
	private didChangeCurrentOrgMember = this._register(new Emitter<void>());
	public onDidChangeCurrentOrgMember = this.didChangeCurrentOrgMember.event;
	public get currentOrgMember(): OrgMember | undefined { return this._currentOrgMember; }
	public set currentOrgMember(orgMember: OrgMember) {
		if (this._currentOrgMember !== orgMember) {
			this._currentOrgMember = orgMember;
			this.didChangeCurrentOrgMember.fire();
			this.telemetryService.publicLog('CurrentOrgMemberChanged', this.getTelemetryData());
		}
	}

	public getTelemetryData(): any {
		return {
			auth: {
				user: {
					id: this.id,
					email: this.email,
					orgMemberships: this.orgMemberships,
				},
				currentOrgMember: this.currentOrgMember,
			}
		};
	}
}

class OrgMember implements IOrgMember {
	public readonly id: number;
	public readonly email: string;
	public readonly username: string;
	public readonly displayName: string;
	public readonly avatarUrl: string;
	public readonly org: Org;

	constructor(member: GQL.IOrgMember) {
		this.id = member.id;
		this.email = member.email;
		this.username = member.username;
		this.displayName = member.displayName;
		this.avatarUrl = member.avatarURL;
		this.org = new Org(member.org);
	}
}

class Org implements IOrg {
	public readonly id: number;
	public readonly name: string;

	constructor(org: GQL.IOrg) {
		this.id = org.id;
		this.name = org.name;
	}
}

export function urlToSignIn(configService: IConfigurationService): URI {
	const config = configService.getConfiguration<IRemoteConfiguration>();
	if (!config.remote || !config.remote.endpoint) {
		throw new Error('unable to sign in because remote.endpoint configuration setting is not present');
	}

	return URI.parse(config.remote.endpoint).with({
		path: '/settings/editor-auth',
		query: 'utm_source=editor'
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