/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { RemoteFileSystem } from './fileSystem';
import { Revisioned, Repository } from './repository';
import { requestGraphQL } from './util';
import * as nls from 'vscode-nls';
import { SWITCH_REVISION_COMMAND_ID } from './workspace';

const localize = nls.loadMessageBundle();

export enum RefType {
	Head,
	Tag
}

export interface Ref {
	type: RefType;
	ref: string;
	name: string;
	isHEAD?: boolean;
}

const GIT_OID_LENGTH = 40;
const GIT_OID_ABBREV_LENGTH = 6;

interface ISerializedRepositoryState {
	lastRawRevisionSpecifier?: string;
}

export class RemoteGitRepository implements Repository, vscode.Disposable {

	public readonly fileSystem: vscode.FileSystemProvider & Revisioned;
	public readonly sourceControl: vscode.SourceControl;

	private resolveRevisionOperation?: Thenable<vscode.SCMRevision>;
	private statusBarItem: vscode.StatusBarItem;

	/**
	 * Things that rely on the current revision.
	 */
	private toRevision: Revisioned[] = [];

	private toDispose: vscode.Disposable[] = [];

	constructor(
		private root: vscode.Uri,
		private repo: string,
		private workspaceState: vscode.Memento,
	) {
		this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
		this.toDispose.push(this.statusBarItem);

		this.sourceControl = vscode.scm.createSourceControl('git', {
			label: 'Git',
			rootFolder: this.root,
		});
		this.toDispose.push(this.sourceControl);

		// Load last-viewed revision for repository.
		const repoState = workspaceState.get<ISerializedRepositoryState>(`repostate:${repo}`);
		this.revision = repoState && typeof repoState.lastRawRevisionSpecifier === 'string' ?
			{ rawSpecifier: repoState.lastRawRevisionSpecifier } :
			{ rawSpecifier: 'HEAD' };

		const fileSystem = new RemoteFileSystem(repo, this.sourceControl.revision!.rawSpecifier!);
		this.toDispose.push(fileSystem);
		this.toRevision.push(fileSystem);
		this.fileSystem = fileSystem;
	}

	set revision(revision: vscode.SCMRevision) {
		this.sourceControl.revision = revision;
		this.onUpdateRevision(false);

		const operation = this.resolveRevisionSpecifier(revision);
		this.resolveRevisionOperation = operation;
		operation.then(revision => {
			if (this.resolveRevisionOperation !== operation) {
				// Another resolve revision operation started after us, so ignore our result.
				return;
			}

			this.sourceControl.revision = revision;
			this.onUpdateRevision(false);
			this.toRevision.forEach(revisioned => revisioned.setRevision(revision.id!));

			// Serialize last-viewed revision for next time we open this repository.
			const data: ISerializedRepositoryState = { lastRawRevisionSpecifier: revision.rawSpecifier };
			this.workspaceState.update(`repostate:${this.repo}`, data);
		}, err => {
			this.onUpdateRevision(true);
		});
	}

	private onUpdateRevision(error: boolean): void {
		this.statusBarItem.command = SWITCH_REVISION_COMMAND_ID;
		if (error) {
			// TODO(sqs): handle repo cloning, repo-not-exists, and other errors; not all
			// of the errors are 'revision not found'.
			this.statusBarItem.text = '$(question) ' + localize('revisionNotFound', "Revision not found: {0}", this.sourceControl.revision!.rawSpecifier!);
			this.statusBarItem.tooltip = localize('switchRevision', "Switch Git revision...");
		} else if (!this.sourceControl.revision!.id) {
			this.statusBarItem.text = '$(ellipses)';
			this.statusBarItem.tooltip = localize('revisionLoading', "Loading revision {0}", this.sourceControl.revision!.rawSpecifier!);
		} else {
			let label: string;
			if (this.sourceControl.revision!.specifier === this.sourceControl.revision!.id && this.sourceControl.revision!.id!.length === GIT_OID_LENGTH) {
				// Full 40-character Git commit SHA-1.
				label = this.sourceControl.revision!.id!.slice(0, GIT_OID_ABBREV_LENGTH);
			} else {
				label = this.sourceControl.revision!.specifier!.replace(/^refs\/(heads|tags)\//, '');
			}
			this.statusBarItem.text = `$(git-branch) ${label}`;
			this.statusBarItem.tooltip = localize('switchRevision', "Switch Git revision...");
		}

		this.statusBarItem.show();
	}

	resolveRevisionSpecifier(input: vscode.SCMRevision, retriesRemaining: number = 100, messageShown: boolean = false): Thenable<vscode.SCMRevision> {
		const revision = { ...input }; // copy to avoid modifying original input
		if (!revision.specifier) {
			revision.specifier = revision.rawSpecifier || 'HEAD';
		}
		return requestGraphQL<any>(`
			query RepositoryRev($repo: String, $revision: String) {
				root {
					repository(uri: $repo) {
						defaultBranch
						commit(rev: $revision) {
							cloneInProgress
							commit {
								sha1
							}
						}
					}
				}
			}`,
			{ repo: this.repo, revision: revision.specifier },
			'remote/repository/resolveRevisionSpecifier',
		).then(root => {
			if (!root || !root.repository) {
				throw new Error(localize('repositoryNotFound', "Repository not found: {0}", this.repo));
			}
			if (root.repository.commit.cloneInProgress) {
				if (!messageShown) {
					messageShown = true;
					vscode.window.showInformationMessage(
						localize('waitForClone', "Cloning {0}", this.repo),
						localize('dismiss', "Dismiss"),
					);
				}
				if (retriesRemaining === 0) {
					if (messageShown) {
						vscode.commands.executeCommand('workbench.action.closeMessages');
					}
					throw new Error(localize('cloneFailed', 'Cloning did not finish.'));
				}
				return promiseResolveAfterTimeout(1000).then(() =>
					this.resolveRevisionSpecifier(input, retriesRemaining - 1, messageShown),
				);
			}
			if (messageShown) {
				vscode.commands.executeCommand('workbench.action.closeMessages');
			}
			if (!root.repository.commit.commit) {
				throw new Error(localize('revisionNotFound', "Revision not found: {0}", input.rawSpecifier));
			}

			if (revision.specifier === 'HEAD' && root.repository.defaultBranch) {
				revision.specifier = 'refs/heads/' + root.repository.defaultBranch;
			}
			revision.id = root.repository.commit.commit.sha1;

			return revision;
		});
	}

	listRefs(): Thenable<Ref[]> {
		return requestGraphQL<any>(`
			query RepositoryRev($repo: String, $rev: String) {
				root {
					repository(uri: $repo) {
						defaultBranch
						branches
						tags
					}
				}
			}`,
			{ repo: this.repo },
			'remote/repository/listRefs',
		).then(root => {
			const refs: Ref[] = [];
			if (root.repository) {
				root.repository.branches.forEach((branch: string) => {
					refs.push({
						type: RefType.Head,
						ref: 'refs/heads/' + branch,
						name: branch,
						isHEAD: branch === root.repository.defaultBranch,
					});
				});
				root.repository.tags.forEach((tag: string) => {
					refs.push({
						type: RefType.Tag,
						ref: 'refs/tags/' + tag,
						name: tag,
					});
				});
			}
			return refs;
		});
	}

	public dispose(): void {
		this.toDispose.forEach(disposable => disposable.dispose());
		this.toDispose = [];
	}
}

function promiseResolveAfterTimeout(timeout: number): Thenable<void> {
	return new Promise(resolve => setTimeout(resolve, timeout));
}
