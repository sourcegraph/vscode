/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { requestGraphQL, distinct } from './util';
import * as nls from 'vscode-nls';
import * as cp from 'child_process';

const localize = nls.loadMessageBundle();

const GITHUB_SCHEME = 'github';

const repoFields = [
	'name',
	'nameWithOwner',
	'description',
	'isPrivate',
	'isFork',
	'isMirror',
	'stargazers { totalCount }',
	'forks { totalCount }',
	'watchers { totalCount }',
	'primaryLanguage { name }',
	'createdAt',
	'updatedAt',
	'pushedAt',
	'viewerHasStarred',
	'viewerCanAdminister',
	'diskUsage',
].join('\n');

export function activate(context: vscode.ExtensionContext): void {
	const viewer = new Viewer();
	const github = new GitHub(viewer);

	context.subscriptions.push(vscode.workspace.registerResourceResolutionProvider(GITHUB_SCHEME, {
		async resolveResource(resource: vscode.Uri): Promise<vscode.Uri> {
			return await github.cloneURL(resource);
		}
	}));

	vscode.commands.registerCommand('github.checkAccessToken', async (args) => {
		return checkGitHubToken();
	});

	vscode.commands.registerCommand('github.showCreateAccessTokenWalkthrough', async (skipInfoMessage) => {
		return await showCreateGitHubTokenWalkthrough(skipInfoMessage);
	});

	context.subscriptions.push(vscode.workspace.registerFolderCatalogProvider(vscode.Uri.parse('github://github.com'), {
		resolveFolder(resource: vscode.Uri): Thenable<vscode.CatalogFolder> {
			return requestGraphQL(`
query($owner: String!, $name: String!) {
	repository(owner: $owner, name: $name) {
		${repoFields}
	}
}`,
				resourceToNameAndOwner(resource),
			).then(({ repository }) => {
				if (!repository) {
					return showErrorImmediately(localize('notFound', "GitHub repository not found: {0}", resource.toString()));
				}
				return toCatalogFolder(repository);
			});
		},
		resolveLocalFolderResource(path: string): Thenable<vscode.Uri | null> {
			return new Promise<string>((resolve, reject) => {
				cp.exec('git ls-remote --get-url', { cwd: path }, (error, stdout, stderr) => resolve(stdout));
			}).then(gitURL => {
				gitURL = decodeURIComponent(gitURL.trim()).replace(/\.git$/, '');
				const match = gitURL.match(/github.com[\/:]([^/]+)\/([^/]+)/);
				if (match) {
					return nameAndOwnerToResource(match[1], match[2]);
				}
				return null;
			});
		},
		async search(query: string): Promise<vscode.CatalogFolder[]> {
			const token = checkGitHubToken();
			if (!token) {
				const ok = await showCreateGitHubTokenWalkthrough();
				if (!ok) {
					return [];
				}
			}

			let request: Thenable<any>;
			if (query) {
				request = requestGraphQL(`
query($query: String!) {
	search(type: REPOSITORY, query: $query, first: 30) {
		nodes {
			... on Repository {
				${repoFields}
			}
		}
	}
}`,
					{ query: `${query} fork:true` }).then((data: any) => data.search.nodes, showErrorImmediately);
			} else {
				// viewer.repositories already includes the repos we want
				request = Promise.resolve([]);
			}

			const [viewerRepos, searchResults] = await Promise.all([
				viewer.repositories(),
				request.then<vscode.CatalogFolder[]>(repos => repos.map(toCatalogFolder)),
			]);
			return distinct(viewerRepos.concat(searchResults), f => f.resource.toString());
		},
	}));

	vscode.commands.registerCommand('github.pullRequests.quickopen', async (sourceControl: vscode.SourceControl) => {
		const ok = await checkGitHubToken();
		if (!ok) {
			showCreateGitHubTokenWalkthrough();
			return;
		}

		if (!sourceControl) {
			vscode.window.showErrorMessage(localize('noSourceControl', "Run this from the context menu of a repository in the Source Control viewlet."));
			return;
		}

		const setRevisionCommand = sourceControl.setRevisionCommand;
		if (!setRevisionCommand) {
			vscode.window.showErrorMessage(localize('unableToSetRevision', "The repository does not support switching revisions."));
			return;
		}

		type Ref = {
			name: string;
			repository: { nameWithOwner: string };
			target: { oid: string };
		};

		type PullRequest = {
			number: number;
			title: string;
			author: { login: string };
			updatedAt: string;
			baseRef: Ref;
			headRef: Ref;
			isCrossRepository: boolean;
		};

		if (!sourceControl.remoteResources) {
			vscode.window.showErrorMessage(localize('noRemotes', "Unable to determine remote repository for the selected local repository."));
			return;
		}

		// TODO(sqs): handle multiple remotes (merge, or disambiguate?).

		const firstGitHubRemote = sourceControl.remoteResources.find(r => r.authority.endsWith('github.com'));
		if (!firstGitHubRemote) {
			vscode.window.showErrorMessage(localize('notAGitHubRepository', "The repository does not have any github.com Git remote URLs."));
			return;
		}
		const parts = parseGitHubRepositoryFullName(firstGitHubRemote);
		if (!parts) {
			vscode.window.showErrorMessage(localize('unableToParse', "Unable to determine GitHub repository name from remote: {0}", firstGitHubRemote.toString()));
			return;
		}

		const pullRequests = requestGraphQL(`
query($owner: String!, $name: String!) {
	repository(owner: $owner, name: $name) {
		nameWithOwner
		url
		pushedAt
		pullRequests(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }, states: [OPEN]) {
			nodes {
				... on PullRequest {
					number
					title
					author { login }
					updatedAt
					baseRef { ...refFields }
					headRef { ...refFields }
				}
			}
		}
	}
}

fragment refFields on Ref {
	name
	repository {
		nameWithOwner
	}
	target {
		oid
	}
}
`,
			{ owner: parts.owner, name: parts.name }).then<PullRequest[]>((data: any) => data.repository.pullRequests.nodes, showErrorImmediately);

		interface PullRequestItem extends vscode.QuickPickItem {
			pullRequest: PullRequest;
		}
		const choice = await vscode.window.showQuickPick(pullRequests.then(pullRequests => pullRequests
			.map(pullRequest => {
				return {
					label: `$(git-pull-request) ${pullRequest.title}`,
					description: `#${pullRequest.number}`,
					detail: `${pullRequest.headRef.name} — @${pullRequest.author.login}`,
					pullRequest,
				} as PullRequestItem;
			})));

		if (!choice) {
			return;
		}

		await Promise.all([choice.pullRequest.baseRef, choice.pullRequest.headRef].map(async ref => {
			const [name, owner] = ref.repository.nameWithOwner.split('/');
			const cloneURL = await github.cloneURL(nameAndOwnerToResource(name, owner));
			return vscode.commands.executeCommand('git.fetchCommitFromRemoteRef', sourceControl, cloneURL, ref.name, ref.target.oid);
		}));

		// Set head revision
		const setRevisionArgs = (setRevisionCommand.arguments || []).concat(choice.pullRequest.headRef.target.oid);
		await vscode.commands.executeCommand(setRevisionCommand.command, ...setRevisionArgs);

		const mergeBase = (await vscode.commands.executeCommand('git.mergeBase', sourceControl, choice.pullRequest.baseRef.target.oid, 'HEAD') as string[])[0].slice(0, 7);

		// Open comparison against merge base
		await vscode.commands.executeCommand('git.openComparison', sourceControl, mergeBase);
	});


}

