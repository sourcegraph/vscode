/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
// import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction } from 'vs/workbench/browser/viewlet';
// import { VIEWLET_ID } from 'vs/workbench/parts/review/common/review';
// import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
// import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
// import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
// import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
// import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
// import { ReviewViewlet } from 'vs/workbench/parts/review/electron-browser/reviewViewlet';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor } from 'vs/workbench/browser/quickopen';
import { ReviewQuickOpenHandler } from 'vs/workbench/parts/review/electron-browser/reviewQuickOpenHandler';

// Register Quick Open
(<IQuickOpenRegistry>Registry.as(QuickOpenExtensions.Quickopen)).registerQuickOpenHandler(
	new QuickOpenHandlerDescriptor(
		ReviewQuickOpenHandler,
		ReviewQuickOpenHandler.ID,
		ReviewQuickOpenHandler.PREFIX,
		'reviewItemsPicker',
		localize('reviewItems', "Review Code")
	)
);

// Register viewlet
// Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
// 	ReviewViewlet,
// 	VIEWLET_ID,
// 	localize('review', "Review"),
// 	'review',
// 	37
// ));

// Register Action to Open Viewlet
// class OpenReviewViewletAction extends ToggleViewletAction {

// 	static ID = VIEWLET_ID;
// 	static LABEL = localize('toggleReviewViewlet', "Show Review");

// 	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
// 		super(id, label, VIEWLET_ID, viewletService, editorService);
// 	}
// }
// Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions).registerWorkbenchAction(
// 	new SyncActionDescriptor(OpenReviewViewletAction, VIEWLET_ID, localize('toggleReviewViewlet', "Show Review"), {
// 		primary: null,
// 		win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
// 		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
// 		mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_G }
// 	}),
// 	'View: Show Review',
// 	localize('view', "View")
// );
