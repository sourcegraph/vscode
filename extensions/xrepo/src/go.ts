/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import cp = require('child_process');
import path = require('path');
import os = require('os');

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
 * Returns the canonical source location(s) of cursor position specified by @param srcUri and @param srcSelection.
 * The caller should verify the file is a Go file. Otherwise, the behavior is undefined.
 */
export async function getSourceLocation(uri: vscode.Uri, selection: vscode.Selection): Promise<[vscode.Uri, vscode.Range | undefined][]> {
	return getDefSourceLocation(await definitionInfo(uri, selection));
}

/**
 * Returns the canonical source location(s) that match the metadata descriptor @param defInfo.
 */
async function getDefSourceLocation(defInfo: DefinitionInfo): Promise<[vscode.Uri, vscode.Range | undefined][]> {
	if (!vscode.workspace.workspaceFolders) {
		return [];
	}

	const found: [vscode.Uri, vscode.Range | undefined][] = [];
	for (const wsFolder of vscode.workspace.workspaceFolders) {
		const pkgDir = workspaceFolderContainsPackage(wsFolder, defInfo);
		if (!pkgDir) {
			continue;
		}
		found.push([vscode.Uri.file(path.join(pkgDir, defInfo.fileName)), defInfo.selection]);
	}
	return found;
}

/**
 * Returns a metadata descriptor of the definition at the given @param selection in @param resource.
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
 * If @param workspaceFolder defines a Go package matching the metadata descriptor @param pkgInfo,
 * returns the filesystem directory that corresponds to the package or null if @param workspaceFolder
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
 * Returns the Go package and file basename of the file at @param filePath.
 */
async function getPackageAndFile(filePath: string): Promise<[string, string]> {
	const pkg = await getPackage(path.dirname(filePath));
	if (!pkg) {
		return Promise.reject('could not extract package from ' + filePath);
	}
	return [pkg, path.basename(filePath)];
}

/**
 * packageToCanonicalPackage converts a raw package name (e.g., sourcegraph.com/sourcegraph/sourcegraph/vendor/github.com/gorilla/mux) to a canonical
 * one (e.g., github.com/gorilla/mux)
 */
function packageToCanonicalPackage(pkg: string) {
	const lastVendorIdx = pkg.lastIndexOf('/vendor/');
	if (lastVendorIdx === -1) {
		return pkg;
	}
	return pkg.substring(lastVendorIdx + '/vendor/'.length);
}

/**
 * Returns the Go package defined by @param dir.
 */
function getPackage(dir: string): Promise<string | null> {
	let goRuntimePath = getGoRuntimePath();

	if (!goRuntimePath) {
		vscode.window.showInformationMessage('Cannot find "go" binary. Update PATH or GOROOT appropriately');
		return Promise.resolve(null);
	}

	return new Promise<string>((resolve, reject) => {
		// Use `{env: {}}` to make the execution faster. Include GOPATH to account if custom work space exists.
		const env: any = getToolsEnvVars();

		const cmd = cp.spawn(goRuntimePath, ['list', '-f', '{{.ImportPath}}', '.'], { env: env, cwd: dir });
		const chunks: any[] = [];
		cmd.stdout.on('data', (d) => {
			chunks.push(d);
		});

		cmd.on('close', (status) => {
			return resolve(chunks.join('').trim());
		});
	});
}

let runtimePathCache: string = '';

/**
 * Returns Go runtime binary path.
 *
 * @return the path to the Go binary.
 */
export function getGoRuntimePath(): string {
	if (runtimePathCache) { return runtimePathCache; }
	let correctBinNameGo = correctBinname('go');
	if (process.env['GOROOT']) {
		let runtimePathFromGoRoot = path.join(process.env['GOROOT'], 'bin', correctBinNameGo);
		if (fileExists(runtimePathFromGoRoot)) {
			runtimePathCache = runtimePathFromGoRoot;
			return runtimePathCache;
		}
	}

	if (process.env['PATH']) {
		let pathparts = (<string>process.env.PATH).split(path.delimiter);
		runtimePathCache = pathparts.map(dir => path.join(dir, correctBinNameGo)).filter(candidate => fileExists(candidate))[0];
	}
	if (!runtimePathCache) {
		let defaultPathForGo = process.platform === 'win32' ? 'C:\\Go\\bin\\go.exe' : '/usr/local/go/bin/go';
		if (fileExists(defaultPathForGo)) {
			runtimePathCache = defaultPathForGo;
		}
	}
	return runtimePathCache;
}

function fileExists(filePath: string): boolean {
	try {
		return fs.statSync(filePath).isFile();
	} catch (e) {
		return false;
	}
}

function correctBinname(binname: string) {
	if (process.platform === 'win32') {
		return binname + '.exe';
	} else {
		return binname;
	}
}

export function getToolsEnvVars(): any {
	let toolsEnvVars = vscode.workspace.getConfiguration('go')['toolsEnvVars'];

	let gopath = getCurrentGoPath();

	let envVars = Object.assign({}, process.env, gopath ? { GOPATH: gopath } : {});

	if (!toolsEnvVars || typeof toolsEnvVars !== 'object' || Object.keys(toolsEnvVars).length === 0) {
		return envVars;
	}
	return Object.assign(envVars, toolsEnvVars);
}

export function getCurrentGoPath(resource?: vscode.Uri): string {
	let inferredGopath = getInferredGopath();
	let configGopath = vscode.workspace.getConfiguration('go', resource)['gopath'];
	return inferredGopath ? inferredGopath : (configGopath ? resolvePath(configGopath, vscode.workspace.rootPath) : process.env['GOPATH']);
}

function getInferredGopath(): string | undefined {
	let inferGoPath = vscode.workspace.getConfiguration('go')['inferGopath'];
	if (inferGoPath && vscode.workspace.rootPath) {
		let dirs = vscode.workspace.rootPath.toLowerCase().split(path.sep);
		// find src directory closest to workspace root
		let srcIdx = dirs.lastIndexOf('src');

		if (srcIdx > 0) {
			return vscode.workspace.rootPath.substr(0, dirs.slice(0, srcIdx).join(path.sep).length);
		}
	}
}

/**
 * Expands ~ to homedir in non-Windows platform and replaces ${workspaceRoot} token with given workspaceroot
 */
export function resolvePath(inputPath: string, workspaceRoot?: string): string {
	if (!inputPath || !inputPath.trim()) { return inputPath; }
	if (workspaceRoot) {
		inputPath = inputPath.replace(/\${workspaceRoot}/g, workspaceRoot);
	}
	return inputPath.startsWith('~') ? path.join(os.homedir(), inputPath.substr(1)) : inputPath;
}
