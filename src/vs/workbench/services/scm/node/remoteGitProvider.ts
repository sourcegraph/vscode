/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as strings from 'vs/base/common/strings';
import { create as createError } from 'vs/base/common/errors';
import { localize } from 'vs/nls';
import { ISCMRevision } from 'vs/workbench/services/scm/common/scm';
import { AbstractSCMProvider, IResource, Status } from 'vs/workbench/services/scm/common/scmProvider';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IRemoteService, requestGraphQL } from 'vs/platform/remote/node/remote';
import { Command } from 'vs/editor/common/modes';
import { Action } from 'vs/base/common/actions';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

// Taken from extensions/git
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
// END - Taken from extensions/git

/**
 * gitCmdCache caches the result for a git command based. This helps prevent multiple round trip fetches
 * for content we have already resolved.
 */
const gitCmdCache = new Map<string, string>();

/**
 * SCM provider that represents a repository hosted on Sourcegraph.com.
 */
export class RemoteGitSCMProvider extends AbstractSCMProvider {
	static ID = 'git';
	static LABEL = localize('TODO-1239843', "git");

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IRemoteService private remoteService: IRemoteService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(RemoteGitSCMProvider.ID, RemoteGitSCMProvider.LABEL);
	}

	private get repo(): string | undefined {
		const workspace = this.contextService.getWorkspace();
		if (!workspace) { return undefined; }
		return workspace.roots[0].authority + workspace.roots[0].path;
	}

	private get stateInfo(): GitSCMStateInfo {
		if (this.revisionLastResolutionError) {
			return { label: 'Revision Not Found', objectType: GitSCMStateType.NotFound };
		}
		if (!this.revision) {
			return { label: '', objectType: GitSCMStateType.Loading };
		}
		return parseGitRevSpec(this.revision.rawSpecifier || this.revision.specifier);
	}

	get statusBarCommands(): Command[] {
		const info = this.stateInfo;
		if (info) {
			return [
				{
					id: 'remoteGit.action.switchRevision',
					title: '$(' + iconForObjectType(info.objectType) + ') ' + info.label,
					tooltip: 'Switch Git revision...',
				},
			];
		}
		return [];
	}

	getOriginalResource(uri: URI): TPromise<URI> {
		return TPromise.wrap(null);
	}

	resolveRevision(input: ISCMRevision): TPromise<ISCMRevision> {
		if (!this.repo) {
			return TPromise.wrapError(new Error('not in a workspace'));
		}
		return this.resolveRevisionSpecifier(this.repo, input, 500, false);
	}

	/**
	 * Resolves a Git revision specifier for a remote Git repository.
	 *
	 * @param retriesRemaining The maximum amount of retries done if the repo is clone-in-progress
	 */
	resolveRevisionSpecifier(repo: string, input: ISCMRevision, retriesRemaining: number, messageShown: boolean): TPromise<ISCMRevision> {
		const revision = { ...input }; // copy to avoid modifying original input
		if (!revision.specifier) {
			revision.specifier = revision.rawSpecifier || 'HEAD';
		}
		return requestGraphQL<any>(this.remoteService, `query RepositoryRev($repo: String, $revision: String) {
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
			{ repo, revision: revision.specifier },
		).then(root => {
			if (!root || !root.repository) {
				return TPromise.wrapError(new Error('Repository not found: ' + repo));
			}
			if (root.repository.commit.cloneInProgress) {
				if (!messageShown) {
					messageShown = true;
					const messageService = this.instantiationService.createInstance(MessageServiceAccessor).messageService;
					const msg = localize('sg.waitForClone', "Cloning {0}");
					messageService.show(Severity.Info, {
						message: strings.format(msg, repo),
						actions: [
							new Action('dismiss.message', localize('dismiss', "Dismiss"), null, true, () => TPromise.as(true)),
						],
					});
				}
				if (retriesRemaining === 0) {
					if (messageShown) {
						this.instantiationService.createInstance(MessageServiceAccessor).messageService.hideAll();
					}
					throw createError(localize('sg.cloneFailed', 'Cloning did not finish.'));
				}
				return TPromise.timeout(1000).then(() => this.resolveRevisionSpecifier(repo, input, retriesRemaining - 1, messageShown));
			}
			if (messageShown) {
				this.instantiationService.createInstance(MessageServiceAccessor).messageService.hideAll();
			}
			if (!root.repository.commit.commit) {
				return TPromise.wrapError(new Error('Revision not found: ' + (input.rawSpecifier || '(empty)')));
			}

			if (revision.specifier === 'HEAD' && root.repository.defaultBranch) {
				revision.specifier = 'refs/heads/' + root.repository.defaultBranch;
			}
			revision.id = root.repository.commit.commit.sha1;

			return revision;
		});
	}

	getDiff(from: ISCMRevision, to: ISCMRevision): TPromise<IResource[]> {
		return this.rawGitCommand(this.repo, ['diff', '--name-status', '-C', '-C', from.id, to.id]).then(output => {
			const lines = (output || '').split('\n').filter(s => s.length);
			const resources: IResource[] = [];
			for (const line of lines) {
				const [state, file, renamedTo] = line.split(/[\s]+/, 3);
				const fromUri = URI.parse(`gitremote://${this.repo}/${file}?${from.id}`);
				const toUri = URI.parse(`repo://${this.repo}/${renamedTo || file}`);
				const status = this.parseStatus(state);
				resources.push({ fromUri, toUri, from, to, status });
			}
			return resources;
		});
	}

	private parseStatus(state: string): Status {
		switch (state.charAt(0)) {
			case 'A':
				return Status.Added;
			case 'C':
				return Status.Copied;
			case 'D':
				return Status.Deleted;
			case 'M':
				return Status.Modified;
			case 'R':
				return Status.Renamed;
			default:
				return Status.Unknown;
		}
	}

	private rawGitCommand(repo: string, params: string[]): TPromise<string> {
		const key = `${repo}:${params.toString()}`;
		const cachedResponse = gitCmdCache.get(key);
		if (cachedResponse) {
			return TPromise.wrap(cachedResponse);
		}
		return requestGraphQL<any>(this.remoteService, `query gitCmdRaw($repo: String, $params: [String]) {
			root {
				repository(uri: $repo) {
					gitCmdRaw(params: $params)
				}
			}
		}`,
			{ repo: this.repo, params },
		).then(root => {
			if (!root.repository || !root.repository.gitCmdRaw) {
				return null;
			}
			gitCmdCache.set(key, root.repository.gitCmdRaw);
			return root.repository.gitCmdRaw;
		});
	}

	listRefs(): TPromise<Ref[]> {
		if (!this.repo) {
			return TPromise.wrapError(new Error('not in a workspace'));
		}

		return requestGraphQL<any>(this.remoteService, `query RepositoryRev($repo: String, $rev: String) {
			root {
				repository(uri: $repo) {
					defaultBranch
					branches
					tags
				}
			}
		}`,
			{ repo: this.repo },
		).then(root => {
			const refs: Ref[] = [];
			if (root.repository && root.repository.branches) {
				root.repository.branches.forEach(branch => {
					refs.push({
						type: RefType.Head,
						ref: 'refs/heads/' + branch,
						name: branch,
						isHEAD: branch === root.repository.defaultBranch,
					});
				});
				root.repository.tags.forEach(tag => {
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
}

/**
 * The set of possible types for the SCM revision state.
 */
enum GitSCMStateType {
	/**
	 * The SCM revision specifier does not resolve to any existing Git object or ref in the repository.
	 */
	NotFound,

	/**
	 * Resolving the SCM revision specifier is not yet complete.
	 */
	Loading,

	/**
	 * The SCM revision specifier resolved successfully but the thing it refers to doesn't fall
	 * into any existing category.
	 */
	Unknown,

	/**
	 * The SCM revision specifier resolved to a Git ref underneath refs/heads/ (i.e., a Git branch).
	 */
	Head,

	/**
	 * The SCM revision specifier resolved to a Git ref underneath refs/tags/ (i.e., a Git tag).
	 */
	Tag,

	/**
	 * The SCM revision specifier resolved to a Git commit.
	 */
	Commit,
}

interface GitSCMStateInfo {
	label: string;
	objectType: GitSCMStateType;
}

const GIT_OID_LENGTH = 40;
const GIT_OID_ABBREV_LENGTH = 6;

function parseGitRevSpec(revspec: string): GitSCMStateInfo {
	let label: string;
	let objectType: GitSCMStateType;
	if (strings.startsWith(revspec, 'refs/heads/')) {
		label = strings.ltrim(revspec, 'refs/heads/');
		objectType = GitSCMStateType.Head;
	} else if (strings.startsWith(revspec, 'refs/tags/')) {
		label = strings.ltrim(revspec, 'refs/tags/');
		objectType = GitSCMStateType.Tag;
	} else if (strings.startsWith(revspec, 'refs/')) {
		label = strings.ltrim(revspec, 'refs/');
		objectType = GitSCMStateType.Unknown;
	} else if (revspec.length === GIT_OID_LENGTH) {
		label = revspec.slice(0, GIT_OID_ABBREV_LENGTH);
		objectType = GitSCMStateType.Commit;
	} else {
		label = revspec;
		objectType = GitSCMStateType.Unknown;
	}
	return { label, objectType };
}

function iconForObjectType(objectType: GitSCMStateType): string {
	switch (objectType) {
		case GitSCMStateType.NotFound:
			return 'question';
		case GitSCMStateType.Loading:
			return 'ellipses';
		case GitSCMStateType.Unknown:
			// TODO(sqs): default to branch icon, until our graphql api can tell us what the revspec resolves to
			return 'git-branch';
		case GitSCMStateType.Head:
			return 'git-branch';
		case GitSCMStateType.Tag:
			return 'tag';
		case GitSCMStateType.Commit:
			return 'git-commit';
		default:
			return 'question';
	}
}

class MessageServiceAccessor {
	constructor(
		@IMessageService public messageService: IMessageService,
	) {
	}
}
