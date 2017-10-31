/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickOpenRegistry, Extensions as QuickOpenExtensions, QuickOpenHandlerDescriptor, QuickOpenAction } from 'vs/workbench/browser/quickopen';
import { ReviewQuickOpenHandler } from 'vs/workbench/parts/review/electron-browser/reviewQuickOpenHandler';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

export class ReviewQuickOpenAction extends QuickOpenAction {
	public static readonly ID = 'workbench.action.review';
	public static readonly LABEL = localize('reviewItems', "Review Code");

	constructor(actionId: string, actionLabel: string, @IQuickOpenService quickOpenService: IQuickOpenService) {
		super(actionId, actionLabel, ReviewQuickOpenHandler.PREFIX, quickOpenService);
	}
}
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(ReviewQuickOpenAction, ReviewQuickOpenAction.ID, ReviewQuickOpenAction.LABEL), 'Review Code');

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
