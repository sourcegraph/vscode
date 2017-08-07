/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { create as createBlameStatusBarItem } from './blameStatusBarItem';
import { create as createBlameLine } from './blameLineDecoration';
import { create as createBlameFile } from './blameFileDecoration';
import { create as createLogger } from './log';
import { dispose as disposeRepositories } from './repositoryMap';
import { IRepoExtension } from '../../repo/src/api';

/**
 * The 'repo' extension's public API, guaranteed to be set before we call into other file's
 * functions in our activate function.
 */
export let repoExtension: IRepoExtension;

export function activate(context: vscode.ExtensionContext): void {
	vscode.extensions.getExtension<IRepoExtension>('sourcegraph.repo')!.activate().then(ext => {
		repoExtension = ext;

		context.subscriptions.push(createLogger());

		context.subscriptions.push(createBlameStatusBarItem());
		context.subscriptions.push(createBlameLine());
		context.subscriptions.push(createBlameFile());

		context.subscriptions.push({ dispose: disposeRepositories });
	});
}

export interface ISCMExtensionConfiguration {
	debug: boolean;
	blame: {
		file: boolean;
		lines: boolean;
	};
}