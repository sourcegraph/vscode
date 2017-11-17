/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { throttle } from './decorators';
import { dispose, timeout, execGit } from './util';
import { Repository } from './repository';
import * as log from './log';

export interface ModelChangeEvent {
	added: Repository[];
	removed: Repository[];
	changed: Repository[];
}

interface RepositoryDisposable {
	repository: Repository;
	disposable: vscode.Disposable;
}

/**
 * Tracks all Repository instances open in this window.
 */
export class Model implements vscode.Disposable {
	private _repositoriesByWorkspaceFolder = new Map<string, RepositoryDisposable>();

	get repositories(): Repository[] {
		return Array.from(this._repositoriesByWorkspaceFolder.values()).map(({ repository }) => repository);
	}

	private _onDidChangeRepositories = new vscode.EventEmitter<ModelChangeEvent>();
	get onDidChangeRepositories(): vscode.Event<ModelChangeEvent> { return this._onDidChangeRepositories.event; }

	private disposables: vscode.Disposable[] = [];

	constructor(private githubURL: string, public readonly outputChannel: vscode.OutputChannel) {
		vscode.workspace.onDidChangeWorkspaceFolders(e => this.handleWorkspaceFolderChange(e), null, this.disposables);

		if (vscode.workspace.workspaceFolders) {
			this.handleWorkspaceFolderChange({ added: vscode.workspace.workspaceFolders, removed: [] });
		}
	}

	public getRepositoryForResource(resource: vscode.Uri): Repository | undefined {
		let folder = resource.toString();
		while (folder.length > 0 && folder !== '.') {
			const repository = this._repositoriesByWorkspaceFolder.get(folder);
			if (repository) {
				return repository.repository;
			}
			folder = path.dirname(folder);
		}
		return undefined;
	}

	@throttle
	private async handleWorkspaceFolderChange(e: vscode.WorkspaceFoldersChangeEvent): Promise<void> {
		const change: ModelChangeEvent = {
			added: [],
			removed: [],
			changed: [],
		};

		for (const folderToRemove of e.removed) {
			const removedRepo = this.removeWorkspaceFolder(folderToRemove);
			if (removedRepo) {
				change.removed.push(removedRepo);
			}
		}

		const addedRepos = await Promise.all(e.added.map(async folderToAdd => {
			try {
				return await this.addWorkspaceFolder(folderToAdd);
			} catch (err) {
				log.print(`Error adding repository for new workspace folder ${folderToAdd.uri.fsPath}: ${err}`);
			}
		}));

		for (const addedRepo of addedRepos) {
			if (addedRepo) {
				change.added.push(addedRepo);
			}
		}

		if (change.added.length > 0 || change.removed.length > 0) {
			this._onDidChangeRepositories.fire(change);
		}
	}

	private async addWorkspaceFolder(folder: vscode.WorkspaceFolder): Promise<Repository | undefined> {
		// The SourceControl for the repository might not yet be ready, so wait if needed.
		let sourceControl: vscode.SourceControl | undefined;
		let tries = 0;
		while (tries < 10) {
			sourceControl = vscode.scm.getSourceControlForResource(folder.uri);
			if (sourceControl) {
				break;
			}
			await timeout((tries ** 2) * 1000);
		}

		if (!sourceControl || !sourceControl.rootUri) {
			return;
		}

		let gitDir: string;
		try {
			gitDir = path.join(folder.uri.fsPath, await execGit(['rev-parse', '--git-dir'], folder.uri.fsPath));
		} catch (err) {
			if (err.status === 128) {
				// Not a Git repository.
				return;
			}
			throw err;
		}

		const worktreeDir = sourceControl.rootUri;
		const repository = new Repository(vscode.Uri.file(gitDir), worktreeDir, this.githubURL, this.outputChannel);

		const disposable = repository.onDidUpdate(() => this._onDidChangeRepositories.fire({
			added: [], removed: [], changed: [repository],
		}));

		this._repositoriesByWorkspaceFolder.set(folder.uri.toString(), { repository, disposable, });

		return repository;
	}

	private removeWorkspaceFolder(folder: vscode.WorkspaceFolder): Repository | undefined {
		const repo = this._repositoriesByWorkspaceFolder.get(folder.uri.toString());
		if (repo) {
			repo.disposable.dispose(); // stop listening for changes
			repo.repository.dispose(); // dispose entire repository
			this._repositoriesByWorkspaceFolder.delete(folder.uri.toString());
			return repo.repository;
		}
		return undefined;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
