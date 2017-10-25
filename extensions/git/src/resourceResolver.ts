/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { workspace, window, ProgressLocation, Uri, Disposable, OutputChannel, QuickPickOptions } from 'vscode';
import { Git, IGitErrorData, GitErrorCodes } from './git';
import { mkdirp, replaceVariables, uniqBy } from './util';
import { Model } from './model';
import { Repository } from './repository';
import * as nls from 'vscode-nls';
import { canonicalRemote } from './uri';
import { getBestRepositoryWorktree } from './repository_helpers';

const localize = nls.loadMessageBundle();

/**
 * A GitResource represents the fields we extract from a git URI that needs resolving.
 */
export interface GitResource {
	/** The cloneURL for a repository. eg https://github.com/foo/bar */
	cloneURL: string;

	/** The canonical name for the cloneURL. eg github.com/foo/bar */
	remote: string;

	/** Optionally the revision in a repository. Can be a commit hash or ref name. */
	revision?: string;
}

/**
 * GitResourceAtRevision is a GitResource with the revision specified.
 */
interface GitResourceAtRevision extends GitResource {
	/** the revision in a repository. Can be a commit hash or ref name. */
	revision: string;
}

interface PickOptions extends QuickPickOptions {
	/**
	 * If the repos passed to pick contain workspace roots, only the workspace
	 * roots are presented as options.
	 *
	 * eg: If we have five repos we can select, but two of them are already
	 * workspace roots then if this is true only those two workspace roots are
	 * presented as an option. If we have no workspace roots, then all repos are
	 * presented.
	 */
	autoSelectWorkspaceRoots?: boolean;
}

export class GitResourceResolver {

	private static SCHEMES = [
		'git',
		'git+https',
		'git+ssh',
		'git+http',
	];

	private disposables: Disposable[] = [];

	constructor(
		private git: Git,
		private model: Model,
		private outputChannel: OutputChannel,
	) {
		for (const scheme of GitResourceResolver.SCHEMES) {
			this.disposables.push(workspace.registerResourceResolutionProvider(scheme, this));
		}
	}

	public async resolveResource(resource: Uri): Promise<Uri> {
		// For 'git' scheme, avoid conflict with the TextDocumentContentProvider's git: URIs by only resolving URIs
		// with a host (authority). The TextDocumentContentProvider does not construct or handle these.
		if (resource.scheme === 'git' && !resource.authority) {
			return resource;
		}

		if (!workspace.getConfiguration('git').get<boolean>('enableNewResolver')) {
			return await this.resolveResourceDeprecated(resource);
		}

		try {
			const gitResource = this.parseResource(resource);
			this.log(localize('gitResourceInfo', "Resolving resource {0}@{1} from {2}", gitResource.remote, gitResource.revision || '', gitResource.cloneURL));
			const repo = await this.resolveRepository(this.parseResource(resource));
			if (!repo) {
				this.log(localize('resolveFailed', "Failed to resolve {0}\n", resource.toString()));
				return resource;
			}
			this.log(localize('resolveSuccess', "Successfully resolved {0} to {1}\n", resource.toString(), repo.root));
			return Uri.file(repo.root);
		} catch (e) {
			this.log(localize('resolveError', "Error to resolve {0}: {1}\n", resource.toString(), e.message || e));
			throw e;
		}
	}

	/** Resolves a GitResource to a Repository, potentially cloning it. */
	public async resolveRepository(resource: GitResource): Promise<Repository | undefined> {
		const repos = await this.findRepositoriesWithRemote(resource.remote);
		if (repos.length === 0) {
			// We have no repositories pointing to this remote, so we clone it.
			return await this.clone(resource);
		}

		// We have repositories. If it doesn't need to be at a specific revision
		// we let the user pick one.
		if (!hasRevision(resource)) {
			return await this.pick(resource, repos, { autoSelectWorkspaceRoots: true });
		}

		// Find repositories which are either at revision or can be fast
		// forwarded to revision.
		const reposAtRevision = await this.filterReposAtRevision(resource, repos);
		if (reposAtRevision.length > 0) {
			const repo = await this.pick(resource, repos, { autoSelectWorkspaceRoots: true });
			// TODO(keegan) What if the working copy is dirty?
			await this.fastForward(repo, resource);
			return repo;
		}

		const repo = await this.pick(resource, repos, {
			placeHolder: localize('checkoutExistingRepo', "Choose a repository to stash and checkout {0}@{1}", resource.remote, resource.revision),
		});
		await this.stashAndCheckout(repo, resource);
		return repo;
	}

