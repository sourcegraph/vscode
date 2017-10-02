/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export function activate(context: vscode.ExtensionContext): void {
	vscode.commands.registerCommand('gitlab.checkAccessToken', async (args) => {
		return checkgitlabToken();
	});

	vscode.commands.registerCommand('gitlab.showCreateAccessTokenWalkthrough', async (skipInfoMessage) => {
		return await showCreategitlabTokenWalkthrough(skipInfoMessage);
	});
}

function parsegitlabRepositoryFullName(cloneUrl: vscode.Uri): { owner: string, name: string } | undefined {
	const parts = cloneUrl.path.slice(1).replace(/\.git$/, '').split('/');
	if (parts.length === 2) {
		return { owner: parts[0], name: parts[1] };
	}
	return undefined;
}

function resourceToNameAndOwner(resource: vscode.Uri): { owner: string, name: string } {
	const parts = resource.path.replace(/^\/repository\//, '').split('/');
	return { owner: parts[0], name: parts[1] };
}

/**
 * Close quickopen and pass along the error so that the user sees it immediately instead
 * of only when they close the quickopen (which probably isn't showing any results because of
 * the error).
 */
function showErrorImmediately<T>(error: string): T | Thenable<T> {
	return vscode.commands.executeCommand('workbench.action.closeQuickOpen').then(() => vscode.commands.executeCommand('workbench.action.closeMessages').then(() => {
		const resetTokenItem: vscode.MessageItem = { title: localize('resetToken', "Reset Token") };
		const cancelItem: vscode.MessageItem = { title: localize('cancel', "Cancel"), isCloseAffordance: true };
		vscode.window.showErrorMessage(error, resetTokenItem, cancelItem)
			.then(async (value) => {
				if (value === resetTokenItem) {
					const hasToken = vscode.workspace.getConfiguration('gitlab').get<string>('token');
					if (hasToken) {
						await vscode.workspace.getConfiguration('gitlab').update('token', undefined, vscode.ConfigurationTarget.Global);
					}
					if (checkgitlabToken()) {
						showCreategitlabTokenWalkthrough(); // will walk the user through recreating the token
					}
				}
			});

		return Promise.reject(error);
	}));
}

/**
 * Shows the gitlab token creation walkthrough and returns if a gitlab token was added.
 */
async function showCreategitlabTokenWalkthrough(skipInfoMessage?: boolean): Promise<boolean> {
	// Close quickopen so the user sees our message.
	await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
	await vscode.commands.executeCommand('workbench.action.closeMessages');

	const createTokenItem: vscode.MessageItem = { title: localize('createToken', "Create Token on gitlab.com") };
	const enterTokenItem: vscode.MessageItem = { title: localize('enterToken', "Enter Token") };
	const cancelItem: vscode.MessageItem = { title: localize('cancel', "Cancel"), isCloseAffordance: true };
	if (skipInfoMessage) {
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://gitlab.com/profile/personal_access_tokens'));
	} else {
		const value = await vscode.window.showInformationMessage(
			localize('nogitlabToken', "A GitLab personal access token is required to search for repositories."),
			{ modal: false },
			createTokenItem, enterTokenItem, cancelItem,
		);
		if (value === createTokenItem) {
			await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://gitlab.com/profile/personal_access_tokens'));
		} else if (!value || value === cancelItem) {
			return false;
		}
	}

	const token = await vscode.window.showInputBox({
		prompt: localize('tokenPrompt', "GitLab Personal Access Token (with 'api' scope)"),
		ignoreFocusOut: true,
	});
	if (token) {
		await vscode.workspace.getConfiguration('gitlab').update('token', token, vscode.ConfigurationTarget.Global);
		return true;
	}
	return false;
}

/**
 * Checks if the user has a gitlab token configured.
 */
function checkgitlabToken(): boolean {
	return !!vscode.workspace.getConfiguration('gitlab').get<string>('token');
}

function iconForRepo(repo: { isPrivate: boolean, isFork: boolean, isMirror: boolean }) {
	if (repo.isPrivate) {
		return 'lock';
	}
	if (repo.isFork) {
		return 'repo-forked';
	}
	if (repo.isMirror) {
		return 'mirror';
	}
	return 'repo';
}