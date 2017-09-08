/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import nls = require('vs/nls');
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { FocusLocationBarAction } from 'vs/workbench/browser/parts/navbar/navbarActions';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';

const viewCategory = nls.localize('view', "View");
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(FocusLocationBarAction, FocusLocationBarAction.ID, FocusLocationBarAction.LABEL, { primary: KeyMod.CtrlCmd | KeyCode.KEY_L }), 'Nav: Focus on Location Bar', viewCategory);
