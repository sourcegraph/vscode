/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { GitLab, GITLAB_SCHEME } from './GitlabViewer';
import * as cp from 'child_process';

const localize = nls.loadMessageBundle();
let vsCodeContext: vscode.ExtensionContext;
let gitlab: GitLab;

export function activate(context: vscode.ExtensionContext): void {
	gitlab = new GitLab();
	vsCodeContext = context;

	context.subscriptions.push(vscode.workspace.registerResourceResolutionProvider(GITLAB_SCHEME, {
		resolveResource(resource: vscode.Uri): Promise<vscode.Uri> {
			return gitlab.createCloneUrl(resource);
		}
	}));

	vscode.commands.registerCommand('gitlab.checkAccessToken', () => {
		return checkGitLabToken();
	});

	vscode.commands.registerCommand('gitlab.showCreateAccessTokenWalkthrough', (skipInfoMessage) => {
		return showCreateGitLabTokenWalkthrough(gitlab, skipInfoMessage);
	});

	// It is not possible to register the folder catalog provider without the correct base URL. So we need
	// to check if the URL is already set.
	const url = vscode.workspace.getConfiguration('gitlab').get<string>('url');
	if (url) {
		setFolderCatalogProvider(url);
	}
}

function setFolderCatalogProvider(url: string) {

	// We have to make sure that the URL does not contain the scheme. If so it will cause errors when trying to display
	// the catalog folders.
	const authority = vscode.Uri.parse(url).authority;

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
			const token = checkGitLabToken();

			if (!token && !vscode.workspace.getConfiguration('gitlab').get<boolean>('triggerSetup')) {
				return [];
			}

			if (!token) {
				const ok = await showCreateGitLabTokenWalkthrough(gitlab);
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
 * Shows the GitLab token creation walkthrough and returns if a GitLab token was added.
 */
async function showCreateGitLabTokenWalkthrough(viewer: GitLab, skipInfoMessage?: boolean): Promise<boolean> {
	// Close quickopen so the user sees our message.
	await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
	await vscode.commands.executeCommand('workbench.action.closeMessages');

	const cancelItem: vscode.MessageItem = { title: localize('cancel', "Cancel"), isCloseAffordance: true };
	const enterURLItem: vscode.MessageItem = { title: localize('enterURL', "Enter base URL") };
	const value = await vscode.window.showInformationMessage(
		localize('noGitLabURL', "A GitLab URL is needed to search for repositories"),
		{ modal: false },
		enterURLItem, cancelItem,
	);

	// Display host message
	let baseURL: string | undefined;
	if (value === enterURLItem) {
		baseURL = await vscode.window.showInputBox({
			prompt: localize('hostPrompt', "GitLab host is required to search for repositories (defaults to https://www.gitlab.com)"),
			ignoreFocusOut: true,
			value: vscode.workspace.getConfiguration('gitlab').get<string>('url'),
		});

		if (!baseURL) {
			baseURL = '';
		}

		if (!baseURL.includes('http')) {
			showErrorImmediatelyAndPromptUserForToken(localize('noScheme', "GitLab URL must include the scheme (http or https)."), viewer);
		}

		// We use the Uri.parse function here to check that the URL is in a valid format. Also we remove the slash at end of the url
		// if present.
		try {
			baseURL = baseURL.replace(/\/$/, '');
			const parsed = vscode.Uri.parse(baseURL);
			if (parsed.path !== '/') {
				throw new Error(localize('invalidPath', "Only GitLab URLs with path '/' are supported."));
			}
		} catch (error) {
			showErrorImmediatelyAndPromptUserForToken(localize('invalidUrl', "Invalid GitLab URL: {0}", error.message), viewer);
			return false;
		}
	} else if (!value || value === cancelItem) {
		return false;
	}

	if (baseURL) {
		await vscode.workspace.getConfiguration('gitlab').update('url', baseURL, vscode.ConfigurationTarget.Global);
	} else {
		return false;
	}

	const createTokenItem: vscode.MessageItem = { title: localize('createToken', "Create Token on {0}", baseURL) };
	const url = `${baseURL}/profile/personal_access_tokens`;

	if (skipInfoMessage) {
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(url));
	} else {
		const enterTokenItem: vscode.MessageItem = { title: localize('enterToken', "Enter Token") };
		const value = await vscode.window.showInformationMessage(
			localize('noGitLabToken', "A GitLab personal access token is required to search for repositories."),
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
		setFolderCatalogProvider(baseURL);

		return true;
	}
	return false;
}

/**
 * Checks if the user has a GitLab token configured.
 */
function checkGitLabToken(): boolean {
	return !!vscode.workspace.getConfiguration('gitlab').get<string>('token');
}

/**
 * Close quickopen and pass along the error so that the user sees it immediately instead
 * of only when they close the quickopen (which probably isn't showing any results because of
 * the error).
 *
 * This will also prompt the user to reset the token.
 */
async function showErrorImmediatelyAndPromptUserForToken<T>(error: string, viewer: GitLab): Promise<T> {
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
		if (checkGitLabToken()) {
			showCreateGitLabTokenWalkthrough(viewer); // will walk the user through recreating the token
		}
	}

	return Promise.reject(error);
}

function resourceToNameAndOwner(resource: vscode.Uri): { owner: string, name: string } {
	const parts = resource.path.replace(/^\/repository\//, '').split('/');
	return { owner: parts[0], name: parts[1] };
}
