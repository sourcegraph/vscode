/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { RepoFileSystem } from './fileSystem';
import { Revisioned, Repository, REPO_SCHEME, parseResourceRevision } from './repository';
import { requestGraphQL } from './util';
import * as nls from 'vscode-nls';
import { SWITCH_REVISION_COMMAND_ID } from './workspace';
import * as path from 'path';

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

export class GitRepository implements Repository, vscode.Disposable {

	public readonly fileSystem: vscode.FileSystemProvider & Revisioned;
	private readonly sourceControl: vscode.SourceControl;

	private resolveRevisionOperation: Thenable<vscode.SCMRevision>;

	/**
	 * The error, if any, from the last resolveRevisionOperation.
	 */
	private resolveRevisionError: Error | undefined;

	/**
	 * Things that rely on the current revision.
	 */
	private toRevision: Revisioned[] = [];

	private _onDidChangeStatus = new vscode.EventEmitter<void>();
	public get onDidChangeStatus(): vscode.Event<void> { return this._onDidChangeStatus.event; }

	private toDispose: vscode.Disposable[] = [];

	constructor(
		private root: vscode.Uri,
		private workspaceState: vscode.Memento,
	) {
		this.sourceControl = vscode.scm.createSourceControl('git', {
			label: 'Git',
			rootFolder: this.root,
		});
		this.sourceControl.commandExecutor = this;
		this.toDispose.push(this.sourceControl);

		// Register setRevisionCommand.
		//
		// TODO(sqs): rethink this setRevisionCommand API because it requires registering
		// one command per source control, which is excessive.
		const commandId = `repo.git.setRevision[${root.toString()}]`;
		this.toDispose.push(vscode.commands.registerCommand(commandId, (revision?: vscode.SCMRevision): void => {
			if (revision) {
				this.revision = revision;
			} else {
				this.openRevisionPicker();
			}
		}));
		this.sourceControl.setRevisionCommand = {
			title: localize('repo.git.setRevision', "Set revision for {0}", this.label),
			command: commandId,
		};

		// Load last-viewed revision for repository.
		let revision: vscode.SCMRevision | undefined;
		const rawRevisionSpecifier = parseResourceRevision(root);
		if (rawRevisionSpecifier) {
			revision = { rawSpecifier: rawRevisionSpecifier };
		}
		if (!revision) {
			const repoState = workspaceState.get<ISerializedRepositoryState>(`repostate:${root.toString()}`);
			revision = repoState && typeof repoState.lastRawRevisionSpecifier === 'string' ?
				{ rawSpecifier: repoState.lastRawRevisionSpecifier } : undefined;
		}
		if (!revision) {
			revision = { rawSpecifier: 'HEAD' };
		}
		this.revision = revision;

		const fileSystem = new RepoFileSystem(this.root, this.label, this.sourceControl.revision!.rawSpecifier!);
		this.toDispose.push(fileSystem);
		this.toRevision.push(fileSystem);
		this.fileSystem = fileSystem;
	}

	private get label(): string {
		return this.root.authority + this.root.path;
	}

	public get resolvedRevision(): Thenable<vscode.SCMRevision> {
		return this.resolveRevisionOperation;
	}

	public get revision(): vscode.SCMRevision { return this.sourceControl.revision!; }

	public set revision(revision: vscode.SCMRevision) {
		if (!revision) {
			throw new Error(`invalid empty revision for repository ${this.root.toString()}`);
		}

		if (revisionsEqual(revision, this.sourceControl.revision)) {
			return;
		}

		this.sourceControl.revision = revision;

		const operation = this.resolveRevisionSpecifier(revision);
		this.resolveRevisionOperation = operation;
		this.resolveRevisionError = undefined;
		this._onDidChangeStatus.fire();
		operation.then(revision => {
			if (this.resolveRevisionOperation !== operation) {
				// Another resolve revision operation started after us, so ignore our result.
				return;
			}

			this.sourceControl.revision = revision;
			this.resolveRevisionError = undefined;
			this.toRevision.forEach(revisioned => revisioned.setRevision(revision.id!));

			// Serialize last-viewed revision for next time we open this repository.
			const data: ISerializedRepositoryState = { lastRawRevisionSpecifier: revision.rawSpecifier };
			this.workspaceState.update(`repostate:${this.root.toString()}`, data);
		}, err => {
			this.resolveRevisionError = err;
		})
			.then(() => this._onDidChangeStatus.fire());
	}

