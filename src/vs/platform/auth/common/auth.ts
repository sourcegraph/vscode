/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';

export const IAuthService = createDecorator<IAuthService>('authService');

export interface IAuthService {
	_serviceBrand: any;

	/**
	 * The current user or undefined if there is no current user.
	 */
	readonly currentUser?: IUser;

	/**
	 * Event that fires when the current user changes or when any
	 * of the current user's fields change.
	 */
	readonly onDidChangeCurrentUser: Event<void>;

	/**
	 * Refresh fetches the latest infromation from the server and fires the necessary events.
	 */
	refresh(): void;

	/**
	 * Starts the user signin flow
	 * If the user successfully signs in, the onDidChangeCurrentUser event will fire.
	 */
	showSignInFlow(): void;

	/**
	 * Signs the user out
	 * If the user successfully signs out, the onDidChangeCurrentUser event will fire.
	 */
	signOut(): void;
}

export interface IUser {
	/**
	 * id is the Sourcegraph unique ID for a user.
	 */
	readonly id: string;

	/**
	 * avatarUrl is the URL to the user's profile avatar.
	 */
	readonly avatarUrl: string | undefined;

	/**
	 * email is the user's primary email.
	 */
	readonly email: string;

	/**
	 * The org memberships of this user.
	 */
	readonly orgMemberships: IOrgMember[];

	/**
	 * The current org that the user has selected.
	 */
	currentOrgMember: IOrgMember | undefined;

	/**
	 * Event that fires when the current user changes their current org. Note,
	 * this fires whenever the user signs in or signs out.
	 */
	readonly onDidChangeCurrentOrgMember: Event<void>;
}

/**
 * The user's profile inside of an org.
 */
export interface IOrgMember {
	readonly id: number;
	readonly email: string;
	readonly username: string;
	readonly displayName: string;
	readonly avatarUrl: string | undefined;
	readonly org: IOrg;
}

export interface IOrg {
	/**
	 * id is the Sourcegraph unique ID for an org.
	 */
	readonly id: number;

	/**
	 * name is the display name of an org.
	 */
	readonly name: string;
}