/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { GitRepository } from './git';
import { isRepoResource, REPO_SCHEME, REPO_VERSION_SCHEME } from './repository';
import { toRelativePath } from './util';
import { gitExtension } from './main';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

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
		this.registerResourceResolver();

		this.toDispose.push(vscode.commands.registerCommand(SWITCH_REVISION_COMMAND_ID, (resource: vscode.Uri, revision?: vscode.SCMRevision) => this.switchRevision(resource, revision)));

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
			findFiles: (query: string, progress: vscode.Progress<vscode.Uri>, token?: vscode.CancellationToken): Thenable<void> => {
				throw new Error('findFiles not implemented');
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

	private registerResourceResolver(): void {
		const provider: vscode.ResourceResolutionProvider = {
			resolveResource: async (resource: vscode.Uri): Promise<vscode.Uri> => {
				// For 'git' scheme, avoid conflict with builtin 'git' extension by only resolving URIs
				// with a host (authority). The builtin 'git' extension does not construct or handle these.
				if (resource.scheme === 'file' && !resource.authority) {
					return resource;
				}

				// `git clone` doesn't actually understand the 'git+' prefix on the URI scheme.
				if (resource.scheme.startsWith('git+')) {
					resource = resource.with({ scheme: resource.scheme.replace(/^git\+/, '') });
				}

				// Clone repo, or use existing repo if it has already been cloned.
				const parentPath = os.tmpdir();
				try {
					const path = await gitExtension.git.clone(resource.toString(), parentPath);
					return vscode.Uri.file(path);
				} catch (err) {
					const folderName = decodeURI(resource.toString()).replace(/^.*\//, '').replace(/\.git$/, '') || 'repository'; // copied from git extension
					const folderPath = path.join(parentPath, folderName);
					return gitExtension.git.getRepositoryRoot(folderPath).then(repositoryRoot => {
						return vscode.Uri.file(repositoryRoot);
					});
				}
			},
		};

		const schemes = [
			'git',
			'git+https',
			'git+ssh',
			'git+http',
		];
		for (const scheme of schemes) {
			this.toDispose.push(vscode.workspace.registerResourceResolutionProvider(scheme, provider));
		}
	}

	private switchRevision(resource?: vscode.Uri, revision?: vscode.SCMRevision): void {
		if (!resource) {
			resource = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : undefined;
			if (!resource) {
				vscode.window.showErrorMessage(localize('noActiveSourceControl', "Unable to switch revision because there is no active document under source control."));
				return;
			}
		}

		const repo = this.getRepository(resource);
		if (!repo) {
			vscode.window.showErrorMessage(localize('noActiveSourceControlRepo', "Unable to determine the repository for the source control at {0}.", resource.toString()));
			return;
		}
		if (!revision) {
			repo.openRevisionPicker();
			return;
		}

		repo.revision = revision;
	}

	dispose(): void {
		for (const repo of this.repositories.values()) {
			repo.dispose();
		}

		this.toDispose.forEach(disposable => disposable.dispose());
	}
}