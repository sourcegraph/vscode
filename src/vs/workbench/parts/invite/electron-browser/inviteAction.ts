/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { INVITE_PREFIX } from 'vs/workbench/parts/invite/common/constants';
import { IAuthService } from 'vs/platform/auth/common/auth';

export class InviteUserAction extends QuickOpenAction {

	constructor(
		actionId: string,
		actionLabel: string,
		@IQuickOpenService quickOpenService: IQuickOpenService,
		@IAuthService private authService: IAuthService
	) {
		super(actionId, actionLabel, INVITE_PREFIX, quickOpenService);
		this.enabled = Boolean(this.authService.currentUser && this.authService.currentUser.currentOrgMember && this.authService.currentUser.currentOrgMember.org);
	}
}
