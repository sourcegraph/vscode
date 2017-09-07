/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { fetchFromBitbucket } from './util';
import * as nls from 'vscode-nls';

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

	context.subscriptions.push(vscode.workspace.registerFolderCatalogProvider(vscode.Uri.parse(`${BITBUCKET_CLOUD_SCHEME}://bitbucket.org`), {
		resolveFolder(resource: vscode.Uri): Thenable<vscode.CatalogFolder> {
			return fetchFromBitbucket<Repository>(`/repositories/${resourceToApiPath(resource)}`).then(
				repository => toCatalogFolder(repository),
				err => showErrorImmediately(err),
			);

		},
		async search(query: string): Promise<vscode.CatalogFolder[]> {
			if (!vscode.workspace.getConfiguration('bitbucket.cloud').get<boolean>('includeInSearch')) {
				return [];
			}

			const ok = await checkBitbucketAppPassword();
			if (!ok) {
				return [];
			}

			let url = `/repositories?role=member&pagelen=50`;
			if (query) {
				const queryValue = `full_name ~ ${JSON.stringify(query)}`;
				url += `&q=${encodeURIComponent(queryValue)}`;
			}

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
	return '%7B%7D/' + encodeURIComponent('{' + resource.path.replace(/^\/repository\//, '') + '}');
}

/**
 * Close quickopen and pass along the error so that the user sees it immediately instead
 * of only when they close the quickopen (which probably isn't showing any results because of
 * the error).
 */
function showErrorImmediately<T>(error: string): T | Thenable<T> {
	return vscode.commands.executeCommand('workbench.action.closeMessages').then(async () => {
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
					await checkBitbucketAppPassword(); // will walk the user through recreating the app password
				} else if (!value || value === disableItem) {
					// TODO(sqs): If the user is temporarily offline, it's annoying to completely remove their
					// credentials. Figure out a better way to handle this.
					await unsetAppPassword();
					await vscode.workspace.getConfiguration('bitbucket.cloud').update('includeInSearch', undefined, vscode.ConfigurationTarget.Global);
				}
			});

		return Promise.reject(error);
	});
}

/**
 * Checks if the user has a Bitbucket app password configured. If not, it walks them through
 * creating and configuring one.
 */
async function checkBitbucketAppPassword(): Promise<boolean> {
	const config = vscode.workspace.getConfiguration('bitbucket.cloud');
	const hasAuth = config.get<string>('username') && config.get<string>('appPassword');
	if (hasAuth) {
		return true;
	}

	// Close quickopen so the user sees our message.
	await vscode.commands.executeCommand('workbench.action.closeMessages');

	const createAppPasswordItem: vscode.MessageItem = { title: localize('createAppPassword', "Create App Password on Bitbucket") };
	const enterAppPasswordItem: vscode.MessageItem = { title: localize('enterAppPassword', "Enter App Password") };
	const cancelItem: vscode.MessageItem = { title: localize('cancel', "Cancel"), isCloseAffordance: true };
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
		prompt: localize('appPasswordPrompt', "Bitbucket app password"),
		ignoreFocusOut: true,
		value: config.get('appPassword'),
	});
	if (appPassword) {
		await config.update('appPassword', appPassword, vscode.ConfigurationTarget.Global);
		return true;
	}
	return false;
}

function toCatalogFolder(repo: Repository): vscode.CatalogFolder {
	return {
		// These URIs are resolved by the resource resolver we register above.
		resource: new vscode.Uri().with({ scheme: BITBUCKET_CLOUD_SCHEME, authority: 'bitbucket.org', path: `/repository/${encodeURIComponent(repo.uuid.replace(/[{}]/g, ''))}` }),

		displayPath: repo.full_name,
		displayName: repo.name,
		genericIconClass: iconForRepo(repo),
		cloneUrl: vscode.Uri.parse(repo.links.clone.find(clone => clone.name === 'ssh')!.href),
		description: repo.description,
		isPrivate: repo.is_private,
		primaryLanguage: repo.language,
		createdAt: new Date(Date.parse(repo.created_on)),
		updatedAt: repo.updated_on ? new Date(Date.parse(repo.updated_on)) : undefined,
		pushedAt: repo.updated_on ? new Date(Date.parse(repo.updated_on)) : undefined,
		approximateByteSize: repo.size >= 0 ? repo.size * 1024 : undefined,
	};
}

function iconForRepo(repo: { is_private: boolean }) {
	if (repo.is_private) {
		return 'lock';
	}
	return 'repo';
}