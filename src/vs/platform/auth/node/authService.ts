/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IAuthService, IOrg, IUser } from 'vs/platform/auth/common/auth';
import { IRemoteService, IRemoteConfiguration, requestGraphQL } from 'vs/platform/remote/node/remote';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ModalIdentifiers } from 'vs/workbench/parts/modal/modal';

export { Event }

interface UserResponse {
	currentUser: GQL.IUser;
}

enum UserChangedEventTypes {
	SignedIn,
	SignedOut,
	ProfileChanged
}

class User extends Disposable implements IUser {
	private _currentOrg?: IOrg;
	private _onDidChangeCurrentOrg = this._register(new Emitter<void>());
	public onDidChangeCurrentOrg = this._onDidChangeCurrentOrg.event;

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		public id: string,
		public handle?: string,
		public avatarUrl?: string,
		public email?: string,
		public orgs?: IOrg[]
	) {
		super();
		if (this.orgs) {
			this._currentOrg = this.orgs[0];
		}
	}

	public get currentOrg(): IOrg | undefined {
		return this._currentOrg;
	}

	// TODO(Dan): find a place to call this once orgs backend & GraphQL API are complete/available
	// private didChangeCurrentOrg(): void {
	// 	this.telemetryService.publicLog('CurrentOrgChanged', this.getTelemetryData());

	// 	this._onDidChangeCurrentOrg.fire();
	// }

	/**
	 * Data for telemetry
	 */
	public getTelemetryData(): any {
		return {
			auth: {
				user: {
					id: this.id,
					handle: this.handle,
					email: this.email,
					orgs: this.orgs,
				},
				org: this.currentOrg
			}
		};
	}
}

/**
 * This service exposes the currently authenticated user and organization context.
 */
export class AuthService extends Disposable implements IAuthService {
	_serviceBrand: any;

	private _onDidChangeCurrentUser = this._register(new Emitter<void>());
	public onDidChangeCurrentUser = this._onDidChangeCurrentUser.event;

	private _currentUser?: User;

	/**
	 * Cached value of user setting remote.cookie. Only used to validate that the property
	 * changed onDidupdateConfiguration events.
	 */
	private _currentSessionId?: string;

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@IRemoteService private remoteService: IRemoteService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@ICommandService private commandService: ICommandService,
		@IMessageService private messageService: IMessageService
	) {
		super();

		// Load user profile data from remote endpoint on initial load
		this._register(this.configurationService.onDidUpdateConfiguration(() => this.onDidUpdateConfiguration()));

		this.onDidUpdateConfiguration();

	}

	public get currentUser(): IUser | undefined {
		return this._currentUser;
	}

	/**
	 * Executed on 'remote.cookie' user setting updates. When the user first opens
	 * the editor, changes their remote.cookie setting manually, or completes
	 * signing in, signing out, or switching accounts and successfully
	 * updates their remote.cookie setting, this method requests updated
	 * user profile data from the remote endpoint.
	 */
	private onDidUpdateConfiguration() {
		const config = this.configurationService.getConfiguration<IRemoteConfiguration>();
		// Only re-request user data, fire an event, and log telemetry if the cookie actually changed
		if (this._currentSessionId !== config.remote.cookie) {
			this._currentSessionId = config.remote.cookie;
			// Request updated user profile information
			requestGraphQL<UserResponse>(this.remoteService, `query CurrentUser() {
				root {
					currentUser {
						id
						handle
						avatarURL
						email
					}
				}
			}`, {}).then(userData => {
					this._currentUser = new User(this.telemetryService,
						userData.currentUser.id,
						userData.currentUser.handle,
						userData.currentUser.avatarURL,
						userData.currentUser.email
						// TODO(Dan): uncomment once orgs backend & GraphQL API are updated
						// orgs: userData.currentUser.orgs,
						// currentOrg: userData.currentUser.orgs ? userData.currentUser.orgs[0] : null
					);

					this.didChangeCurrentUser(UserChangedEventTypes.SignedIn);
				}, () => {
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
					this.didChangeCurrentUser(UserChangedEventTypes.SignedOut);
				});
		}
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

	private didChangeCurrentUser(type: UserChangedEventTypes): void {
		switch (type) {
			case UserChangedEventTypes.SignedIn:
				this.telemetryService.publicLog('CurrentUserSignedIn', this._currentUser.getTelemetryData());
				break;
			case UserChangedEventTypes.SignedOut:
				this.telemetryService.publicLog('CurrentUserSignedOut');
				break;
			case UserChangedEventTypes.ProfileChanged:
				this.telemetryService.publicLog('CurrentUserProfileChanged', this._currentUser.getTelemetryData());
				break;
		}

		this._onDidChangeCurrentUser.fire();
	}
}

export function urlToSignIn(configService: IConfigurationService): URI {
	const config = configService.getConfiguration<IRemoteConfiguration>();
	if (!config.remote || !config.remote.endpoint) {
		throw new Error('unable to sign in because remote.endpoint configuration setting is not present');
	}

	return URI.parse(config.remote.endpoint).with({
		path: '/editor-auth'
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