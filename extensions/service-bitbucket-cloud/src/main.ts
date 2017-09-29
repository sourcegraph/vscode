/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { fetchFromBitbucket } from './util';
import * as nls from 'vscode-nls';
import * as cp from 'child_process';

const localize = nls.loadMessageBundle();

const BITBUCKET_CLOUD_SCHEME = 'bitbucketcloud';

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.workspace.registerResourceResolutionProvider(BITBUCKET_CLOUD_SCHEME, {
		resolveResource(resource: vscode.Uri): Thenable<vscode.Uri> {
			return fetchFromBitbucket<Repository>(`/repositories/${resourceToApiPath(resource)}`).then(
				repository => {
					const folder = toCatalogFolder(repository);
					return folder.cloneUrl!.with({ scheme: 'git+' + folder.cloneUrl!.scheme });
				},
				err => showErrorImmediately(err),
			);
		},
	}));

	vscode.commands.registerCommand('bitbucket.checkBitbucketAppPassword', async (args) => {
		return checkBitbucketAppPassword();
	});

	vscode.commands.registerCommand('bitbucket.showBitbucketAppPasswordWalkthrough', async (skipInfoMessage) => {
		return await showBitbucketAppPasswordWalkthrough(skipInfoMessage);
	});

	context.subscriptions.push(vscode.workspace.registerFolderCatalogProvider(vscode.Uri.parse(`${BITBUCKET_CLOUD_SCHEME}://bitbucket.org`), {
		resolveFolder(resource: vscode.Uri): Thenable<vscode.CatalogFolder> {
			return fetchFromBitbucket<Repository>(`/repositories/${resourceToApiPath(resource)}`).then(
				repository => toCatalogFolder(repository),
				err => showErrorImmediately(err),
			);

		},
		resolveLocalFolderResource(path: string): Thenable<vscode.Uri | null> {
			return new Promise<string>((resolve, reject) => {
				cp.exec('git ls-remote --get-url', { cwd: path }, (error, stdout, stderr) => resolve(stdout));
			}).then(gitURL => {
				gitURL = decodeURIComponent(gitURL.trim()).replace(/\.git$/, '');
				const match = gitURL.match(/bitbucket.org[\/:]([^/]+\/[^/]+)/);
				if (match) {
					return vscode.Uri.parse(`${BITBUCKET_CLOUD_SCHEME}://bitbucket.org/repository/' + ${match[1]}`);
				}
				return null;
			});
		},
		async search(query: string): Promise<vscode.CatalogFolder[]> {
			const hasApp = checkBitbucketAppPassword();

			if (!hasApp && !vscode.workspace.getConfiguration('bitbucket.cloud').get<boolean>('triggerSetup')) {
				return [];
			}

			if (!hasApp) {
				const ok = await showBitbucketAppPasswordWalkthrough();
				if (!ok) {
					return [];
				}
			}

			let queryValues = ['scm = "git"'];
			if (query) {
				// Workaround for https://bitbucket.org/site/master/issues/14768/repositories-query-20-api-returns-error.
				if (query.includes('/')) {
					queryValues.push(`full_name ~ ${JSON.stringify(query)}`);
				} else {
					queryValues.push(`(name ~ ${JSON.stringify(query)} OR parent.owner.username ~ ${JSON.stringify(query)})`);
				}
			}
			const queryValue = encodeURIComponent(queryValues.join(' AND '));
			const url = `/repositories?role=member&pagelen=50&sort=-updated_on&q=${queryValue}`;

			return fetchFromBitbucket<{ values: Repository[] }>(url).then(
				({ values }) => values.map(toCatalogFolder),
				err => showErrorImmediately(err),
			);
		},
	}));
}

interface Repository {
	uuid: string;
	full_name: string;
	name: string;
	description: string;
	is_private: boolean;
	language: string;
	created_on: string;
	updated_on: string;
	size: number;
	links: {
		clone: { href: string, name: string }[];
	};
}

