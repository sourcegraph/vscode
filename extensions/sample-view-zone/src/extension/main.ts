/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { activate as activateCityList } from './cityList';
import { activate as activateLoremIpsum } from './loremIpsum';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	activateCityList(context);
	activateLoremIpsum(context);

	// Create a view zone upon initial load, for dev convenience.
	if (vscode.workspace.getConfiguration('sampleViewZone').get<boolean>('enabled')) {
		if (vscode.window.activeTextEditor) {
			const editor = vscode.window.activeTextEditor;
			const range = editor.selection;

			await vscode.commands.executeCommand('sampleViewZone.cityList.create', editor, range);
			await vscode.commands.executeCommand('sampleViewZone.loremIpsum.create', editor, range);

			// Create another city list to demonstrate syncing.
			await vscode.commands.executeCommand('sampleViewZone.cityList.create', editor, range);

			editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
		}
	}
}

