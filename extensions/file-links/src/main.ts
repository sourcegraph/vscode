/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('file-links.goToGitHub', () => {
			const link = getGitHubLink();
			vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(link));
		}),
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('file-links.goToImmutableRevision', () => {
			const revision = vscode.scm.activeProvider.revision;
			if (!revision || !revision.id) {
				vscode.window.showErrorMessage('Unable to determine immutable revision.');
				return;
			}
			const origSpecifier = revision.rawSpecifier || revision.specifier;
			return vscode.scm.activeProvider.setRevision({ rawSpecifier: revision.id }).then(
				() => vscode.window.setStatusBarMessage('Resolved ' + origSpecifier + ' to ' + revision.id, 3000),
			);
		}),
	);
}

function getGitHubLink(): string {
	const uri = vscode.window.activeTextEditor.document.uri;
	let { workspace, revisionSpecifier, relativePath } = vscode.workspace.extractResourceInfo(uri);
	if (!revisionSpecifier) {
		revisionSpecifier = vscode.scm.activeProvider.revision.rawSpecifier;
	}
	const workspaceURI = vscode.Uri.parse(workspace);
	return `https://${workspaceURI.authority}${workspaceURI.path}/blob/${revisionSpecifier ? encodeURIComponent(revisionSpecifier) : 'HEAD'}/${relativePath}`;
}