// Fetches and caches the github information associated to the current user.
class Viewer {
	private token: string;
	private repoRequest: Thenable<vscode.CatalogFolder[]> | null;
	private usernameRequest: Thenable<string | null> | null;

	constructor() {
		// Pre-emptively fetch user related information
		setTimeout(() => {
			this.repositories();
		}, 2000);
	}

	// Returns the github repositories for the current user. Best-effort, so
	// should never be rejected. Also cached, so efficient to be repeatedly called.
	public repositories(): Thenable<vscode.CatalogFolder[]> {
		if (!this.validState()) {
			return Promise.resolve([]);
		}
		if (this.repoRequest !== null) {
			return this.repoRequest;
		}
		const request = requestGraphQL(`
		{
			viewer {
				pinnedRepositories(first: 100, orderBy: {field: PUSHED_AT, direction: DESC}) {
					nodes {
						...repoFields
					}
				}
				contributedRepositories(first: 100, orderBy: {field: PUSHED_AT, direction: DESC}) {
					nodes {
						...repoFields
					}
				}
				starredRepositories(first: 100, orderBy: {field: STARRED_AT, direction: DESC}) {
					nodes {
						...repoFields
					}
				}
				repositories(first: 100, orderBy: {field: PUSHED_AT, direction: DESC}) {
					nodes {
						...repoFields
					}
				}
				organizations(first: 100) {
					nodes {
						repositories(first: 100, orderBy: {field: PUSHED_AT, direction: DESC}) {
							nodes {
								...repoFields
							}
						}
					}
				}
			}
		}

		fragment repoFields on Repository {
			${repoFields}
		}
		  `, {}).then<vscode.CatalogFolder[]>((data: any) => {
				return [].concat(
					data.viewer.pinnedRepositories.nodes,
					data.viewer.contributedRepositories.nodes,
					data.viewer.starredRepositories.nodes,
					data.viewer.repositories.nodes,
					...data.viewer.organizations.nodes.map((org: any) => org.repositories.nodes),
				).map(toCatalogFolder);
			}, (reason) => {
				// try again, but don't fail other requests if this fails
				console.error(reason);
				this.repoRequest = null;
				return [];
			});
		this.repoRequest = request;
		return request;
	};

