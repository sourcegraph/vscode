/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { Workspace } from './workspace';

export function activate(context: vscode.ExtensionContext): void {
	const workspace = new Workspace(context.workspaceState);
	context.subscriptions.push(workspace);
}