	/**
	 * Parses a git resource. For example git+ssh://git@github.com/foo/bar.git?master returns
	 * { remote: "github.com/foo/bar", cloneURL: "ssh://git@github.com/foo/bar.git", revision: "master" }
	 *
	 * If the resource is invalid, an error is thrown.
	 */
	private parseResource(resource: Uri): GitResource {
		const revision = resource.query || undefined;
		resource = resource.with({ query: null } as any);

		// `git clone` doesn't actually understand the 'git+' prefix on the URI scheme.
		if (resource.scheme.startsWith('git+')) {
			resource = resource.with({ scheme: resource.scheme.replace(/^git\+/, '') });
		}

		const cloneURL = resource.toString();
		const remote = canonicalRemote(cloneURL);
		if (remote === undefined) {
			throw new Error(`Invalid git clone URL ${cloneURL}`);
		}

		return {
			remote,
			cloneURL,
			revision,
		};
	}

	private async findRepositoriesWithRemote(remote: string): Promise<Repository[]> {
		// First include repositories that are already open that have remote
		const open = this.model.repositories.filter(repo => repo.remotes.some(r => canonicalRemote(r.url) === remote));

		// Next check if we have already cloned the repo to our well-known location
		const wellKnownPath = this.getFolderPath(remote);
		await this.model.tryOpenRepository(wellKnownPath, true);
		const wellKnownRepo = this.model.getRepository(wellKnownPath, true);
		const wellKnownRepos: Repository[] = [];
		if (wellKnownRepo) {
			wellKnownRepos.push(wellKnownRepo);
		}

		// Now include repos we have discovered in the users homedir
		const other = await this.model.tryOpenRepositoryWithRemote(remote);

		const repos = uniqBy([...open, ...wellKnownRepos, ...other], repo => repo.root);
		this.log(localize('findRepos', "Found {0} repositories for {1}: {2}", repos.length, remote, repos.map(r => r.root).join(' ')));
		return repos;
	}

	private async filterReposAtRevision(resource: GitResourceAtRevision, repos: Repository[]): Promise<Repository[]> {
		const reposAtRevision = await Promise.all(repos.map(async repo => {
			const allowedToCheck = await this.headMatchesUpstream(repo, resource.revision);
			if (!allowedToCheck) {
				this.log(localize('headMatchesUpstream', "{0} HEAD does not match {1}", repo.root, resource.revision));
				return undefined;
			}

			// Fetch if we are a ref or are missing the hash
			if (!isAbsoluteCommitID(resource.revision)) {
				await repo.executeCommand(['fetch', '--prune', resource.cloneURL, resource.revision]);
			} else if (!await this.hasCommit(repo, resource.revision)) {
				await repo.fetch({ all: true, prune: true });
				if (!await this.hasCommit(repo, resource.revision)) {
					this.log(localize('missingHash', "{0} does not have {1}", repo.root, resource.revision));
					return undefined;
				}
			}

			// The ref for an abs commit is itself, otherwise we just fetched the upstream branch (FETCH_HEAD)
			const targetRef = isAbsoluteCommitID(resource.revision) ? resource.revision : 'FETCH_HEAD';
			let canFF: boolean;
			try {
				// Check if the first <commit> is an ancestor of the second <commit>,
				// and exit with status 0 if true, or with status 1 if not
				// https://git-scm.com/docs/git-merge-base#git-merge-base---is-ancestor
				await repo.executeCommand(['merge-base', '--is-ancestor', 'HEAD', targetRef]);
				canFF = true;
			} catch (e) {
				// Errors are signaled by a non-zero status that is not 1
				if (!e || !e.error || e.error.exitCode !== 1) {
					throw e;
				}
				this.log(localize('cantFF', "{0} can't be fast-forwarded to {1}@{2}", repo.root, resource.remote, resource.revision));
				canFF = false;
			}

			return canFF ? repo : undefined;
		}));
		const reposFiltered = reposAtRevision.filter(r => !!r) as Repository[];
		this.log(localize('findReposAtRevision', "Found {0} repositories at {1} for {2}: {3}", reposFiltered.length, resource.revision, resource.remote, reposFiltered.map(r => r.root).join(' ')));
		return reposFiltered;
	}