	// Returns the username of the currently logged in user. It is best-effort, so if the
	// network request fails or there is no logged in user null is returned.
	public username(): Thenable<string | null> {
		if (!this.validState()) {
			return Promise.resolve(null);
		}
		if (this.usernameRequest !== null) {
			return this.usernameRequest;
		}
		const request = requestGraphQL(`
		{
			viewer {
				login
			}
		}
		`, {}).then<string | null>((data: any) => {
				return data.viewer.login;
			}, (reason) => {
				// try again, but don't fail other requests if this fails
				console.error(reason);
				this.usernameRequest = null;
				return null;
			});
		this.usernameRequest = request;
		return request;
	}

	// Returns true if you can do a request or use a cached request.
	private validState(): boolean {
		const token = vscode.workspace.getConfiguration('github').get<string>('token');
		if (!token) {
			return false;
		}
		if (token !== this.token) {
			this.repoRequest = null;
			this.usernameRequest = null;
		}
		this.token = token;
		return true;
	}
}

class GitHub {

	constructor(private viewer: Viewer) { }

	/**
	 * Returns a clone URL for git for the github repository.
	 * Note: this will include "git+" in the scheme.
	 * @param resource The github:// repository resource
	 */
	async cloneURL(resource: vscode.Uri): Promise<vscode.Uri> {
		const data = resourceToNameAndOwner(resource);
		const protocol = vscode.workspace.getConfiguration('github').get<string>('cloneProtocol');
		let user: string | null = null;
		if (protocol === 'ssh') {
			user = 'git';
		} else {
			user = await this.viewer.username();
		}
		const userAuthority = user ? `${user}@` : '';
		return vscode.Uri.parse(`git+${protocol}://${userAuthority}github.com/${data.owner}/${data.name}.git`);
	}
}

function parseGitHubRepositoryFullName(cloneUrl: vscode.Uri): { owner: string, name: string } | undefined {
	const parts = cloneUrl.path.slice(1).replace(/(\.git)?\/?$/, '').split('/');
	if (parts.length === 2) {
		return { owner: parts[0], name: parts[1] };
	}
	return undefined;
}

function resourceToNameAndOwner(resource: vscode.Uri): { owner: string, name: string } {
	const parts = resource.path.replace(/^\/repository\//, '').split('/');
	return { owner: parts[0], name: parts[1] };
}

function nameAndOwnerToResource(owner: string, name: string): vscode.Uri {
	return vscode.Uri.parse(`github://github.com/repository/${owner}/${name}`);
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
					const hasToken = vscode.workspace.getConfiguration('github').get<string>('token');
					if (hasToken) {
						await vscode.workspace.getConfiguration('github').update('token', undefined, vscode.ConfigurationTarget.Global);
					}
					if (checkGitHubToken()) {
						showCreateGitHubTokenWalkthrough(); // will walk the user through recreating the token
					}
				}
			});

		return Promise.reject(error);
	}));
}

