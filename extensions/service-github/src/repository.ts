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
}

export enum GitHubStatusState {
	Pending = 'PENDING',
	Error = 'ERROR',
	Failure = 'FAILURE',
	Success = 'SUCCESS',
}

export interface GitHubStatus {
	state: GitHubStatusState;
	contexts: {
		state: GitHubStatusState;
		targetUrl?: string;
		description?: string;
		context: string;
	}[];
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

		const commit = await this.exec(['rev-parse', 'HEAD']);
		if (this.state.commit !== commit) {
			this.state.commit = commit;
			await this.updateStatuses();
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
		const match = url.match(/github.com[\/:]([^/]+)\/([^/]+)/);
		if (match) {
			const [, owner, name] = match;
			this.state.githubRemotes = [
				{ baseUrl: 'https://github.com', name, owner }
			];
		} else {
			this.state.githubRemotes = [];
		}
	}

	private async updateStatuses(): Promise<void> {
		if (!this.currentGitHubRemote) {
			return;
		}

		const { data } = await queryGraphQL(`
			query($owner: String!, $name: String!, $oid: GitObjectID) {
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
				}
			}
		`, {
				owner: this.currentGitHubRemote.owner,
				name: this.currentGitHubRemote.name,
				oid: this.state.commit,
			});

		const commit = data && data.repository && data.repository.object && (data.repository.object as GitHubGQL.ICommit);
		this.state.status = commit && commit.status || undefined;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
