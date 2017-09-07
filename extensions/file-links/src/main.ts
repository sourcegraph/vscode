/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as path from 'path';

const localize = nls.loadMessageBundle();

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('file-links.goToGitHub', (arg?: vscode.Uri) => {
			const args = getSourceControl(arg);
			if (!args) {
				return;
			}
			const { resource, sourceControl } = args;

			if (sourceControl.remoteResources) {
				for (let remote of sourceControl.remoteResources) {
					remote = normalizeRemoteURL(remote);
					if (remote.authority === 'github.com') {
						const { repo, path, revision } = parseGitHubRepo(resource, remote, sourceControl);

						return vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`https://${repo}/blob/${encodeURIComponent(revision)}/${path}`));
					}
				}
			}

			return vscode.window.showErrorMessage(localize('unableToOpenOnGitHub', "Unable to open on GitHub.com: the active document is not from a GitHub.com repository."));
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('file-links.goToSourcegraph', (arg?: vscode.Uri) => {
			const args = getSourceControl(arg);
			if (!args) {
				return;
			}
			const { resource, sourceControl } = args;

			if (sourceControl.remoteResources) {
				for (let remote of sourceControl.remoteResources) {
					remote = normalizeRemoteURL(remote);
					if (remote.authority === 'github.com') {
						const { repo, path, revision } = parseGitHubRepo(resource, remote, sourceControl);
						return vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`https://sourcegraph.com/${repo}@${encodeURIComponent(revision)}/-/blob/${path}`));
					}
				}
			}

			return vscode.window.showErrorMessage(localize('unableToOpenOnSourcegraph', "Unable to open on Sourcegraph: the active document is not from a recognized repository."));
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('file-links.addResourceRoot', (arg?: vscode.Uri) => {
			if (!vscode.workspace.workspaceFolders) {
				vscode.window.showErrorMessage(localize('nonMultiRootWorkspace', "Must be in a multi-root workspace."));
				return;
			}

			const args = getSourceControl(arg);
			if (!args) {
				return;
			}
			const { resource, sourceControl } = args;


			if (!sourceControl.rootFolder) {
				vscode.window.showErrorMessage(localize('noRootFolder', "Unable to determine the repository's root folder."));
				return;
			}

			vscode.commands.executeCommand('_workbench.addRoots', [sourceControl.rootFolder]).then(
				() => void 0,
				err => {
					vscode.window.showErrorMessage(localize('addRootsFailed', "Adding root folder {0} failed: {1}.", sourceControl!.toString(), err));
				},
			);
		}),
	);
}

function getSourceControl(resource: vscode.Uri | undefined): { resource: vscode.Uri, sourceControl: vscode.SourceControl } | undefined {
	if (!resource) {
		resource = guessResource();
	}
	if (!resource) {
		vscode.window.showErrorMessage(localize('noActiveDocument', "Open a document before running this action."));
		return;
	}

	const sourceControl = vscode.scm.getSourceControlForResource(resource);
	if (!sourceControl) {
		vscode.window.showErrorMessage(localize('noActiveSourceControl', "Unable to determine the repository containing {0}", path.basename(resource.path)));
		return;
	}
	return { resource, sourceControl };
}

function guessResource(): vscode.Uri | undefined {
	if (vscode.window.activeTextEditor) {
		return vscode.window.activeTextEditor.document.uri;
	}
	if (vscode.window.visibleTextEditors.length === 0 && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1) {
		return vscode.workspace.workspaceFolders[0].uri;
	}
	return;
}

function normalizeRemoteURL(remote: vscode.Uri): vscode.Uri {
	const host = remote.authority && remote.authority.includes('@') ? remote.authority.slice(remote.authority.indexOf('@') + 1) : remote.authority; // remove userinfo from URI
	return remote.with({ authority: host, path: remote.path.replace(/\.git$/, '') });
}

function parseGitHubRepo(resource: vscode.Uri, remote: vscode.Uri, sourceControl: vscode.SourceControl): { repo: string, path: string, revision: string } {
	// GitHub repositories always have 2 path components after the hostname.
	const repo = remote.authority + remote.path.split('/', 3).join('/');
	const filePath = sourceControl.rootFolder ? path.relative(sourceControl.rootFolder.fsPath, resource.fsPath) : '';
	const revision = sourceControl.revision && sourceControl.revision.id ? sourceControl.revision.id : 'HEAD';
	return { repo, path: filePath, revision };
}
