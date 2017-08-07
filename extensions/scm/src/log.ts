/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

let debugOutputChannel: vscode.OutputChannel | undefined;

export function create(): vscode.Disposable {
	const disposables: vscode.Disposable[] = [];

	disposables.push({
		dispose: () => {
			if (debugOutputChannel) {
				debugOutputChannel.dispose();
				debugOutputChannel = undefined;
			}
		},
	});

	const update = () => {
		const debug = vscode.workspace.getConfiguration('scm').get<boolean>('debug');
		if (debug && !debugOutputChannel) {
			debugOutputChannel = vscode.window.createOutputChannel('SCM');
		} else if (!debug && debugOutputChannel) {
			debugOutputChannel.dispose();
			debugOutputChannel = undefined;
		}
	};
	vscode.workspace.onDidChangeConfiguration(() => update(), null, disposables);
	update();

	return {
		dispose: () => disposables.forEach(d => d.dispose()),
	};
}

export function isEnabled(): boolean {
	return !!vscode.workspace.getConfiguration('scm').get<boolean>('debug');
}

export function debug(message: string): void {
	if (debugOutputChannel) {
		debugOutputChannel.appendLine(message);
	}
}