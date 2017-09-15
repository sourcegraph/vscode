/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

interface PackageInfo {
	package: string;
	version?: string;
}

interface DefinitionInfo extends PackageInfo {
	filePath: string;
	selection: vscode.Selection;
}


export async function getSourceLocation(uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]> {
	return [];
}

async function getDefSourceLocation(defInfo: DefinitionInfo): Promise<vscode.Location[]> {
	return []
}

async function defInfo(uri: vscode.Uri, selection: vscode.Selection): Promise<DefinitionInfo | null> {
	return null;
}

async function findDefinition(workspaceFolder: vscode.WorkspaceFolder, defInfo: DefinitionInfo): Promise<vscode.Location[]> {
	return [];
}