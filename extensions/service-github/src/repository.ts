/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { debounce, throttle } from './decorators';
import { queryGraphQL, dispose, filterEvent, eventToPromise, timeout, execGit, toDisposable } from './util';

export interface GitHubRemote {
	/**
	 * The base URL of the GitHub Enterprise instance that this remote repository
	 * resides on, or 'https://github.com' for GitHub.com repositories.
	 */
	baseUrl: string;

	/**
	 * The name of the repository owner (e.g., 'alice' for a repo 'alice/myrepo').
	 */
	owner: string;

	/**
	 * The repository's name (e.g., 'myrepo' for a repo 'alice/myrepo').
	 */
	name: string;

	/**
	 * The name of the Git remote (e.g., 'origin').
	 *
	 * TODO(sqs): make a required field when we actually list all remotes, not just the current one
	 */
	gitRemoteName?: string;
}

export interface RepositoryState {
	githubRemotes: GitHubRemote[];

	/**
	 * The name of the current branch, if any.
	 */
	branch?: string;

	/**
	 * The SHA of the HEAD commit.
	 */
	commit?: string;

	// -- GitHub data --

	status?: GitHubGQL.IStatus;

	/**
	 * The pull request for this branch if exists
	 */
	pullRequests?: GitHubGQL.IPullRequest[];
}

/**
 * Models a Git repository (which may have any number of GitHub repositories as remotes).
 */
export class Repository implements vscode.Disposable {

	public readonly state: RepositoryState = {
		githubRemotes: [],
	};

	private _onDidUpdate = new vscode.EventEmitter<void>();
	get onDidUpdate(): vscode.Event<void> { return this._onDidUpdate.event; }

	private disposables: vscode.Disposable[] = [];

	constructor(
		public readonly gitDir: vscode.Uri,
		public readonly worktreeDir: vscode.Uri,
		public readonly githubURL: string,
	) {
		if (path.basename(gitDir.fsPath) !== '.git') {
			throw new Error(`bad git dir: ${gitDir.toString()}`);
		}
		if (path.basename(worktreeDir.fsPath) === '.git') {
			throw new Error(`bad worktree dir: ${worktreeDir.toString()}`);
		}

		const pattern: vscode.GlobPattern = {
			base: gitDir.fsPath,
			pattern: '{HEAD,config,refs/remotes/**/*,refs/heads/**}',
		};
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);
		this.disposables.push(watcher);
		watcher.onDidChange(this.onGitDirChanged, this, this.disposables);
		watcher.onDidCreate(this.onGitDirChanged, this, this.disposables);
		watcher.onDidDelete(this.onGitDirChanged, this, this.disposables);

		// Periodically refresh to pick up remote changes, too (e.g., Travis CI
		// finishing and updating a commit status).
		const handle = setInterval(() => this.eventuallyUpdateAndWait(), 60 * 1000);
		this.disposables.push(toDisposable(() => clearInterval(handle)));

		this.update();
	}

	private onGitDirChanged(): void {
		this.eventuallyUpdateAndWait();
	}

	@debounce(1000)
	private eventuallyUpdateAndWait(): void {
		this.updateAndWait();
	}

	@throttle
	private async updateAndWait(): Promise<void> {
		await this.whenFocused();
		await this.update();
		await timeout(5000);
	}

	private async whenFocused(): Promise<void> {
		while (true) {
			if (!vscode.window.state.focused) {
				const onDidFocusWindow = filterEvent(vscode.window.onDidChangeWindowState, e => e.focused);
				await eventToPromise(onDidFocusWindow);
				continue;
			}

			return;
		}
	}

	private async exec(args: string[]): Promise<string> {
		return execGit(args, this.worktreeDir.fsPath);
	}

	private async update(): Promise<void> {
		await this.updateRemotes();

		const [commitID, branchName] = await Promise.all([
			this.exec(['rev-parse', 'HEAD']),
			this.exec(['symbolic-ref', '--short', 'HEAD'])
		]);
		if (this.state.commit !== commitID) {
			this.state.commit = commitID;
			if (!this.currentGitHubRemote) {
				return;
			}
			const { data, errors } = await queryGraphQL(`
				query($owner: String!, $name: String!, $oid: GitObjectID, $branchName: String) {
					repository(owner: $owner, name: $name) {
						object(oid: $oid) {
							... on Commit {
								status {
									state
									contexts {
										state
										targetUrl
										description
										context
									}
								}
							}
						}
						pullRequests(first: 1, headRefName: $branchName) {
							nodes {
								number
								title
								url
								closed
								createdAt
								...CommentFields
								commits(first: 100) {
									totalCount
									nodes {
										url
										commit {
											committedDate
              								abbreviatedOid
											messageHeadline
											author {
												user {
													avatarUrl
													login
												}
											}
										}
									}
								}
								comments(first: 100) {
									totalCount
									nodes {
										id
										createdAt
										...CommentFields
									}
								}
								reviewRequests(first: 100) {
									nodes {
										id
										reviewer {
											avatarUrl
											login
											url
										}
									}
								}
								reviews(first: 100) {
									totalCount
									nodes {
										...CommentFields
										state
										url
										createdAt
										comments(first: 100) {
											totalCount
											nodes {
												...CommentFields
												position
												url
												createdAt
												replyTo {
													id
												}
											}
										}
									}
								}
							}
						}
					}
				}
				fragment CommentFields on Comment {
					body
					author {
						avatarUrl
						login
						url
					}
				}
			`, {
					owner: this.currentGitHubRemote.owner,
					name: this.currentGitHubRemote.name,
					oid: this.state.commit,
					branchName,
				});

			if (!data) {
				throw Object.assign(new Error((errors || []).map(e => e.message).join('\n')), { errors });
			}

			const repository = data && data.repository;
			const commit = repository && repository.object && (repository.object as GitHubGQL.ICommit);
			this.state.status = commit && commit.status || undefined;
			this.state.pullRequests = repository && repository.pullRequests && repository.pullRequests.nodes || undefined;
		}

		this._onDidUpdate.fire();
	}

	get currentGitHubRemote(): GitHubRemote | undefined {
		return this.state.githubRemotes[0];
	}

	private async updateRemotes(): Promise<void> {
		// TODO(sqs): get all remotes; currently only gets current remote
		let url = await this.exec(['ls-remote', '--get-url']);
		url = decodeURIComponent(url.trim()).replace(/\.git$/, '');
		const host = vscode.Uri.parse(this.githubURL).authority;
		const match = url.match(new RegExp(`${host}[\/:]([^/]+)\/([^/]+)`));
		if (match) {
			const [, owner, name] = match;
			this.state.githubRemotes = [
				{ baseUrl: this.githubURL, name, owner }
			];
		} else {
			this.state.githubRemotes = [];
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
