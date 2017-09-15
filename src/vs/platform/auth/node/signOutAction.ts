/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { IAuthService } from 'vs/platform/auth/common/auth';

/**
 * This action should handle all forms of signing out — all identity providers,
 * all git hosts/VCSs, etc
 */
export class SignOutAction extends Action {
	public static ID = 'remote.auth.signOut';
	public static LABEL = localize('remote.auth.signOutLabel', "Sign Out");

	constructor(
		id: string,
		label: string,
		@IAuthService private authService: IAuthService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		return TPromise.as(this.authService.signOut());
	}
}