	/**
	 * Will fast forward the working copy to resource.revision. For branches it
	 * relies on FETCH_HEAD being set, as such it will run fetch if
	 * filterReposAtRevision has not run fetch yet.
	 */
	private async fastForward(repo: Repository, resource: GitResourceAtRevision): Promise<void> {
		this.log(localize('fastforward', "Fast-forwarding {0}", repo.root));

		// If head does not match upstream it means we did not run fetch in
		// filterReposAtRevision. If that is the case we need to run fetch for
		// FF to work.
		if (!await this.headMatchesUpstream(repo, resource.revision)) {
			// This logic is copied from filterReposAtRevision, except throws on missing commit
			if (!isAbsoluteCommitID(resource.revision)) {
				await repo.executeCommand(['fetch', '--prune', resource.cloneURL, resource.revision]);
			} else if (!await this.hasCommit(repo, resource.revision)) {
				await repo.fetch({ all: true, prune: true });
				if (!await this.hasCommit(repo, resource.revision)) {
					throw new Error(localize('missingHash', "{0} does not have {1}", repo.root, resource.revision));
				}
			}
		}

		// The ref for an abs commit is itself, otherwise we just fetched the upstream branch (FETCH_HEAD)
		const targetRef = isAbsoluteCommitID(resource.revision) ? resource.revision : 'FETCH_HEAD';
		// TODO(keegan) prompt user?
		await repo.executeCommand(['merge', '--ff-only', targetRef]);
	}

	private async clone(resource: GitResource): Promise<Repository> {
		const dir = this.getFolderPath(resource.remote);
		this.log(localize('cloningResource', "Cloning {0}@{1} from {2} to {3}", resource.remote, resource.revision || 'HEAD', resource.cloneURL, dir));
		await mkdirp(path.dirname(dir));
		const uri = await this.cloneAndCheckout(resource.cloneURL, dir, resource.remote, resource.revision || null);
		return this.mustOpenRepository(uri.fsPath);
	}

	/** Opens the repository at path, throws an exception if that fails. */
	private async mustOpenRepository(path: string): Promise<Repository> {
		await this.model.tryOpenRepository(path, true);
		const repo = this.model.getRepository(path, true);
		if (!repo) {
			throw new Error('Unable to open repository at ' + path);
		}
		return repo;
	}

	private async hasCommit(repo: Repository, ref: string): Promise<boolean> {
		try {
			await repo.getCommit(ref);
			return true;
		} catch (e) {
			return false;
		}
	}

	/**
	 * If we are on a branch, only proceed if the upstream branch matches or the
	 * name matches. I (Keegan) always have my upstream branch set to
	 * origin/master, which is why I added the name match check.
	 */
	private async headMatchesUpstream(repo: Repository, revision: string): Promise<boolean> {
		const head = await repo.getHEAD();
		if (head.name) {
			if (head.name === revision || head.commit === revision) {
				return true;
			}
			const branch = await repo.getBranch(head.name);
			return branch.upstream === revision || branch.commit === revision;
		}
		// We allow modifying a detached head
		return true;
	}

