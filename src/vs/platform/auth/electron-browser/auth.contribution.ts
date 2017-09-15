/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { SignInAction } from 'vs/platform/auth/node/signInAction';
import { SignOutAction } from 'vs/platform/auth/node/signOutAction';
import { OpenRemoteSettingsAction } from 'vs/platform/auth/node/openRemoteSettingsAction';
import { localize } from 'vs/nls';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(SignInAction, SignInAction.ID, SignInAction.LABEL),
	'Sign in or sign up', localize('remote', "Remote"));

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(SignOutAction, SignOutAction.ID, SignOutAction.LABEL),
	'Sign out', localize('remote', "Remote"));

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions).registerWorkbenchAction(
	new SyncActionDescriptor(OpenRemoteSettingsAction, OpenRemoteSettingsAction.ID, OpenRemoteSettingsAction.LABEL),
	'Manage Sourcegraph account and team settings', localize('remote', "Remote"));