	public renderStatusBarItem(statusBarItem: vscode.StatusBarItem): void {
		const canSwitchRevision = this.root.scheme === REPO_SCHEME;

		let switchRevisionTooltip: string;
		if (canSwitchRevision) {
			statusBarItem.command = SWITCH_REVISION_COMMAND_ID;
			switchRevisionTooltip = localize('switchRevision', "Repository {0}: Switch Git revision...", this.label);
		} else {
			// Can't change revision of repo+version (immutable) repos.
			statusBarItem.command = undefined;
			switchRevisionTooltip = localize('cantSwitchRevision', "Repository {0}: Open Containing Repository to switch revision.", this.label);
		}

		if (this.resolveRevisionError) {
			// TODO(sqs): handle repo cloning, repo-not-exists, and other errors; not all
			// of the errors are 'revision not found'.
			statusBarItem.text = '$(question) ' + localize('revisionNotFound', "Revision not found: {0}", this.sourceControl.revision!.rawSpecifier!);
			statusBarItem.tooltip = switchRevisionTooltip;
		} else if (!this.sourceControl.revision!.id) {
			statusBarItem.text = '$(ellipses) (${path.basename(this.repo)})';
			statusBarItem.tooltip = localize('revisionLoading', "Loading revision {0} in repository {1}", this.sourceControl.revision!.rawSpecifier!, this.label);
		} else {
			let label: string;

			const isSHA = this.sourceControl.revision!.specifier === this.sourceControl.revision!.id && this.sourceControl.revision!.id!.length === GIT_OID_LENGTH;
			const isHEAD = this.sourceControl.revision!.rawSpecifier === 'HEAD';
			if (isSHA || isHEAD) {
				label = this.sourceControl.revision!.id!.slice(0, GIT_OID_ABBREV_LENGTH);
			} else {
				label = this.sourceControl.revision!.specifier!.replace(/^refs\/(heads|tags)\//, '');
			}
			statusBarItem.text = `$(git-branch) ${label} (${path.basename(this.label)})`;
			statusBarItem.tooltip = switchRevisionTooltip;
		}
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
			{ repo: this.label, revision: revision.specifier },
			'repo/repository/resolveRevisionSpecifier',
		).then(root => {
			if (!root || !root.repository) {
				throw new Error(localize('repositoryNotFound', "Repository not found: {0}", this.label));
			}
			if (root.repository.commit.cloneInProgress) {
				if (!messageShown) {
					messageShown = true;
					vscode.window.showInformationMessage(
						localize('waitForClone', "Cloning {0}", this.label),
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
			{ repo: this.label },
			'repo/repository/listRefs',
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

	public executeCommand(args: string[]): Thenable<string> {
		return requestGraphQL<any>(`
			query gitCmdRaw($repo: String, $params: [String]) {
				root {
					repository(uri: $repo) {
						gitCmdRaw(params: $params)
					}
				}
			}`,
			{ repo: this.label, params: args },
			'repo/repository/gitCmdRaw',
		).then(root => root.repository.gitCmdRaw || '');
	}

	public openRevisionPicker(): void {
		this.listRefs().then(
			(refs: Ref[]) => {
				const currentRef = this.revision.specifier;
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
						this.revision = { rawSpecifier: pick.ref.name, specifier: pick.ref.ref };
					}
				});
			},
			err => vscode.window.showErrorMessage(localize('switchRevisionError', "Error switching revision: {0}", err)),
		);
	}

	public dispose(): void {
		this.toDispose.forEach(disposable => disposable.dispose());
		this.toDispose = [];
	}
}

function promiseResolveAfterTimeout(timeout: number): Thenable<void> {
	return new Promise(resolve => setTimeout(resolve, timeout));
}

function revisionsEqual(a: vscode.SCMRevision | undefined, b: vscode.SCMRevision | undefined): boolean {
	return Boolean((!a && !b) ||
		(a && b && a.rawSpecifier === b.rawSpecifier && a.specifier === b.specifier && a.id === b.id));
}
