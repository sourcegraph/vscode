/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { debounce } from './decorators';
import { queryGraphQL, dispose, execGit } from './util';
import { commentFieldsFragment, pullRequestReviewFieldsFragment } from './graphql';
import { clearTimeout } from 'timers';

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
	 * The pulls requests associated with this branch.
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
		public readonly outputChannel: vscode.OutputChannel,
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
		watcher.onDidChange(this.update, this, this.disposables);
		watcher.onDidCreate(this.update, this, this.disposables);
		watcher.onDidDelete(this.update, this, this.disposables);

		this.disposables.push(vscode.window.onDidChangeWindowState(e => e.focused && this.update()));
		this.update();
	}

	public async execGit(args: string[], stdin?: string): Promise<string> {
		this.outputChannel.appendLine(`git ${args.join(' ')}`);
		return execGit(args, this.worktreeDir.fsPath, stdin);
	}

	private updateTimeout: NodeJS.Timer | undefined;
	private updateInterval = 60 * 1000;

	private rescheduleNextUpdate() {
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}
		this.updateTimeout = setTimeout(() => {
			this.update();
		}, this.updateInterval);
	}

	@debounce(1000)
	private async update(): Promise<void> {
		// Make sure update gets called at least every updateInterval seconds.
		// If update gets called for other reasons, we reschedule the next update.
		this.rescheduleNextUpdate();

		await this.updateRemotes();

		const [commitID, branchName] = await Promise.all([
			this.execGit(['rev-parse', 'HEAD']),
			this.execGit(['symbolic-ref', '--short', 'HEAD'])
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
								isCrossRepository
								baseRef {
									target {
										oid
									}
								}
								headRef {
									target {
										oid
									}
								}
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
										...PullRequestReviewFields
									}
								}
							}
						}
					}
				}
				${commentFieldsFragment}
				${pullRequestReviewFieldsFragment}
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

		const prs = this.state.pullRequests || [];
		if (prs.length) {
			this.outputChannel.appendLine(`updated open pull requests for ${branchName} in ${this.worktreeDir.fsPath}: ${(this.state.pullRequests || []).map(pr => '#' + pr.number).join(', ')}`);
		} else {
			this.outputChannel.appendLine(`no open pull requests for ${branchName} in ${this.worktreeDir.fsPath}`);
		}
		this._onDidUpdate.fire();
	}

	get currentGitHubRemote(): GitHubRemote | undefined {
		return this.state.githubRemotes[0];
	}

	private async updateRemotes(): Promise<void> {
		// TODO(sqs): get all remotes; currently only gets current remote
		let url = await this.execGit(['ls-remote', '--get-url']);
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