	private async pick(resource: GitResource, repos: Repository[], options?: PickOptions): Promise<Repository> {
		if (!options) {
			options = {};
		}

		if (options.autoSelectWorkspaceRoots) {
			// If we have repos that are already workspace roots, only include them
			const inWorkspace = repos.filter(repo => (workspace.workspaceFolders || []).some(f => f.uri.fsPath === repo.root));
			if (inWorkspace.length > 0) {
				repos = inWorkspace;
			}

			if (repos.length === 1) {
				return repos[0];
			}
		}

		const picks = repos.map(repo => {
			return {
				label: path.basename(repo.root),
				description: [repo.headLabel, repo.syncLabel, repo.root]
					.filter(l => !!l)
					.join(' '),
				repo,
			};
		});

		if (!options.placeHolder) {
			options.placeHolder = localize('pickExistingRepo', "Choose a clone for repository {0}", resource.remote);
		}
		const pick = await window.showQuickPick(picks, options);
		if (!pick) {
			// TODO(keegan) be more graceful
			throw new Error('did not pick repo');
		}
		return pick.repo;
	}

	private async stashAndCheckout(repo: Repository, resource: GitResourceAtRevision): Promise<void> {
		const head = await repo.getHEAD();
		try {
			const msg = localize('stashAndCheckout', "WIP on {0} to checkout {1}", head.name || head.commit, resource.revision);
			await repo.createStash(msg);
			this.log(`Stashed ${repo.root} ${msg}`);
		} catch (e) {
			if (!e.gitErrorCode || e.gitErrorCode !== GitErrorCodes.NoLocalChanges) {
				throw e;
			}
			this.log(localize('checkout', "Checking out {0} to {1}", repo.root, resource.revision));
		}
		await repo.checkout(resource.revision);
		await this.fastForward(repo, resource);
	}

	private log(s: string) {
		const d = new Date();
		this.outputChannel.appendLine(`${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}.${d.getMilliseconds()} ${s}`);
	}

	public async resolveResourceDeprecated(resource: Uri): Promise<Uri> {
		// We only attempt to use worktree if the revision is set.
		const autoWorktreeEnabled = workspace.getConfiguration('git').get<boolean>('enableAutoWorktree');
		const revision = (autoWorktreeEnabled && resource.query) || null;
		let repoUri = resource.with({ query: null } as any);

		// For 'git' scheme, avoid conflict with the TextDocumentContentProvider's git: URIs by only resolving URIs
		// with a host (authority). The TextDocumentContentProvider does not construct or handle these.
		if (repoUri.scheme === 'git' && !repoUri.authority) {
			return repoUri;
		}

		// `git clone` doesn't actually understand the 'git+' prefix on the URI scheme.
		if (repoUri.scheme.startsWith('git+')) {
			repoUri = repoUri.with({ scheme: repoUri.scheme.replace(/^git\+/, '') });
		}
		const canonicalResource = canonicalRemote(repoUri.toString());

		// See if a repository with this clone URL already exists. This is best-effort and is based on string
		// equality between our unresolved resource URI and the repositories' remote URLs.
		if (canonicalResource && revision) {
			const repoAndworktree = await this.findRepositoryWithRemoteRevision(canonicalResource, revision);
			if (repoAndworktree) {
				const [, worktreePath] = repoAndworktree;
				return Uri.file(worktreePath);
			}
		}

		const reposForRemote = await this.model.tryOpenRepositoryWithRemote(repoUri);
		if (reposForRemote.length > 0 && !revision) {
			if (reposForRemote.length === 1) {
				return Uri.file(reposForRemote[0].root);
			}
			const picks = reposForRemote.map(repo => {
				return {
					label: path.basename(repo.root),
					description: [repo.headLabel, repo.syncLabel, repo.root]
						.filter(l => !!l)
						.join(' '),
					repo,
				};
			});
			const placeHolder = localize('pickExistingRepo', "Choose a clone for repository {0}", canonicalResource);
			const pick = await window.showQuickPick(picks, { placeHolder });
			if (pick) {
				return Uri.file(pick.repo.root);
			}
		}
		if (reposForRemote.length > 0 && revision) {
			const repoForRemote = reposForRemote[0];
			const headCommit = await repoForRemote.getCommit('HEAD');
			if (headCommit.hash === revision) {
				return Uri.file(repoForRemote.root);
			}
			if (canonicalResource) {
				const best = await getBestRepositoryWorktree([repoForRemote], canonicalResource, revision);
				if (best) {
					const [, worktreePath] = best;
					return Uri.file(worktreePath);
				}
			}
		}

		// Repository doesn't exist (or we don't know about it), so clone it to a temporary location.
		const folderPath = this.getFolderPath(repoUri);
		await mkdirp(path.dirname(folderPath));
		const cloneUrl = repoUri.toString();
		const displayName = canonicalResource || repoUri.toString();
		return await this.cloneAndCheckout(cloneUrl, folderPath, displayName, revision);
	}

