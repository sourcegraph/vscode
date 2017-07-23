/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { activateLSP } from './client';
import { activateLanguageSupportParts } from './languageSupportParts';

export function activate(context: vscode.ExtensionContext): void {
	if (!vscode.workspace.rootPath) {
		return;
	}
	context.subscriptions.push(activateLSP());
	context.subscriptions.push(activateLanguageSupportParts());
}
