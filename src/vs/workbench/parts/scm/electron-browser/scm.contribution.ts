/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { DirtyDiffDecorator } from './dirtydiffDecorator';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { StatusUpdater, StatusBarController } from './scmActivity';

class OpenSCMViewletAction extends ToggleViewletAction {

	static ID = VIEWLET_ID;
	static LABEL = localize('toggleGitViewlet', "Show Git");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(DirtyDiffDecorator);

const viewletDescriptor = new ViewletDescriptor(
	'vs/workbench/parts/scm/electron-browser/scmViewlet',
	'SCMViewlet',
	VIEWLET_ID,
	localize('source control', "Source Control"),
	'scm',
	36
);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets)
	.registerViewlet(viewletDescriptor);

Registry.as(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(StatusUpdater);

Registry.as(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(StatusBarController);

// Register Action to Open Viewlet
Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(OpenSCMViewletAction, VIEWLET_ID, localize('toggleSCMViewlet', "Show SCM"), {
		primary: null,
		win: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_G },
		mac: { primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KEY_G }
	}),
	'View: Show SCM',
	localize('view', "View")
);

export class ShowAllRepositoriesAction extends Action {

	public static ID = 'scm.showAllRepositories';
	public static LABEL = localize('scm.showAllRepositories', "Show All SCM Repositories");

	constructor(
		id: string,
		label: string,
		@ISCMService private scmService: ISCMService,
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		console.group('SCM repositories');
		const data: any = [];
		this.scmService.repositories.forEach(({ provider }) => {
			data.push({
				// id: provider.id,
				// label: provider.label,
				root: provider.rootUri ? provider.rootUri.toString() : '',
				'rev.rawSpecifier': provider.revision ? provider.revision.rawSpecifier : '',
				// 'rev.specifier': provider.revision ? provider.revision.specifier : '',
				'rev.id': provider.revision ? provider.revision.id : '',
			});
		});
		console.table(data);
		console.groupEnd();
		return TPromise.as(true);
	}
}

Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(ShowAllRepositoriesAction, ShowAllRepositoriesAction.ID, ShowAllRepositoriesAction.LABEL), 'Developer: Show All SCM Repositories', 'SCM');
