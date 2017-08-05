/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { GitRepository } from './git';
import { isRepoResource, REPO_SCHEME, REPO_VERSION_SCHEME } from './repository';
import { toRelativePath } from './util';

export const SWITCH_REVISION_COMMAND_ID = 'repo.action.switchRevision';

/**
 * Manages all of the repositories inside of a workspace.
 */
export class Workspace implements vscode.Disposable {

	/**
	 * All known repositories in the workspace. The keys are the URI of the repository's
	 * root (e.g., repo://github.com/gorilla/mux).
	 */
	private repositories = new Map<string, GitRepository>();

	private statusBarItem: vscode.StatusBarItem;

	private activeRepositoryListener: vscode.Disposable | undefined;

	private toDispose: vscode.Disposable[] = [];

	constructor(
		private workspaceState: vscode.Memento,
	) {
		// Load initial workspace folders.
		if (vscode.workspace.workspaceFolders) {
			this.onDidChangeWorkspaceFolders({ added: vscode.workspace.workspaceFolders, removed: [] });
		}

		// Add/remove source controls when workspace roots change.
		this.toDispose.push(vscode.workspace.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));

		this.registerUnionFileSystem();

		this.toDispose.push(vscode.commands.registerCommand(SWITCH_REVISION_COMMAND_ID, () => this.openRevisionPickerForActiveRepository()));

		// Create status bar item for switching the revision for the repository that is
		// relevant to the active editor's document.
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.toDispose.push(this.statusBarItem);

		this.registerListeners();
	}

	private registerListeners(): void {
		// Update the status bar item to reflect information about the repository that is
		// relevant to the active editor's document.
		vscode.window.onDidChangeActiveTextEditor(editor => {
			let visible = false;
			if (editor) {
				const repo = this.getRepository(editor.document.uri);

				if (this.activeRepositoryListener && repo !== this.activeRepositoryListener) {
					this.activeRepositoryListener.dispose();
					this.activeRepositoryListener = undefined;
				}

				if (repo) {
					visible = true;
					repo.renderStatusBarItem(this.statusBarItem);

					// Listen for other changes for as long as this is the active
					// repository.
					this.activeRepositoryListener = repo.onDidChangeStatus(() => {
						const stillActive = vscode.window.activeTextEditor && this.getRepository(vscode.window.activeTextEditor.document.uri) === repo;
						if (stillActive) {
							repo.renderStatusBarItem(this.statusBarItem);
						}
					});
				}
			}

			if (visible) {
				this.statusBarItem.show();
			} else {
				this.statusBarItem.hide();
			}
		}, null, this.toDispose);
	}

	private onDidChangeWorkspaceFolders(event: vscode.WorkspaceFoldersChangeEvent): void {
		for (const removedFolder of event.removed) {
			this.removeFolderIfUnused(removedFolder.uri);
		}

		for (const addedFolder of event.added) {
			if (isRepoResource(addedFolder.uri)) {
				this.getRepository(addedFolder.uri);
			}
		}
	};

	private removeFolderIfUnused(folder: vscode.Uri): void {
		const isWorkspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.some(f => f.uri.toString() === folder.toString());
		const hasOpenDocuments = vscode.workspace.textDocuments.some(doc => !!toRelativePath(folder, doc.uri));

		if (!isWorkspaceRoot && !hasOpenDocuments) {
			const repo = this.repositories.get(folder.toString());
			if (repo) {
				this.repositories.delete(folder.toString());
				repo.dispose();
			}
		}
	}

	public getRepository(resource: vscode.Uri): GitRepository | undefined {
		const folder = vscode.workspace.findContainingFolder(resource);
		if (!folder) {
			return undefined;
		}

		if (!isRepoResource(folder)) {
			return undefined;
		}

		if (!this.repositories.has(folder.toString())) {
			const repo = new GitRepository(folder, this.workspaceState);
			this.repositories.set(folder.toString(), repo);

			const forwardChanges = repo.fileSystem.onDidChange(e => this.onDidFileSystemChange.fire(e));

			this.toDispose.push({
				dispose: () => {
					repo.dispose();
					forwardChanges.dispose();
				},
			});
		}
		return this.repositories.get(folder.toString())!;
	}

	private onDidFileSystemChange = new vscode.EventEmitter<vscode.Uri>();

	/**
	 * Register a FileSystemProvider that routes operations on 'repo'- and
	 * 'repo+version'-scheme resources to the file system for the repo.
	 */
	private registerUnionFileSystem(): void {
		const provider = {
			onDidChange: this.onDidFileSystemChange.event,
			resolveFile: (resource: vscode.Uri, options?: vscode.ResolveFileOptions): Thenable<vscode.FileStat | null> => {
				return this.getRepository(resource)!.fileSystem.resolveFile(resource, options);
			},
			resolveContents: (resource: vscode.Uri): string | Thenable<string> => {
				return this.getRepository(resource)!.fileSystem.resolveContents(resource);
			},
			writeContents: (resource: vscode.Uri, value: string): void => {
				this.getRepository(resource)!.fileSystem.writeContents(resource, value);
			},
		};
		this.toDispose.push(vscode.workspace.registerFileSystemProvider(REPO_SCHEME, provider));
		this.toDispose.push(vscode.workspace.registerFileSystemProvider(REPO_VERSION_SCHEME, provider));

		// Register a TextDocumentContentProvider for repo+version:// documents because they
		// are treated as ResourceInputs in workbench, which means their content is not
		// provided via the file service. (repo:// documents are special-cased in
		// workbench to be treated as files so they derive contents from the file
		// service.)
		this.toDispose.push(vscode.workspace.registerTextDocumentContentProvider(REPO_VERSION_SCHEME, {
			onDidChange: this.onDidFileSystemChange.event,
			provideTextDocumentContent: (uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> => {
				return this.getRepository(uri)!.fileSystem.resolveContents(uri);
			},
		}));
	}

	private openRevisionPickerForActiveRepository(): void {
		const uri = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : undefined;
		if (!uri) {
			return;
		}

		const repo = this.getRepository(uri)!;
		return repo.openRevisionPicker();
	}

	dispose(): void {
		for (const repo of this.repositories.values()) {
			repo.dispose();
		}

		this.toDispose.forEach(disposable => disposable.dispose());
	}
}