function resourceToApiPath(resource: vscode.Uri): string {
	return resource.path.replace(/^\/repository\//, '');
}

/**
 * Close quickopen and pass along the error so that the user sees it immediately instead
 * of only when they close the quickopen (which probably isn't showing any results because of
 * the error).
 */
function showErrorImmediately<T>(error: string): T | Thenable<T> {
	return vscode.commands.executeCommand('workbench.action.closeQuickOpen').then(() => vscode.commands.executeCommand('workbench.action.closeMessages').then(async () => {
		const resetAppPassword: vscode.MessageItem = { title: localize('resetAppPassword', "Reset App Password") };
		const disableItem: vscode.MessageItem = { title: localize('disable', "Disable Bitbucket integration"), isCloseAffordance: true };
		await vscode.window.showErrorMessage(error, resetAppPassword, disableItem)
			.then(async (value) => {
				const unsetAppPassword = async () => {
					const hasAuth = vscode.workspace.getConfiguration('bitbucket.cloud').get<string>('appPassword');
					if (hasAuth) {
						await vscode.workspace.getConfiguration('bitbucket.cloud').update('appPassword', undefined, vscode.ConfigurationTarget.Global);
					}
				};
				if (value === resetAppPassword) {
					await unsetAppPassword();
					const hasApp = checkBitbucketAppPassword();
					if (!hasApp) {
						await showBitbucketAppPasswordWalkthrough(); // will walk the user through recreating the app password
					}
				} else if (!value || value === disableItem) {
					// TODO(sqs): If the user is temporarily offline, it's annoying to completely remove their
					// credentials. Figure out a better way to handle this.
					await unsetAppPassword();
					await vscode.workspace.getConfiguration('bitbucket.cloud').update('triggerSetup', undefined, vscode.ConfigurationTarget.Global);
				}
			});

		return Promise.reject(error);
	}));
}

/**
 * Shows the Bitbucket app password creation walkthrough and returns if a Bitbucket app password was added.
 */
async function showBitbucketAppPasswordWalkthrough(skipInfoMessage?: boolean): Promise<boolean> {
	// Close quickopen so the user sees our message.
	const config = vscode.workspace.getConfiguration('bitbucket.cloud');
	await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
	await vscode.commands.executeCommand('workbench.action.closeMessages');

	const createAppPasswordItem: vscode.MessageItem = { title: localize('createAppPassword', "Create App Password on Bitbucket") };
	const enterAppPasswordItem: vscode.MessageItem = { title: localize('enterAppPassword', "Enter App Password") };
	const cancelItem: vscode.MessageItem = { title: localize('cancel', "Cancel"), isCloseAffordance: true };
	if (skipInfoMessage) {
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://bitbucket.org/account'));
	} else {
		const value = await vscode.window.showInformationMessage(
			localize('noBitbucketAppPassword', "A Bitbucket app password is required to search for repositories."),
			{ modal: false },
			createAppPasswordItem, enterAppPasswordItem, cancelItem,
		);
		if (value === createAppPasswordItem) {
			await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://bitbucket.org/account'));
		} else if (!value || value === cancelItem) {
			return false;
		}
	}

	const username = await vscode.window.showInputBox({
		prompt: localize('usernamePrompt', "Bitbucket username"),
		ignoreFocusOut: true,
		value: config.get('username'),
	});
	if (username) {
		await config.update('username', username, vscode.ConfigurationTarget.Global);
	} else {
		return false;
	}

	const appPassword = await vscode.window.showInputBox({
		prompt: localize('appPasswordPrompt', "Bitbucket app password (requires Repositories Read permission)"),
		ignoreFocusOut: true,
		value: config.get('appPassword'),
	});
	if (appPassword) {
		await config.update('appPassword', appPassword, vscode.ConfigurationTarget.Global);
		return true;
	}
	return false;
}

/**
 * Checks if the user has a Bitbucket app password configured
 */
function checkBitbucketAppPassword(): boolean {
	const config = vscode.workspace.getConfiguration('bitbucket.cloud');
	return !!config.get<string>('username') && !!config.get<string>('appPassword');
}

function toCatalogFolder(repo: Repository): vscode.CatalogFolder {
	const cloneProtocol = vscode.workspace.getConfiguration('bitbucket.cloud').get<string>('cloneProtocol');
	return {
		// These URIs are resolved by the resource resolver we register above.
		resource: vscode.Uri.parse('').with({ scheme: BITBUCKET_CLOUD_SCHEME, authority: 'bitbucket.org', path: `/repository/${repo.full_name}` }),

		displayPath: repo.full_name,
		displayName: repo.name,
		genericIconClass: iconForRepo(repo),
		cloneUrl: vscode.Uri.parse(repo.links.clone.find(clone => clone.name === cloneProtocol)!.href),
		description: repo.description,
		isPrivate: repo.is_private,
		primaryLanguage: repo.language,
		createdAt: new Date(Date.parse(repo.created_on)),
		updatedAt: repo.updated_on ? new Date(Date.parse(repo.updated_on)) : undefined,
		pushedAt: repo.updated_on ? new Date(Date.parse(repo.updated_on)) : undefined,
		approximateByteSize: repo.size >= 0 ? repo.size * 1024 : undefined,
		viewerCanAdminister: true, // Possibly not true, but we only search repos we contribute to. So helps with search result boosting.
	};
}

function iconForRepo(repo: { is_private: boolean }) {
	if (repo.is_private) {
		return 'lock';
	}
	return 'repo';
}