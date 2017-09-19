/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { walk } from './util';
import { pyDepList, SetupPy } from './pydep';
import { PackageData } from './types';

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
 * The caller should verify the file is a Python file. Otherwise, the behavior is undefined.
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

export class PythonPackageData implements PackageData {
	constructor(public lang: string, public packageInfo: { [k: string]: string }, public dependencies?: { [k: string]: string }[]) { }
	toDisplayString(): string {
		return `Python Package: ${this.packageInfo['name']}`;
	}
}

export async function getPackages(dir: string): Promise<PackageData[]> {
	// The Python language server that does the server-side indexing treats language-level packages and modules
	// (using the last path component as the identifier) instead of Pip packages, and we mimic that choice here.
	// In the future, we may want to reconsider.
	const pkgData: PackageData[] = [];
	let setupPys: SetupPy[] | undefined;
	try {
		setupPys = await pyDepList(dir);
	} catch (e) {
		throw new Error(`Failed to compute Python packages: ${e.message}`);
	}
	for (const setupPy of setupPys!) {
		if (setupPy.packages) {
			for (const pkg of setupPy.packages) {
				const cmps = pkg.split('.');
				pkgData.push(new PythonPackageData('python', { name: cmps[cmps.length - 1] }));
			}
		}
		if (setupPy.py_modules) {
			for (const module of setupPy.py_modules) {
				const cmps = module.split('.');
				pkgData.push(new PythonPackageData('python', { name: cmps[cmps.length - 1] }));
			}
		}
		const pipName = setupPy.name || setupPy.project_name;
		if (!setupPy.packages && !setupPy.py_modules && pipName) {
			pkgData.push(new PythonPackageData('python', { name: pipName }));
		}
	}
	return pkgData;
}
