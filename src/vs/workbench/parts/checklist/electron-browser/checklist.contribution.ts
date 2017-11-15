/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions as WorkbenchExtensions, IWorkbenchContributionsRegistry } from 'vs/workbench/common/contributions';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor, ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { VIEWLET_ID } from 'vs/workbench/parts/checklist/common/checklist';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ChecklistViewlet } from 'vs/workbench/parts/checklist/electron-browser/checklistViewlet';
import { StatusUpdater } from './checklistActivity';
import { DiagnosticsChecklistProvider } from './checklistDiagnostics';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

class OpenChecklistViewletAction extends ToggleViewletAction {

	static ID = VIEWLET_ID;
	static LABEL = localize('toggleChecklistViewlet', "Show Checklist");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

const viewletDescriptor = new ViewletDescriptor(
	ChecklistViewlet,
	VIEWLET_ID,
	localize('checklist', "Checklist"),
	'checklist',
	95
);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets)
	.registerViewlet(viewletDescriptor);

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(StatusUpdater, LifecyclePhase.Running);
workbenchRegistry.registerWorkbenchContribution(DiagnosticsChecklistProvider, LifecyclePhase.Running);

// Register Action to Open Viewlet
Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(OpenChecklistViewletAction, VIEWLET_ID, localize('toggleChecklistViewlet', "Show Checklist"), {
		primary: null,
		win: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_A },
		linux: { primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_A },
		mac: { primary: KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KEY_A }
	}),
	'View: Show Checklist',
	localize('view', "View")
);
