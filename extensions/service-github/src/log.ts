/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { toDisposable } from './util';

let outputChannel: vscode.OutputChannel | undefined;

/**
 * Lazily create the output channel.
 */
export function initialize(): vscode.Disposable {
	return toDisposable(() => {
		if (outputChannel) {
			outputChannel.dispose();
			outputChannel = undefined;
		}
	});
}

export function print(message: string): void {
	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('GitHub');
	}
	outputChannel.appendLine(message);
}

export function debug(message: string): void {
	if (vscode.workspace.getConfiguration('github').get<boolean>('debug')) {
		print(message);
	}
}