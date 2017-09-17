/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import path = require('path');
import { getCurrentGoPath, getPackage } from './goenv';

/**
 * Package descriptor
 */
interface PackageInfo {
	pkg: string;
	revision?: string;
}

/**
 * Definition descriptor
 */
interface DefinitionInfo extends PackageInfo {
	fileName: string;
	selection: vscode.Selection;
}

/**
 * Returns the canonical source location(s) of cursor position specified by the URI and selection.
 * The caller should verify the file is a Go file. Otherwise, the behavior is undefined.
 */
export async function getSourceLocation(uri: vscode.Uri, selection: vscode.Selection): Promise<vscode.Location[]> {
	return getDefSourceLocation(await definitionInfo(uri, selection));
}

/**
 * Returns the canonical source location(s) that match the definition metadata descriptor.
 */
async function getDefSourceLocation(defInfo: DefinitionInfo): Promise<vscode.Location[]> {
	if (!vscode.workspace.workspaceFolders) {
		return [];
	}

	const found: vscode.Location[] = [];
	for (const wsFolder of vscode.workspace.workspaceFolders) {
		const pkgDir = workspaceFolderContainsPackage(wsFolder, defInfo);
		if (!pkgDir) {
			continue;
		}
		found.push(new vscode.Location(vscode.Uri.file(path.join(pkgDir, defInfo.fileName)), defInfo.selection));
	}
	return found;
}

/**
 * Returns a metadata descriptor of the definition at the given selection and resource.
 */
async function definitionInfo(resource: vscode.Uri, selection: vscode.Selection): Promise<DefinitionInfo> {
	const [pkg, fileName] = await getPackageAndFile(resource.fsPath);
	const canonicalPkg = packageToCanonicalPackage(pkg);
	return {
		pkg: canonicalPkg,
		fileName: fileName,
		selection: selection,
	};
}

/**
 * If the workspace folder defines a Go package matching the package metadata descriptor,
 * returns the filesystem directory that corresponds to the package or null if the workspace folder
 * does not define the package.
 */
function workspaceFolderContainsPackage(workspaceFolder: vscode.WorkspaceFolder, pkgInfo: PackageInfo): string | null {
	const goPath = getCurrentGoPath();
	for (const goPathRoot of goPath.split(path.delimiter)) {
		const possibleCanonicalPkgDir = path.join(goPathRoot, 'src', pkgInfo.pkg);
		if ((possibleCanonicalPkgDir + path.sep).startsWith(workspaceFolder.uri.fsPath + path.sep)) {
			return possibleCanonicalPkgDir;
		}
	}
	return null;
}

/**
 * Returns the Go package and file basename of the file at the file path.
 */
async function getPackageAndFile(filePath: string): Promise<[string, string]> {
	const pkg = await getPackage(path.dirname(filePath));
	if (!pkg) {
		return Promise.reject('could not extract package from ' + filePath);
	}
	return [pkg, path.basename(filePath)];
}

/**
 * packageToCanonicalPackage converts a raw package name
 * (e.g., sourcegraph.com/sourcegraph/sourcegraph/vendor/github.com/gorilla/mux) to a canonical
 * one (e.g., github.com/gorilla/mux)
 */
function packageToCanonicalPackage(pkg: string) {
	const lastVendorIdx = pkg.lastIndexOf('/vendor/');
	if (lastVendorIdx === -1) {
		return pkg;
	}
	return pkg.substring(lastVendorIdx + '/vendor/'.length);
}
