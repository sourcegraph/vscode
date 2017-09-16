/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import * as rimraf from 'rimraf';
import * as nls from 'vscode-nls';
import * as os from 'os';
import { mkdirp } from './util';
import { Repository } from './repository';
import { readFile, writeFile, execFile, pathExists } from './nodeutil';
import { getCurrentGoPath, getGoRuntimePath, getToolsEnvVars } from './goenv';

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
	const removals: Promise<void>[] = [];
	for (const removed of e.removed) {
		if (isTempWorkspaceFolder(removed)) {
			const choice = await vscode.window.showInformationMessage(localize('deleteDirectoryContainingWorktreeWorkspaceFolder', "Delete directory containing the worktree workspace folder you just removed?"), deleteWord);
			if (choice !== deleteWord) {
				continue;
			}
			const relpath = path.relative(tmpRoot, removed.uri.fsPath);
			const firstCmp = relpath.split(path.sep)[0];
			removals.push(new Promise<void>((resolve, reject) => rimraf(path.join(tmpRoot, firstCmp), (err) => err ? reject(err) : resolve())));
		}
	}
	await Promise.all(removals);
}

/**
 * Returns a temporary folder keyed by a value. If a temporary directory with that key already
 * exists, returns the existing one; otherwise creates a new one. Temp folders are always immediate children
 * of the tmpRoot directory.
 */
export async function getTempDirectory(key: string): Promise<string> {
	const tmpPath = path.join(tmpRoot, key.replace(new RegExp('[' + path.sep + path.delimiter + ']', 'g'), '-'));
	await mkdirp(tmpPath);
	return tmpPath;
}

/**
 * setUpGoConfiguration sets the `go.gopath` value in `.vscode/settings.json` in the new workspace folder, taking into account the configuration of the
 * source repository, to make the vscode-go plugin work. Local jump-to-definition should occur within the new workspace folder while external
 * jump-to-definition should work as in the original workspace folder.
 */
export async function setUpGoConfiguration(srcRepo: Repository, tempDir: string, workspaceRoot: string) {
	const workspaceSettingsPath = path.join(workspaceRoot, '.vscode', 'settings.json');
	if (await pathExists(workspaceSettingsPath)) {
		const data = await readFile(workspaceSettingsPath, 'utf8');
		const settings = JSON.parse(data);
		if (settings['go.gopath']) {
			settings['go.gopath'] = [tempDir, settings['go.gopath']].join(path.delimiter);
		} else {
			settings['go.gopath'] = tempDir;
		}
		await writeFile(workspaceSettingsPath, JSON.stringify(settings), 'utf8');
	} else {
		const currentGoPath = getCurrentGoPath(vscode.Uri.file(srcRepo.root));
		await mkdirp(path.dirname(workspaceSettingsPath));
		const settings = { 'go.gopath': [tempDir, currentGoPath].join(path.delimiter) };
		await writeFile(workspaceSettingsPath, JSON.stringify(settings), 'utf8');
	}
}

/**
 * Returns the Go package prefix of a directory.
 */
export async function getGoPackagePrefix(dir: string): Promise<string | null> {
	const goRuntimePath = getGoRuntimePath();
	if (!goRuntimePath) {
		return null;
	}

	const env: any = getToolsEnvVars();
	let out: string;
	try {
		[out] = await execFile(
			goRuntimePath,
			['list', '-f', '[{{ printf "%q" .ImportPath }}, {{ printf "%q" .Dir }}]', './...'],
			{ env: env, cwd: dir },
		);
	} catch (e) {
		return null;
	}
	const lines = out.trim().split(/\r?\n/);
	for (const line of lines) {
		let pkgAndDir;
		try {
			pkgAndDir = JSON.parse(line);
		} catch {
			continue;
		}
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

function isTempWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder): boolean {
	return workspaceFolder.uri.fsPath.startsWith(tmpRoot + path.sep);
}
