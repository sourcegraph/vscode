/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as rimraf from 'rimraf';
import * as nls from 'vscode-nls';
import { mkdirp } from './util';
import os = require('os');

const localize = nls.loadMessageBundle();
const tmpRoot = path.join(os.homedir(), '.sourcegraph', 'temp-workspace-roots');
const deleteWord = localize('delete', "Delete");

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(onDidChangeWorkspaceFolders));
}

/**
 * Handles removal of temp folders from disk when the corresponding workspace folder is removed from the workspace.
 */
async function onDidChangeWorkspaceFolders(e: vscode.WorkspaceFoldersChangeEvent) {
	for (const removed of e.removed) {
		if (removed.uri.fsPath.startsWith(tmpRoot + path.sep)) {
			const choice = await vscode.window.showInformationMessage(localize('deleteDirectoryContainingWorktreeWorkspaceFolder', "Delete directory containing the worktree workspace folder you just removed?"), deleteWord);
			if (choice !== deleteWord) {
				continue;
			}
			const relpath = path.relative(tmpRoot, removed.uri.fsPath);
			const firstCmp = relpath.split(path.sep)[0];
			await new Promise<void>((resolve, reject) => rimraf(path.join(tmpRoot, firstCmp), (err) => err ? reject(err) : resolve()));
		}
	}
}

/**
 * Returns a temporary folder keyed by @param key. If a temporary directory with that key already
 * exists, returns the existing one; otherwise creates a new one. Temp folders are always immediate children
 * of the tmpRoot directory.
 */
export async function getTempDirectory(key: string): Promise<string> {
	const tmpPath = path.join(tmpRoot, key.replace(new RegExp('[' + path.sep + path.delimiter + ']', 'g'), '-'));
	await mkdirp(tmpPath);
	return tmpPath;
}

/**
 * Returns the Go package prefix of @param dir.
 */
export async function getGoPackagePrefix(dir: string): Promise<string | null> {
	const goRuntimePath = getGoRuntimePath();
	if (!goRuntimePath) {
		return Promise.resolve(null);
	}

	const env: any = getToolsEnvVars();
	const out = await new Promise<string>((resolve, reject) => cp.execFile(goRuntimePath, ['list', '-f', '[{{ printf "%q" .ImportPath }}, {{ printf "%q" .Dir }}]', './...'], { env: env, cwd: dir }, (err, stdout) => err ? reject(err) : resolve(stdout)));
	const lines = out.split(/\r?\n/);
	for (const line of lines) {
		const pkgAndDir = JSON.parse(line);
		if (!Array.isArray(pkgAndDir) || pkgAndDir.length !== 2) {
			continue;
		}
		const [pkg, pkgDir] = pkgAndDir;
		if (typeof (pkg) !== 'string' || typeof (pkgDir) !== 'string') {
			continue;
		}
		const relDir = path.relative(dir, pkgDir);
		if (!pkg.endsWith(relDir)) {
			continue;
		}
		return pkg.substring(0, pkg.length - relDir.length);
	}
	return null;
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

export function getCurrentGoPath(): string {
	let inferredGopath = getInferredGopath();
	let configGopath = vscode.workspace.getConfiguration('go')['gopath'];
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