/**
 * Shows the GitHub token creation walkthrough and returns if a GitHub token was added.
 */
async function showCreateGitHubTokenWalkthrough(skipInfoMessage?: boolean): Promise<boolean> {
	// Close quickopen so the user sees our message.
	await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
	await vscode.commands.executeCommand('workbench.action.closeMessages');

	const createTokenItem: vscode.MessageItem = { title: localize('createToken', "Create Token on GitHub.com") };
	const enterTokenItem: vscode.MessageItem = { title: localize('enterToken', "Enter Token") };
	const cancelItem: vscode.MessageItem = { title: localize('cancel', "Cancel"), isCloseAffordance: true };
	if (skipInfoMessage) {
		await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/settings/tokens/new'));
	} else {
		const value = await vscode.window.showInformationMessage(
			localize('noGitHubToken', "A GitHub personal access token is required to search for repositories."),
			{ modal: false },
			createTokenItem, enterTokenItem, cancelItem,
		);
		if (value === createTokenItem) {
			await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse('https://github.com/settings/tokens/new'));
		} else if (!value || value === cancelItem) {
			return false;
		}
	}

	const token = await vscode.window.showInputBox({
		prompt: localize('tokenPrompt', "GitHub Personal Access Token (with 'repo' scope)"),
		ignoreFocusOut: true,
	});
	if (token) {
		await vscode.workspace.getConfiguration('github').update('token', token, vscode.ConfigurationTarget.Global);
		return true;
	}
	return false;
}

/**
 * Checks if the user has a GitHub token configured.
 */
function checkGitHubToken(): boolean {
	return !!vscode.workspace.getConfiguration('github').get<string>('token');
}

function toCatalogFolder(repo: {
	name: string,
	nameWithOwner: string,
	description?: string,
	isPrivate: boolean,
	isFork: boolean,
	isMirror: boolean,
	stargazers: { totalCount: number },
	forks: { totalCount: number },
	watchers: { totalCount: number },
	primaryLanguage?: { name: string },
	createdAt: string,
	updatedAt?: string,
	pushedAt?: string,
	viewerHasStarred: boolean,
	viewerCanAdminister: boolean,
	diskUsage: number, // kb (approximateByteSize is in bytes)
}): vscode.CatalogFolder {
	return {
		// These URIs are resolved by the resource resolver we register above.
		resource: vscode.Uri.parse('').with({ scheme: GITHUB_SCHEME, authority: 'github.com', path: `/repository/${repo.nameWithOwner}` }),

		displayPath: repo.nameWithOwner,
		displayName: repo.name,
		genericIconClass: iconForRepo(repo),
		cloneUrl: vscode.Uri.parse('').with({ scheme: 'https', authority: 'github.com', path: `/${repo.nameWithOwner}.git` }),
		description: repo.description,
		isPrivate: repo.isPrivate,
		isFork: repo.isFork,
		isMirror: repo.isMirror,
		starsCount: repo.stargazers ? repo.stargazers.totalCount : undefined,
		forksCount: repo.forks ? repo.forks.totalCount : undefined,
		watchersCount: repo.watchers ? repo.watchers.totalCount : undefined,
		primaryLanguage: repo.primaryLanguage ? repo.primaryLanguage.name : undefined,
		createdAt: new Date(Date.parse(repo.createdAt)),
		updatedAt: repo.updatedAt ? new Date(Date.parse(repo.updatedAt)) : undefined,
		pushedAt: repo.pushedAt ? new Date(Date.parse(repo.pushedAt)) : undefined,
		viewerHasStarred: repo.viewerHasStarred,
		viewerCanAdminister: repo.viewerCanAdminister,
		approximateByteSize: repo.diskUsage >= 0 ? repo.diskUsage * 1024 : undefined,
	};
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