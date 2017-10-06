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
	
	const enterHostItem: vscode.MessageItem = { title: localize('enterHost', "Enter host name.") };

	const value = await vscode.window.showInformationMessage(
		localize('nogitlabHost', "A GitLab host is needed to search for repositories"),
		{ modal: false },
		enterHostItem, cancelItem,
	);
	
	// Display host message
	let host;
	if (value === enterHostItem) {
		host = await vscode.window.showInputBox({
			prompt: localize('hostPrompt', "GitLab host is required to search for repositories (defaults to gitlab.com)"),
			ignoreFocusOut: true,
		});
		
		if(host === undefined) {
			host = 'gitlab.com';
		}
	} else if (!value || value === cancelItem) {
		return false;
	}
	
	if (host) {
		await vscode.workspace.getConfiguration('gitlab').update('host', host, vscode.ConfigurationTarget.Global);
	} else {
		return false;
	}

	const url = `http://${host}/profile/personal_access_tokens`;

	if (skipInfoMessage) {
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
	} else {
		const value = await vscode.window.showInformationMessage(
			localize('nogitlabToken', "A GitLab personal access token is required to search for repositories."),
			{ modal: false },
			createTokenItem, enterTokenItem, cancelItem,
		);
		if (value === createTokenItem) {
			await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
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