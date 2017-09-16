/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { walk } from './util';

/**
 * Package descriptor
 */
interface PackageInfo { }

interface DefinitionInfo extends PackageInfo {
	modulePath: string;
	selection: vscode.Selection;
}

export async function getSourceLocation(uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]> {
	const finfo = await definitionInfo(uri, selection);
	return finfo ? getDefSourceLocation(finfo) : [new vscode.Location(uri, selection)];
}

async function getDefSourceLocation(fileInfo: DefinitionInfo): Promise<vscode.Location[]> {
	if (!vscode.workspace.workspaceFolders) {
		return [];
	}

	const matches: vscode.Location[][] = await Promise.all(
		vscode.workspace.workspaceFolders.map(wsFolder => findDefinition(wsFolder, fileInfo))
	);
	const flatMatches: vscode.Location[] = [];
	for (const wsMatches of matches) {
		flatMatches.push(...wsMatches);
	}
	return flatMatches;
}

async function findDefinition(workspaceFolder: vscode.WorkspaceFolder, defInfo: DefinitionInfo): Promise<vscode.Location[]> {
	const moduleBasename = path.basename(defInfo.modulePath);
	const matches: string[] = [];
	await walk(workspaceFolder.uri.fsPath, (filepath, stats) => {
		if (path.basename(filepath) === 'site-packages' && stats.isDirectory()) {
			return false;
		}
		if (path.basename(filepath) === moduleBasename && stats.isFile()) {
			if (filepath.endsWith(defInfo.modulePath)) {
				matches.push(filepath);
			}
		}
		return true;
	});
	return matches.map(m => new vscode.Location(vscode.Uri.file(m), defInfo.selection));
}

/**
 * DRAFT: returns null when file is not an installed dependency
 * uses simple filesystem heuristics (site-packages); test on both virtualenv and system path
 */
async function definitionInfo(uri: vscode.Uri, selection: vscode.Selection): Promise<DefinitionInfo | null> {
	const fsPath = uri.fsPath;
	const i = fsPath.indexOf('site-packages/');
	if (i === -1) {
		return null;
	}
	const remainder = fsPath.substr(i + 'site-packages/'.length);
	let relpathCmps = remainder.split(path.sep);
	if (relpathCmps[0].endsWith('.egg')) {
		relpathCmps = relpathCmps.slice(1);
	}
	const relpath = relpathCmps.join(path.sep);
	return { modulePath: relpath, selection: selection };
}
