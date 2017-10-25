/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Gitlab, GITLAB_SCHEME } from './GitlabViewer';
import * as cp from 'child_process';

const localize = nls.loadMessageBundle();
let vsCodeContext: vscode.ExtensionContext;
let gitlab: Gitlab;

export function activate(context: vscode.ExtensionContext): void {
	gitlab = new Gitlab();
	vsCodeContext = context;

	context.subscriptions.push(vscode.workspace.registerResourceResolutionProvider(GITLAB_SCHEME, {
		resolveResource(resource: vscode.Uri): Promise<vscode.Uri> {
			return gitlab.createCloneUrl(resource);
		}
	}));

	vscode.commands.registerCommand('gitlab.checkAccessToken', () => {
		return checkGitlabToken();
	});

	vscode.commands.registerCommand('gitlab.showCreateAccessTokenWalkthrough', (skipInfoMessage) => {
		return showCreateGitlabTokenWalkthrough(gitlab, skipInfoMessage);
	});

	// It is not possible to register the folder catalog provider without the correct host. So we need
	// to check if the host is already set.
	const host = vscode.workspace.getConfiguration('gitlab').get<string>('host');

	if (host) {
		setFolderCatalogProvider(host);
	}
}

function setFolderCatalogProvider(host: string) {

	// We have to make sure that the host does not contain the scheme. If so it will cause errors when trying to display
	// the catalog folders.
	const authority = vscode.Uri.parse(host).authority;

	vsCodeContext.subscriptions.push(vscode.workspace.registerFolderCatalogProvider(vscode.Uri.parse(`gitlab://${authority}`), {
		resolveFolder(resource: vscode.Uri): Thenable<vscode.CatalogFolder> {
			const owner = resourceToNameAndOwner(resource);

			return gitlab.repository(owner.owner, owner.name);
		},
		async resolveLocalFolderResource(path: string): Promise<vscode.Uri | null> {
			let gitURL = await new Promise<string>((resolve, reject) => {
				cp.exec('git ls-remote --get-url', { cwd: path }, (error, stdout, stderr) => resolve(stdout || ''));
			});

			gitURL = decodeURIComponent(gitURL.trim()).replace(/\.git$/, '');

			const match = gitURL.match(`/${authority}[\/:]([^/]+)\/([^/]+)/`);

			if (match) {
				return gitlab.nameAndOwnerToResource(match[1], match[2]);
			}

			return null;
		},
		async search(query: string): Promise<vscode.CatalogFolder[]> {
			const token = checkGitlabToken();
			if (!token) {
				const ok = await showCreateGitlabTokenWalkthrough(gitlab);
				if (!ok) {
					return [];
				}
			}

			if (query) {
				return gitlab.search(query);
			}

			return gitlab.repositories();
		}
	}));
}

/**
 * Shows the gitlab token creation walkthrough and returns if a gitlab token was added.
 */
async function showCreateGitlabTokenWalkthrough(viewer: Gitlab, skipInfoMessage?: boolean): Promise<boolean> {
	// Close quickopen so the user sees our message.
	await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
	await vscode.commands.executeCommand('workbench.action.closeMessages');


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
			prompt: localize('hostPrompt', "GitLab host is required to search for repositories (defaults to https://www.gitlab.com)"),
			ignoreFocusOut: true,
			value: 'https://www.gitlab.com'
		});

		if (!host) {
			host = 'https://www.gitlab.com';
		}

		if (!host.includes('http')) {
			showErrorImmediatelyAndPromptUserForToken(localize('noScheme', "Host must include the scheme (http or https)."), viewer);
		}

		// We use the Uri.parse function here to check that the host is in a valid format. Also we remove the slash at end of the url
		// if present.
		try {
			host = host.replace(/\/$/, '');
			vscode.Uri.parse(host);
		} catch (error) {
			showErrorImmediatelyAndPromptUserForToken(localize('invalidUrl', `Host must be a valid URL: ${error.message}.`), viewer);
			return false;
		}
	} else if (!value || value === cancelItem) {
		return false;
	}

	if (host) {
		await vscode.workspace.getConfiguration('gitlab').update('host', host, vscode.ConfigurationTarget.Global);
	} else {
		return false;
	}

	const createTokenItem: vscode.MessageItem = { title: localize('createToken', `Create Token on ${host}`) };
	const url = `${host}/profile/personal_access_tokens`;

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
		prompt: localize('tokenPrompt', "GitLab personal access token (with 'api' scope)"),
		ignoreFocusOut: true,
	});
	if (token) {
		await vscode.workspace.getConfiguration('gitlab').update('token', token, vscode.ConfigurationTarget.Global);

		const userinfo = await viewer.user();

		if (userinfo === null) {
			showErrorImmediatelyAndPromptUserForToken(localize('noUser', "Unable to retrieve user from GitLab."), viewer);
			return false;
		}

		// As last we need to set the catalog provider.
		setFolderCatalogProvider(host);

		return true;
	}
	return false;
}

/**
 * Checks if the user has a gitlab token configured.
 */
function checkGitlabToken(): boolean {
	return !!vscode.workspace.getConfiguration('gitlab').get<string>('token');
}

/**
 * Close quickopen and pass along the error so that the user sees it immediately instead
 * of only when they close the quickopen (which probably isn't showing any results because of
 * the error).
 * 
 * This will also prompt the user to reset the token.
 */
async function showErrorImmediatelyAndPromptUserForToken<T>(error: string, viewer: Gitlab): Promise<T> {
	await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
	await vscode.commands.executeCommand('workbench.action.closeMessages');

	const resetTokenItem: vscode.MessageItem = { title: localize('resetToken', "Reset Token") };
	const cancelItem: vscode.MessageItem = { title: localize('cancel', "Cancel"), isCloseAffordance: true };

	const value = await vscode.window.showErrorMessage(error, resetTokenItem, cancelItem);

	if (value === resetTokenItem) {
		const hasToken = vscode.workspace.getConfiguration('gitlab').get<string>('token');
		if (hasToken) {
			await vscode.workspace.getConfiguration('gitlab').update('token', undefined, vscode.ConfigurationTarget.Global);
		}
		if (checkGitlabToken()) {
			showCreateGitlabTokenWalkthrough(viewer); // will walk the user through recreating the token
		}
	}

	return Promise.reject(error);
}

function resourceToNameAndOwner(resource: vscode.Uri): { owner: string, name: string } {
	const parts = resource.path.replace(/^\/repository\//, '').split('/');
	return { owner: parts[0], name: parts[1] };
}