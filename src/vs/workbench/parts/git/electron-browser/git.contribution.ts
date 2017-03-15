/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { Registry } from 'vs/platform/platform';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actionRegistry';
import SCMPreview from 'vs/workbench/parts/scm/browser/scmPreview';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

// TODO@joao: remove
class OpenScmViewletAction extends ToggleViewletAction {

	static ID = 'workbench.view.git'; // fake redirect
	static LABEL = localize('toggleSCMViewlet', "Show SCM");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService, @IWorkbenchEditorService editorService: IWorkbenchEditorService) {
		super(id, label, 'workbench.view.scm', viewletService, editorService);
	}
}

if (SCMPreview.enabled) {
	Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions)
		.registerWorkbenchAction(new SyncActionDescriptor(OpenScmViewletAction, OpenScmViewletAction.ID, OpenScmViewletAction.LABEL), 'View: Show SCM', 'View');
}
