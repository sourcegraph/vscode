/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { toFileStat, toICustomResolveFileOptions } from './fileStat';
import { Revisioned, isRepoResource } from './repository';
import { requestGraphQL } from './util';

/**
 * Models a file system that exists in a Git repository at a specific revision.
 */
export class RepoFileSystem implements vscode.FileSystemProvider, vscode.Disposable, Revisioned {

	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	public get onDidChange(): vscode.Event<vscode.Uri> { return this._onDidChange.event; }

	private toDispose: vscode.Disposable[] = [];

	constructor(
		private repo: string,
		private revision: string,
	) {
	}

	setRevision(revision: string): void {
		if (revision !== this.revision) {
			this.revision = revision;

			// Trigger a refresh of all documents.
			vscode.workspace.textDocuments.forEach(doc => {
				const info = vscode.workspace.extractResourceInfo(doc.uri);
				if (info && isRepoResource(doc.uri) && info.repo === this.repo) {
					this._onDidChange.fire(doc.uri);
				}
			});
		}
	}

	resolveFile(resource: vscode.Uri, options?: vscode.ResolveFileOptions): Thenable<vscode.FileStat | null> {
		const { relativePath, workspace } = vscode.workspace.extractResourceInfo(resource)!;
		return listAllFiles(this.repo, this.revision).then(files =>
			toFileStat(vscode.Uri.parse(workspace), files, toICustomResolveFileOptions(relativePath, options))
		);
	}

	resolveContents(resource: vscode.Uri): Thenable<string> {
		const { relativePath } = vscode.workspace.extractResourceInfo(resource)!;
		return getFileContents(this.repo, this.revision, relativePath!);
	}

	writeContents(resource: vscode.Uri, value: string): void {
		throw new Error('not implemented: RepoFileSystem writeContents');
	}

	dispose(): void {
		this.toDispose.forEach(disposable => disposable.dispose());
		this.toDispose = [];
	}
}

/**
 * listAllFiles retrieves a list of all files in a repository from the remote server.
 */
function listAllFiles(repo: string, revision: string): Thenable<string[]> {
	return requestGraphQL<any>(`
		query FileTree($repo: String!, $revision: String!) {
			root {
				repository(uri: $repo) {
					commit(rev: $revision) {
						commit {
							tree(recursive: true) {
								files {
									name
								}
							}
						}
						cloneInProgress
					}
				}
			}
		}`,
		{ repo, revision },
		'repo/fileSystem/listAllFiles',
	).then(root => root.repository!.commit.commit!.tree!.files.map((file: any) => file.name));
}

/**
 * getFileContents retrieves a file's contents from the remote server.
 */
function getFileContents(repo: string, revision: string, path: string): Thenable<string> {
	return requestGraphQL<any>(`
		query FileContentAndRev($repo: String, $rev: String, $path: String) {
			root {
				repository(uri: $repo) {
					commit(rev: $revision) {
						commit {
							file(path: $path) {
								content
							}
							sha1
						}
					}
				}
			}
		}`,
		{ repo, revision, path },
		'repo/fileSystem/getFileContents',
	)
		.then(root => {
			if (!root || !root.repository || !root.repository.commit.commit) {
				throw new Error(`commit information not available for repo ${repo} revision ${revision}`);
			}
			if (!root.repository.commit.commit.file || root.repository.commit.commit.file.content === null) {
				throw new Error(`remote file not found: ${path} in repo ${repo} revision ${revision}`);
			}
			return root.repository.commit.commit.file.content;
		});
}