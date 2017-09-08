/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('xrepo.goToSource', goToSourceFile));
}

async function goToSourceFile(): Promise<any> {
	vscode.window.showWarningMessage('Go to Source File is unsupported for this type of file');
	vscode.commands.executeCommand('_telemetry.publicLog', 'stub:goToSource');
}
