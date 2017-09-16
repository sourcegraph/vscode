/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { walk } from './util';

/**
 * Package descriptor. This is empty for now, but is here for consistency with the other languages and
 * will likely be filled in the future as the implementation evolves.
 */
interface PackageInfo { }

/**
 * Definition descriptor
 */
interface DefinitionInfo extends PackageInfo {
	modulePath: string;
	selection: vscode.Selection;
}

/**
 * Returns the canonical source location(s) of cursor position specified by the URI and selection.
 * The caller should verify the file is a Go file. Otherwise, the behavior is undefined.
 */
export async function getSourceLocation(uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]> {
	const finfo = await definitionInfo(uri, selection);
	return finfo ? getDefSourceLocation(finfo) : [new vscode.Location(uri, selection)];
}


/**
 * Returns the canonical source location(s) that match the definition metadata descriptor.
 */
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

/**
 * findDefinition returns the list of definition locations matching a definition metadata descriptor in a workspace folder.
 */
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
 * Returns a metadata descriptor of the definition at the given selection and resource. Returns null
 * when the file is not in an installed dependency. This uses simple filesystem heuristics ("site-packages").
 */
async function definitionInfo(uri: vscode.Uri, selection: vscode.Selection): Promise<DefinitionInfo | null> {
	const fsPathCmps = uri.fsPath.split(path.sep);
	const i = Math.max(fsPathCmps.lastIndexOf('site-packages'), fsPathCmps.lastIndexOf('dist-packages'));
	if (i === -1) {
		return null;
	}
	let relCmps = fsPathCmps.slice(i + 1);
	if (relCmps.length === 0) {
		return null;
	}
	if (relCmps[0].endsWith('.egg')) {
		relCmps = relCmps.slice(1);
	}
	const relpath = relCmps.join(path.sep);
	return { modulePath: relpath, selection: selection };
}
