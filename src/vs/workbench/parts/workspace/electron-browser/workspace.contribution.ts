/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/workspace';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import nls = require('vs/nls');
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { VIEWLET_ID, IFoldersWorkbenchService } from 'vs/workbench/parts/workspace/common/workspace';
import { OpenWorkspaceViewletAction } from 'vs/workbench/parts/workspace/browser/folderActions';
import { IKeybindings } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { FoldersWorkbenchService } from 'vs/workbench/parts/workspace/node/foldersWorkbenchService';

// Singletons
registerSingleton(IFoldersWorkbenchService, FoldersWorkbenchService);

// Register Viewlet
Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	'vs/workbench/parts/workspace/electron-browser/workspaceViewlet',
	'WorkspaceViewlet',
	VIEWLET_ID,
	nls.localize('workspace', "Workspace"),
	'workspace',
	80,
));

const openViewletKb: IKeybindings = {
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_F
};

// Global actions
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(
	new SyncActionDescriptor(OpenWorkspaceViewletAction, OpenWorkspaceViewletAction.ID, OpenWorkspaceViewletAction.LABEL, openViewletKb),
	'View: Show Workspace',
	nls.localize('view', "View")
);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'workspace',
	'order': 11,
	'title': nls.localize('workspaceConfigurationTitle', "Workspace"),
	'type': 'object',
	'properties': {}
});
