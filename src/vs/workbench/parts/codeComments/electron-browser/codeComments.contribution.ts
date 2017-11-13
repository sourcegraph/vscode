/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/codeComments';
import { Registry } from 'vs/platform/registry/common/platform';
import { localize } from 'vs/nls';
import * as Constants from 'vs/workbench/parts/codeComments/common/constants';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import 'vs/workbench/parts/codeComments/electron-browser/codeCommentsController';
import 'vs/workbench/parts/codeComments/browser/commentsContextKeys';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ICodeCommentsService } from 'vs/editor/browser/services/codeCommentsService';
import { CodeCommentsService } from 'vs/workbench/services/codeComments/electron-browser/codeCommentsService';
import { IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { OpenCodeCommentsViewletAction } from 'vs/workbench/parts/codeComments/electron-browser/codeCommentsActions';
import { CodeCommentsViewlet } from 'vs/workbench/parts/codeComments/electron-browser/codeCommentsViewlet';
import { IOutputChannelRegistry, Extensions as OutputExtensions } from 'vs/workbench/parts/output/common/output';
import { CodeCommentsQuickOpenHandler } from 'vs/workbench/parts/codeComments/electron-browser/codeCommentsQuickOpenHandler';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

registerSingleton(ICodeCommentsService, CodeCommentsService);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	CodeCommentsViewlet,
	Constants.VIEWLET_ID,
	localize('name', "Code Comments"),
	'codeComments',
	11 // after search viewlet
));

Registry.as<IOutputChannelRegistry>(OutputExtensions.OutputChannels)
	.registerChannel(Constants.CommentsChannelId, Constants.CommentsLabel);

const openViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyMod.Shift | KeyCode.KEY_M
};

// Global actions
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(OpenCodeCommentsViewletAction, OpenCodeCommentsViewletAction.ID, OpenCodeCommentsViewletAction.LABEL, openViewletKb),
	'View: Show Code Comments',
	localize('view', "View")
);

export class CodeCommentsQuickOpenAction extends QuickOpenAction {
	public static readonly ID = 'workbench.action.comments';
	public static readonly LABEL = localize('comments', "Comments");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, CodeCommentsQuickOpenHandler.PREFIX, quickOpenService);
	}
}

actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(CodeCommentsQuickOpenAction, CodeCommentsQuickOpenAction.ID, CodeCommentsQuickOpenAction.LABEL), 'Review Code');

// Register Quick Open
(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		CodeCommentsQuickOpenHandler,
		CodeCommentsQuickOpenHandler.ID,
		CodeCommentsQuickOpenHandler.PREFIX,
		'reviewItemsPicker',
		localize('comments', "Comments")
	)
);