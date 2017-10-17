/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { InviteQuickOpenHandler } from 'vs/workbench/parts/invite/electron-browser/inviteQuickOpenHandler';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { InviteUserAction } from 'vs/workbench/parts/invite/electron-browser/inviteAction';
import { OPEN_INVITE_ACTION_ID, OPEN_INVITE_ACTION_LABEL } from 'vs/workbench/parts/invite/common/constants';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';

// Register Invite Quick Open
(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		InviteQuickOpenHandler,
		InviteQuickOpenHandler.ID,
		InviteQuickOpenHandler.PREFIX,
		'inviteItemsPicker',
		localize('inviteTeammate', "Invite teammate...")
	)
);

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(
		InviteUserAction,
		OPEN_INVITE_ACTION_ID,
		OPEN_INVITE_ACTION_LABEL
	),
	localize('inviteTeammate', "Invite teammate...")
);
