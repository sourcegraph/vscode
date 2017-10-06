/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { VSCodeMigrateAction } from 'vs/workbench/parts/welcome/migrate/electron-browser/migrate';

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(VSCodeMigrateAction, VSCodeMigrateAction.ID, VSCodeMigrateAction.LABEL), 'Migrate Extensions and User Settings from Visual Studio Code');
