/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { Workspace } from './workspace';

export interface IRemoteExtension {
	getOrCreateSourceControl(remoteRepository: vscode.Uri): vscode.SourceControl | undefined;
}

export function activate(context: vscode.ExtensionContext): IRemoteExtension {
	const workspace = new Workspace(context.workspaceState);
	context.subscriptions.push(workspace);

	return {
		getOrCreateSourceControl: (remoteRepository: vscode.Uri): vscode.SourceControl | undefined => {
			const repo = workspace.getRemoteRepository(remoteRepository);
			return repo ? repo.sourceControl : undefined;
		},
	};
}
