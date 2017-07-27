/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('file-links.goToGitHub', (arg?: vscode.Uri) => {
			const args = getSourceControl(arg);
			if (!args) {
				return;
			}
			const { resource, sourceControl } = args;

			let info = vscode.workspace.extractResourceInfo(resource);
			if (!info) {
				vscode.window.showErrorMessage(localize('noRepository', "Unable to determine the GitHub repository for the active document.."));
				return;
			}
			if (!info.revisionSpecifier) {
				if (sourceControl && sourceControl.revision) {
					info.revisionSpecifier = sourceControl.revision.rawSpecifier;
				}
			}
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`https://${info.repo}/blob/${info.revisionSpecifier ? encodeURIComponent(info.revisionSpecifier) : 'HEAD'}/${info.relativePath}`));
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('file-links.goToImmutableRevision', (arg?: vscode.Uri) => {
			const args = getSourceControl(arg);
			if (!args) {
				return;
			}
			const { resource, sourceControl } = args;

			if (!sourceControl.setRevisionCommand) {
				vscode.window.showErrorMessage(localize('setRevisionNotImplemented', "The current source control ({0}) does not support changing the revision.", sourceControl.label));
				return;
			}

			const revision = sourceControl.revision;
			if (!revision || !revision.id) {
				vscode.window.showErrorMessage(localize('noRevision', "Unable to determine immutable revision from source control ({0}).", sourceControl.label));
				return;
			}
			const origSpecifier = revision.rawSpecifier || revision.specifier;
			return vscode.commands.executeCommand(
				sourceControl.setRevisionCommand.command,
				...((sourceControl.setRevisionCommand.arguments || []).concat({ rawSpecifier: revision.id })),
			).then(() => vscode.window.setStatusBarMessage(localize('resolvedMessage', "Resolved {0} to {1}", origSpecifier, revision.id), 3000));
		}),
	);
}

function getSourceControl(resource: vscode.Uri | undefined): { resource: vscode.Uri, sourceControl: vscode.SourceControl } | undefined {
	if (!resource) {
		resource = guessResource();
	}
	if (!resource) {
		vscode.window.showErrorMessage(localize('noActiveDocument', "Open a document to go an immutable revision."));
		return;
	}

	const sourceControl = vscode.scm.getSourceControlForResource(resource);
	if (!sourceControl) {
		vscode.window.showErrorMessage(localize('noActiveSourceControl', "Unable to determine immutable revision because no SCM repository was found."));
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
