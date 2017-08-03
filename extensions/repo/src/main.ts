/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { Workspace } from './workspace';
import { IRepoExtension, IRepository } from './api';
import { toRelativePath } from './util';
import { isRepoResource } from './repository';

export function activate(context: vscode.ExtensionContext): IRepoExtension {
	const workspace = new Workspace(context.workspaceState);
	context.subscriptions.push(workspace);

	return {
		getRepository: (resource: vscode.Uri): IRepository | undefined => {
			return workspace.getRepository(resource) || undefined;
		},
		resolveResourceRevision: (resource: vscode.Uri): Thenable<vscode.SCMRevision | undefined> => {
			const repo = workspace.getRepository(resource);
			if (!repo) {
				return Promise.resolve(undefined);
			}

			return repo.resolvedRevision;
		},
		toRelativePath,
		isRepoResource,
	};
}
