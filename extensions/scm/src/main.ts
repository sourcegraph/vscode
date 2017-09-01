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

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(createLogger());

	context.subscriptions.push(createBlameStatusBarItem());
	context.subscriptions.push(createBlameLine());
	context.subscriptions.push(createBlameFile());

	context.subscriptions.push({ dispose: disposeRepositories });
}

export interface ISCMExtensionConfiguration {
	debug: boolean;
	blame: {
		file: boolean;
		lines: boolean;
	};
}