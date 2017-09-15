/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * This file is a modified copy of code from https://github.com/Microsoft/vscode-go
 * (revision: 9618aa0406151abc092ce778e44f15d24fc27a19).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import cp = require('child_process');
import path = require('path');
import os = require('os');

/**
 * Returns the Go package defined by @param dir.
 */
export function getPackage(dir: string): Promise<string | null> {
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
