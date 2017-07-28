/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { RemoteGitRepository, Ref, RefType } from './git';
import { isRemoteResource, REPO_SCHEME, GIT_REMOTE_SCHEME } from './repository';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export const SWITCH_REVISION_COMMAND_ID = 'remote.repository.action.switchRevision';

/**
 * Manages all of the remote repositories inside of a workspace.
 */
export class Workspace implements vscode.Disposable {

	/**
	 * All known repositories in the workspace. The keys are the URI of the repository's
	 * root (e.g., repo://github.com/gorilla/mux).
	 */
	private repositories = new Map<string, RemoteGitRepository>();

	private statusBarItem: vscode.StatusBarItem;

	private activeRepositoryListener: vscode.Disposable | undefined;

	private toDispose: vscode.Disposable[] = [];

	constructor(
		private workspaceState: vscode.Memento,
	) {
		this.toDispose.push(vscode.workspace.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));

		// Load initial workspace folders.
		if (vscode.workspace.workspaceFolders) {
			this.onDidChangeWorkspaceFolders({ added: vscode.workspace.workspaceFolders, removed: [] });
		}

		this.registerUnionFileSystem();

		this.toDispose.push(vscode.commands.registerCommand(SWITCH_REVISION_COMMAND_ID, () => this.showSwitchRevision()));

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
			console.log('ACTIVE', editor && editor.document.uri.toString());

			let visible = false;
			if (editor) {
				const repo = this.getRemoteRepository(editor.document.uri);

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
						const stillActive = vscode.window.activeTextEditor && this.getRemoteRepository(vscode.window.activeTextEditor.document.uri) === repo;
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
			const repo = this.repositories.get(removedFolder.uri.toString());
			if (repo) {
				this.repositories.delete(removedFolder.uri.toString());
				repo.dispose();
			}
		}

		for (const addedFolder of event.added) {
			if (isRemoteResource(addedFolder.uri)) {
				this.getRemoteRepository(addedFolder.uri);
			}
		}
	};

	private getRemoteRepository(resource: vscode.Uri): RemoteGitRepository | undefined {
		const info = vscode.workspace.extractResourceInfo(resource);
		if (!info) {
			return undefined;
		}

		const repoName = info.repo;
		const folder = info.workspace;
		if (!this.repositories.has(folder)) {
			const repo = new RemoteGitRepository(vscode.Uri.parse(folder), repoName, this.workspaceState);
			this.repositories.set(folder, repo);

			const forwardChanges = repo.fileSystem.onDidChange(e => this.onDidFileSystemChange.fire(e));

			this.toDispose.push({
				dispose: () => {
					repo.dispose();
					forwardChanges.dispose();
				},
			});
		}
		return this.repositories.get(folder)!;
	}

	private onDidFileSystemChange = new vscode.EventEmitter<vscode.Uri>();

	/**
	 * Register a FileSystemProvider that routes operations on 'repo'- and
	 * 'gitremote'-scheme resources to the file system for the repo.
	 */
	private registerUnionFileSystem(): void {
		const provider = {
			onDidChange: this.onDidFileSystemChange.event,
			resolveFile: (resource: vscode.Uri, options?: vscode.ResolveFileOptions): Thenable<vscode.FileStat | null> => {
				return this.getRemoteRepository(resource)!.fileSystem.resolveFile(resource, options);
			},
			resolveContents: (resource: vscode.Uri): string | Thenable<string> => {
				return this.getRemoteRepository(resource)!.fileSystem.resolveContents(resource);
			},
			writeContents: (resource: vscode.Uri, value: string): void => {
				this.getRemoteRepository(resource)!.fileSystem.writeContents(resource, value);
			},
		};
		this.toDispose.push(vscode.workspace.registerFileSystemProvider(REPO_SCHEME, provider));
		this.toDispose.push(vscode.workspace.registerFileSystemProvider(GIT_REMOTE_SCHEME, provider));

		// Register a TextDocumentContentProvider for gitremote:// documents because they
		// are treated as ResourceInputs in workbench, which means their content is not
		// provided via the file service. (repo:// documents are special-cased in
		// workbench to be treated as files so they derive contents from the file
		// service.)
		this.toDispose.push(vscode.workspace.registerTextDocumentContentProvider(GIT_REMOTE_SCHEME, {
			onDidChange: this.onDidFileSystemChange.event,
			provideTextDocumentContent: (uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> => {
				return this.getRemoteRepository(uri)!.fileSystem.resolveContents(uri);
			},
		}));
	}

	/**
	 * Shows a quickopen that lists available revisions for the current repository. Selecting
	 * any of these revisions switches the current repository to that Git revision, updating all
	 * of its open documents to that revision.
	 */
	private showSwitchRevision(): void {
		// TODO(sqs): make this work for multi-root, don't assume the first root
		const folder = vscode.workspace.workspaceFolders![0].uri;
		const repo = this.repositories.get(folder.toString())!;

		repo.listRefs().then(
			(refs: Ref[]) => {
				const currentRef = repo.sourceControl.revision!.specifier;
				const picks: (vscode.QuickPickItem & { id: string, ref: Ref })[] = refs
					.map(ref => {
						let description = '';
						if (ref.isHEAD) {
							description = localize('scmDefaultBranch', "default branch");
						} else if (ref.type === RefType.Head) {
							description = localize('scmBranch', "branch");
						} else if (ref.type === RefType.Tag) {
							description = localize('scmTag', "tag");
						}
						return {
							id: ref.ref,
							label: `${ref.name} ${ref.ref === currentRef ? '*' : ''}`,
							description,
							ref,
						};
					})
					.sort((t1, t2) => t1.label.localeCompare(t2.label));

				return vscode.window.showQuickPick(picks, {
					placeHolder: localize('selectRef', "Select a Git ref to switch to..."),
				}).then(pick => {
					if (pick) {
						repo.revision = { rawSpecifier: pick.ref.name, specifier: pick.ref.ref };
					}
				});
			},
			err => vscode.window.showErrorMessage(localize('switchRevisionError', "Error switching revision: {0}", err)),
		);
	}

	dispose(): void {
		for (const repo of this.repositories.values()) {
			repo.dispose();
		}

		this.toDispose.forEach(disposable => disposable.dispose());
	}
}