	/**
	 * Returns repository and worktree root for the specified canonical resource and revision.
	 *
	 * @param canonicalResource is a URI that identifies a remote repository (e.g., "github.com/me/myrepo")
	 * @param revision is a revision with respect to the remote repository (e.g., "mybranch" or "f79fab5010584ecab400f2f225770f26eb59f4e9")
	 */
	private async findRepositoryWithRemoteRevision(canonicalResource: string, revision: string): Promise<[Repository, string] | null> {
		const repositoriesWithRemote = this.model.repositories.filter(
			rpo => rpo.remotes.filter(rmt => canonicalRemote(rmt.url) === canonicalResource).length > 0
		);
		return await getBestRepositoryWorktree(repositoriesWithRemote, canonicalResource, revision);
	}

	/**
	 * cloneAndCheckout clones a repository to a path and checks it out to a revision. It returns the
	 * Uri to the cloned repository on disk.
	 */
	private async cloneAndCheckout(cloneUrl: string, directory: string, displayName: string, rev: string | null): Promise<Uri> {

		try {
			// Clone
			const clonePromise = this.git.exec(path.dirname(directory), ['clone', cloneUrl, directory]);
			window.withProgress({ location: ProgressLocation.SourceControl, title: localize('cloning', "Cloning {0}...", displayName) }, () => clonePromise);
			window.withProgress({ location: ProgressLocation.Window, title: localize('cloning', "Cloning {0}...", displayName) }, () => clonePromise);
			await clonePromise;

			// Checkout
			const repo = this.git.open(directory);
			if (rev) {
				await repo.checkout(rev, []);
			}

			return Uri.file(directory);
		} catch (anyErr) {
			const err = anyErr as IGitErrorData;
			if (fs.existsSync(directory)) {
				// The repository directory exists on disk, so try reusing it.
				await this.model.tryOpenRepository(directory, true);
				const repository = this.model.getRepository(directory, true);
				if (!repository) {
					throw new Error(localize('notAGitRepository', "Directory is not a valid Git repository: {0}", directory));
				}
				return Uri.file(repository.root);
			} else {
				this.outputChannel.show();
				// Give advice for github, since it is a common failure path
				if (cloneUrl.toLowerCase().indexOf('github.com') >= 0) {
					this.log(localize('cloneFailedGitHubAdvice', "GitHub clone failed. Adjust github.cloneProtocol user setting to use ssh or https instead."));
				}
				throw new Error(localize('cloneFailed', "Cloning failed: {0} (see output for details)", err.message));
			}
		}
	}

	private getFolderPath(remote: Uri | string): string {
		if (remote instanceof Uri) {
			remote = canonicalRemote(remote.toString()) || '';
			if (remote === '') {
				throw new Error('Invalid git clone URL');
			}
		}
		const folderRelativePath = remote;
		const homePath = os.homedir();
		const separator = path.sep;

		const pathTemplate = workspace.getConfiguration('folders').get<string>('path')!;
		return replaceVariables(pathTemplate, { folderRelativePath, homePath, separator });
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

function hasRevision(resource: GitResource): resource is GitResourceAtRevision {
	return resource.revision !== undefined;
}

function isAbsoluteCommitID(revision: string): boolean {
	// Surprisingly this is the same check used in the Git codebase.
	return revision.length === 40;
}
