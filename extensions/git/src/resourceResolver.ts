/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { workspace, window, ProgressLocation, Uri, Disposable } from 'vscode';
import { Git, IGitErrorData } from './git';
import { CommandCenter } from './commands';
import { mkdirp, replaceVariables, uniqBy } from './util';
import { Model } from './model';
import { Repository } from './repository';
import * as nls from 'vscode-nls';
import { canonicalRemote } from './uri';
import { getBestRepositoryWorktree, getRepositoryWorktree, createTempWorktree } from './repository_helpers';

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
		private commands: CommandCenter,
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

		const repo = await this.resolveRepository(this.parseResource(resource));
		if (!repo) {
			return resource;
		}
		return Uri.file(repo.root);
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
			return await this.pick(resource, repos);
		}

		// Find repositories which are either at revision or can be fast
		// forwarded to revision.
		const reposAtRevision = await this.filterReposAtRevision(resource, repos);
		if (reposAtRevision.length > 0) {
			const repo = await this.pick(resource, repos);
			// TODO(keegan) What if the working copy is dirty?
			await this.fastForward(resource, repo);
			return repo;
		}

		// TODO(keegan) the worktree code seems to expect an absolute revision. We should resolve one.
		// But we also have an issue around ensuring the commit is actually in repos[0]
		this.git.log(localize('useWorktree', "Creating worktree since no repo could automatically be moved to {0}@{1}.", resource.remote, resource.revision));
		const worktree = await getRepositoryWorktree(repos[0], resource.revision);
		if (worktree) {
			return await this.mustOpenRepository(worktree.path);
		}
		const newWorktree = await createTempWorktree(repos[0], resource.revision);
		return await this.mustOpenRepository(newWorktree.path);
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
		const open = this.model.repositories.filter(repo => {
			return repo.remotes.filter(r => canonicalRemote(r.url) === remote).length > 0;
		});

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

		const repos = uniqBy(open.concat(wellKnownRepos).concat(other), repo => repo.root);
		this.git.log(localize('findRepos', "Found {0} repositories for {1}: {2}", repos.length, remote, repos.map(r => r.root).join(' ')));
		return repos;
	}

	private filterReposAtRevision(resource: GitResourceAtRevision, repos: Repository[]): Promise<Repository[]> {
		return Promise.all(repos.map(async repo => {
			// Fetch if we are a ref or are missing the hash
			if (!isAbsoluteCommitID(resource.revision)) {
				await repo.executeCommand(['fetch', resource.cloneURL, resource.revision]);
				// TODO(keegan) Do I need to ensure our upstream tracking branch is revision?
				// Or is just checking FF sufficient?
			} else if (!await this.hasCommit(repo, resource.revision)) {
				await repo.fetch({ all: true });
				if (!await this.hasCommit(repo, resource.revision)) {
					this.git.log(localize('missingHash', "{0} does not have {1}", repo.root, resource.revision));
					return undefined;
				}
			}

			// The ref for an abs commit is itself, otherwise we just fetched the upstream branch (FETCH_HEAD)
			const targetRef = isAbsoluteCommitID(resource.revision) ? resource.revision : 'FETCH_HEAD';
			let canFF: boolean;
			try {
				await repo.executeCommand(['merge-base', '--is-ancestor', 'HEAD', targetRef]);
				canFF = true;
			} catch (e) {
				this.git.log(localize('cantFF', "{0} can't be fast-forwarded to {1}@{2}", repo.root, resource.remote, resource.revision));
				canFF = false;
			}

			return canFF ? repo : undefined;
		})).then(repos => repos.filter(r => !!r) as Repository[]);
	}

	private async fastForward(resource: GitResourceAtRevision, repo: Repository): Promise<void> {
		// The ref for an abs commit is itself, otherwise we just fetched the upstream branch (FETCH_HEAD)
		const targetRef = isAbsoluteCommitID(resource.revision) ? resource.revision : 'FETCH_HEAD';
		// TODO(keegan) prompt user?
		await repo.executeCommand(['merge', '--ff-only', targetRef]);
	}

	private async clone(resource: GitResource): Promise<Repository> {
		const dir = this.getFolderPath(resource.remote);
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

	private async pick(resource: GitResource, repos: Repository[]): Promise<Repository> {
		// If we have repos that are already workspace roots, only include them
		const inWorkspace = repos.filter(repo => {
			return (workspace.workspaceFolders || []).filter(f => f.uri.fsPath === repo.root).length > 0;
		});
		if (inWorkspace.length > 0) {
			repos = inWorkspace;
		}

		if (repos.length === 1) {
			return repos[0];
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
		const placeHolder = localize('pickExistingRepo', "Choose a clone for repository {0}", resource.remote);
		const pick = await window.showQuickPick(picks, { placeHolder });
		if (!pick) {
			// TODO(keegan) be more graceful
			throw new Error('did not pick repo');
		}
		return pick.repo;
	}

	public async resolveResourceDeprecated(resource: Uri): Promise<Uri> {
		// We only attempt to use worktree if the revision is set.
		const autoWorktreeEnabled = workspace.getConfiguration('git').get<boolean>('enableAutoWorktree');
		const revision = (autoWorktreeEnabled && resource.query) || null;
		let repoUri = resource.with({ query: null } as any);

		// For 'git' scheme, avoid conflict with the TextDocumentContentProvider's git: URIs by only resolving URIs
		// with a host (authority). The TextDocumentContentProvider does not construct or handle these.
		if (!repoUri.authority) {
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
				this.commands.showOutput();
				// Give advice for github, since it is a common failure path
				if (cloneUrl.toLowerCase().indexOf('github.com') >= 0) {
					this.git.log(localize('cloneFailedGitHubAdvice', "GitHub clone failed. Adjust github.cloneProtocol user setting to use ssh or https instead.\n"));
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