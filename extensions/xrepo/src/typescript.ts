/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { readFile } from './nodeutil';
import { walk } from './util';

/**
 * Pacakge descriptor
 */
interface PackageInfo {
	package: string;
	version?: string;
}

/**
 * Definition descriptor
 */
interface DefinitionInfo extends PackageInfo {
	filePath: string;
	selection: vscode.Selection;
}

/**
 * Returns the canonical source location(s) of cursor position specified by the URI and selection.
 * The caller should verify the file is a Go file. Otherwise, the behavior is undefined.
 */
export async function getSourceLocation(uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]> {
	const defInfo = await definitionInfo(uri, selection);
	return defInfo ? getDefSourceLocation(defInfo) : [new vscode.Location(uri, selection)];
}

/**
 * Returns the canonical source location(s) that match the definition metadata descriptor.
 */
async function getDefSourceLocation(defInfo: DefinitionInfo): Promise<vscode.Location[]> {
	if (!vscode.workspace.workspaceFolders) {
		return [];
	}

	const matches = await Promise.all(
		vscode.workspace.workspaceFolders.map(wsFolder => findDefinition(wsFolder, defInfo))
	);
	const flatMatches = [];
	for (const wsMatches of matches) {
		flatMatches.push(...wsMatches);
	}
	return flatMatches;
}

/**
 * Returns a metadata descriptor of the definition at the given selection and resource.
 */
async function definitionInfo(uri: vscode.Uri, selection: vscode.Selection): Promise<DefinitionInfo | null> {
	const fsPathCmps = uri.fsPath.split(path.sep);
	const i = fsPathCmps.lastIndexOf('node_modules');
	if (i === -1) {
		return null;
	}
	let relCmps = fsPathCmps.slice(i + 1);
	if (relCmps.length > 0 && relCmps[0] === '@types') {
		relCmps = relCmps.slice(1);
	}
	if (relCmps.length < 2) {
		return null;
	}
	const [pkgName, ...filePathCmps] = relCmps;
	return {
		package: pkgName,
		selection: selection,
		filePath: filePathCmps.join(path.sep),
	};
}

/**
 * findDefinition returns the list of definition locations matching a definition metadata descriptor in a workspace folder.
 */
async function findDefinition(workspaceFolder: vscode.WorkspaceFolder, defInfo: DefinitionInfo): Promise<vscode.Location[]> {
	// Find package.json files
	const pkgJsonFiles: string[] = [];
	await walk(workspaceFolder.uri.fsPath, (filepath, stats) => {
		const basename = path.basename(filepath);
		if (basename === 'node_modules' && stats.isDirectory()) {
			return false;
		}
		if (basename === 'package.json' && stats.isFile()) {
			pkgJsonFiles.push(filepath);
		}
		return true;
	});

	const locsByPkg: vscode.Location[][] = await Promise.all(pkgJsonFiles.map(f => findDefinitionInPackage(f, defInfo)));
	const locs = [];
	for (const l of locsByPkg) {
		locs.push(...l);
	}
	return locs;
}

/**
 * findDefinitionInPackage returns the location(s) of the definition in the package defined by the specifice package.json.
 * Currently, this just returns the location of the package.json file if the definition's package name matches the
 * package defined.
 */
async function findDefinitionInPackage(packageJsonFile: string, defInfo: DefinitionInfo): Promise<vscode.Location[]> {
	let metadata;
	try {
		metadata = JSON.parse(await readFile(packageJsonFile, 'utf8'));
	} catch {
		return [];
	}
	if (metadata.name !== defInfo.package) {
		return [];
	}
	return [new vscode.Location(vscode.Uri.file(packageJsonFile), new vscode.Range(0, 0, 0, 0))];
}