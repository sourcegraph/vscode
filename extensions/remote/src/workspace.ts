/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { RemoteGitRepository, Ref, RefType } from './git';
import { REPO_SCHEME } from './repository';
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
			if (addedFolder.uri.scheme === REPO_SCHEME) {
				this.getRemoteRepository(addedFolder.uri);
			}
		}
	};

	private getRemoteRepository(resource: vscode.Uri): RemoteGitRepository {
		const { repo: repoName, workspace: folder } = vscode.workspace.extractResourceInfo(resource)!;
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
	 * Register a FileSystemProvider that routes operations on 'repo'-scheme resources to
	 * the file system for the repo.
	 */
	private registerUnionFileSystem(): void {
		this.toDispose.push(vscode.workspace.registerFileSystemProvider(REPO_SCHEME, {
			onDidChange: this.onDidFileSystemChange.event,
			resolveFile: (resource: vscode.Uri, options?: vscode.ResolveFileOptions): Thenable<vscode.FileStat | null> => {
				return this.getRemoteRepository(resource).fileSystem.resolveFile(resource, options);
			},
			resolveContents: (resource: vscode.Uri): string | Thenable<string> => {
				return this.getRemoteRepository(resource).fileSystem.resolveContents(resource);
			},
			writeContents: (resource: vscode.Uri, value: string): void => {
				this.getRemoteRepository(resource).fileSystem.writeContents(resource, value);
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