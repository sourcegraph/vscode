/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as path from 'path';
import { PackageQuery, PackageData } from './types';
import * as go from './go';
import * as typescript from './typescript';
import * as python from './python';

const localize = nls.loadMessageBundle();

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('xrepo.downloadDependents', downloadDependents));
}

export async function downloadDependents(workspaceFolder?: vscode.WorkspaceFolder) {
	if (!workspaceFolder && vscode.window.activeTextEditor) {
		workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
	}
	if (!workspaceFolder && vscode.workspace.workspaceFolders) {
		const wsFolders = vscode.workspace.workspaceFolders;
		const options = wsFolders.map(f => {
			return {
				label: path.basename(f.uri.fsPath),
				description: f.uri.fsPath,
			};
		});
		const choice = await vscode.window.showQuickPick(options, {
			placeHolder: localize('selectFolder', "Select a folder"),
		});
		if (!choice) {
			return;
		}
		workspaceFolder = wsFolders.find(f => f.uri.fsPath === choice.description);
	}
	if (!workspaceFolder) {
		vscode.window.showErrorMessage(localize('noWorkspaceFolders', "Cannot download dependents, because there are no folders in your workspace"));
		return;
	}
	await downloadDependentsForWorkspaceFolder(workspaceFolder);
}

async function downloadDependentsForWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder) {
	const packages = (await getPackages(workspaceFolder.uri.fsPath)).map(p => {
		return {
			label: p.toDisplayString(),
			description: '',
			lang: p.lang,
			packageInfo: p.packageInfo,
		};
	});
	if (packages.length === 0) {
		vscode.window.showWarningMessage(localize('foundNoDependablePackages', "Found no packages that can be depended on in {0}", workspaceFolder.uri.fsPath));
		return;
	}
	let pkgChoice: PackageQuery | undefined;
	if (packages.length === 1) {
		pkgChoice = packages[0];
	} else {
		pkgChoice = await vscode.window.showQuickPick(packages, { placeHolder: localize('selectPackage', "Select a package") });
		if (!pkgChoice) {
			return;
		}
	}

	const depRepos = await findDependents(pkgChoice);
	if (depRepos.length === 0) {
		vscode.window.showWarningMessage(localize('noDependentsFound', "No dependents were found"));
		return;
	}
	const chosenRepo = await vscode.window.showQuickPick(depRepos, { placeHolder: localize('chooseRepoToClone', "Found dependent repositories. Select one to clone.") });
	return vscode.commands.executeCommand('git.clone', chosenRepo);
}

interface Dep {
	repo?: {
		uri: string
	};
}

/**
 * Finds and returns a list of clone URLs of repositories that depend on the specified build package.
 */
async function findDependents(pkg: PackageQuery): Promise<string[]> {
	const dependents = (await vscode.commands.executeCommand('_workbench.getDependents', pkg.lang, pkg.packageInfo)) as Dep[];
	const dependentRepos = new Set<string>(dependents.filter(d => d.repo).map(d => d.repo!.uri));
	return Array.from(dependentRepos).map(r => repoURIToCloneURL(r)).filter(r => r) as string[];
}

function repoURIToCloneURL(repoURI: string): string | null {
	if (repoURI.startsWith('github.com/')) {
		return 'https://' + repoURI;
	}
	return null;
}

interface PackageQueryQuickPickItem extends vscode.QuickPickItem {
	packageQuery: PackageQuery;
}

/**
 * DRAFT: all packages defined underneath dir
 */
async function getPackages(dir: string): Promise<PackageData[]> {
	const pkgs: PackageData[] = [];
	for (const langPkgs of await Promise.all([go.getPackages(dir), typescript.getPackages(dir), python.getPackages(dir)])) {
		pkgs.push(...langPkgs);
	}
	return pkgs;
}
