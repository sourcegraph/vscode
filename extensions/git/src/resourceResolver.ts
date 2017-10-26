/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { workspace, window, ProgressLocation, Uri, Disposable, OutputChannel, QuickPickOptions, Progress } from 'vscode';
import { Git, IGitErrorData, GitErrorCodes, Repository } from './git';
import { mkdirp, replaceVariables, uniqBy } from './util';
import { Model } from './model';
import * as nls from 'vscode-nls';
import { canonicalRemote } from './uri';

const localize = nls.loadMessageBundle();

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

		const gitResource = this.parseResource(resource);
		this.log(localize('gitResourceInfo', "Resolving resource {0}@{1} from {2}", gitResource.remote, gitResource.revision || '', gitResource.cloneURL));
		try {
			const root = await window.withProgress({
				location: ProgressLocation.SourceControl,
				title: localize('progressTitle', "Resolving {0}@{1}", gitResource.remote, gitResource.revision || 'HEAD'),
			}, progress => {
				const resolver = new Resolver(this.git, this.model, this.outputChannel, progress);
				return resolver.resolveRepository(this.parseResource(resource));
			});
			if (!root) {
				this.log(localize('resolveFailed', "Failed to resolve {0}", resource.toString()));
				return resource;
			}
			this.log(localize('resolveSuccess', "Successfully resolved {0} to {1}", resource.toString(), root));

			// Register the repo with SCM
			await this.model.tryOpenRepository(root, true);
			const repo = this.model.getRepository(root, true);
			if (!repo) {
				throw new Error('Unable to open repository at ' + root);
			}

			return Uri.file(root);
		} catch (e) {
			this.log(localize('resolveError', "Error to resolve {0}: {1}", resource.toString(), e));
			this.outputChannel.show();

			if (!e.gitErrorCode) {
				throw e;
			}
			// We translate expected errors into a nice error to show the user.
			// The full error message will still be visible in the deep link
			// output channel.
			let msg = localize('unknownFailure', "Unexpected git error {0} occurred while resolving {1}@{2}", e.gitErrorCode, gitResource.remote, gitResource.revision || 'HEAD');
			if (e.gitErrorCode === GitErrorCodes.NoRemoteReference) {
				msg = localize('noRemote', "{0} does not exist on remote {1}", gitResource.revision, gitResource.remote);
			}
			this.log(msg);
			throw new Error(msg);
		} finally {
			this.outputChannel.appendLine(''); // Just log newline
		}
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

	private log(s: string) {
		const d = new Date();
		this.outputChannel.appendLine(`${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}.${d.getMilliseconds()} ${s}`);
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

/**
 * A GitResource represents the fields we extract from a git URI that needs resolving.
 */
interface GitResource {
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

class Resolver {

	constructor(
		private git: Git,
		private model: Model,
		private outputChannel: OutputChannel,
		private progress: Progress<{ message?: string; }>,
	) { }

	/** Resolves a GitResource to a fsPath, potentially cloning it. */
	public async resolveRepository(resource: GitResource): Promise<string | undefined> {
		const repos = await this.findRepositoriesWithRemote(resource.remote);
		if (repos.length === 0) {
			// We have no repositories pointing to this remote, so we clone it.
			return await this.clone(resource);
		}

		// We have repositories. If it doesn't need to be at a specific revision
		// we let the user pick one.
		if (!hasRevision(resource)) {
			const repo = await this.pick(resource, repos, { autoSelectWorkspaceRoots: true });
			return repo.root;
		}

		// Find repositories which are either at revision or can be fast
		// forwarded to revision.
		const reposAtRevision = await this.filterReposAtRevision(resource, repos);
		if (reposAtRevision.length > 0) {
			const repo = await this.pick(resource, repos, { autoSelectWorkspaceRoots: true });
			// TODO(keegan) What if the working copy is dirty?
			await this.fastForward(repo, resource);
			return repo.root;
		}

		const repo = await this.pick(resource, repos, {
			placeHolder: localize('checkoutExistingRepo', "Choose a repository to stash and checkout {0}@{1}", resource.remote, resource.revision),
		});
		await this.stashAndCheckout(repo, resource);
		return repo.root;
	}

	private async findRepositoriesWithRemote(remote: string): Promise<Repository[]> {
		// First include repositories that are already open that have remote
		const open = this.model.repositories
			.filter(repo => repo.remotes.some(r => canonicalRemote(r.url) === remote))
			.map(repo => repo.root);

		// Next check if we have already cloned the repo to our well-known location
		const wellKnownPath = this.getFolderPath(remote);

		// Now include repos we have discovered in the users homedir
		const other = await this.model.getPossibleRemotesOnDisk(remote);

		// Open all
		const repoPaths = uniqBy([...open, wellKnownPath, ...other], s => s);
		const reposRaw = await Promise.all(repoPaths.map(async path => {
			const modelRepo = this.model.getRepository(Uri.file(path), true);
			if (modelRepo) {
				return modelRepo.repository;
			}
			try {
				const repositoryRoot = await this.git.getRepositoryRoot(path);
				if (repositoryRoot !== path) {
					return undefined;
				}
				return this.git.open(repositoryRoot);
			} catch (err) {
				if (err.gitErrorCode === GitErrorCodes.NotAGitRepository) {
					return undefined;
				}
				this.log(localize('repoOpenFail', "Could not open {0} as a git repo: {1}", path, err));
				return undefined;
			}
		}));
		const repos = reposRaw.filter(repo => !!repo) as Repository[];
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
			const targetRef = await this.maybeFetch(repo, resource);
			if (!targetRef) {
				this.log(localize('missingHash', "{0} does not have {1}", repo.root, resource.revision));
				return undefined;
			}

			const canFF = await this.canFastForward(repo, 'HEAD', targetRef);
			return canFF ? repo : undefined;
		}));
		const reposFiltered = reposAtRevision.filter(r => !!r) as Repository[];
		this.log(localize('findReposAtRevision', "Found {0} repositories at {1} for {2}: {3}", reposFiltered.length, resource.revision, resource.remote, reposFiltered.map(r => r.root).join(' ')));
		return reposFiltered;
	}

	private async canFastForward(repo: Repository, from: string, to: string): Promise<boolean> {
		try {
			// Check if the first <commit> is an ancestor of the second <commit>,
			// and exit with status 0 if true, or with status 1 if not
			// https://git-scm.com/docs/git-merge-base#git-merge-base---is-ancestor
			await repo.getMergeBase(['--is-ancestor', from, to]);
			return true;
		} catch (e) {
			// Errors are signaled by a non-zero status that is not 1
			if (e.exitCode !== 1) {
				throw e;
			}
			this.log(localize('cantFF', "{0}@{1} can't be fast-forwarded to {2}", repo.root, from, to));
			return false;
		}
	}

	/**
	 * Will fast forward the working copy to resource.revision. For branches it
	 * relies on FETCH_HEAD being set, as such it will run fetch if
	 * filterReposAtRevision has not run fetch yet.
	 */
	private async fastForward(repo: Repository, resource: GitResourceAtRevision): Promise<void> {
		this.log(localize('fastforward', "Fast-forwarding {0}", repo.root));

		// OPTIMIZATION: We only need to run fetch if head does not match
		// upstream. If head did match upstream it means we have already run
		// fetch in filterReposAtRevision. We have to run fetch before we can
		// run FF.
		let targetRef: string;
		if (!await this.headMatchesUpstream(repo, resource.revision)) {
			const targetRefRaw = await this.maybeFetch(repo, resource);
			if (!targetRefRaw) {
				throw new Error(localize('missingHash', "{0} does not have {1}", repo.root, resource.revision));
			}
			targetRef = targetRefRaw;
		} else {
			// maybeFetch returns FETCH_HEAD if we are fetching a branch,
			// otherwise the commit hash. It was run in filterReposAtRevision.
			targetRef = isAbsoluteCommitID(resource.revision) ? resource.revision : 'FETCH_HEAD';
		}

		await repo.merge(targetRef, { ffOnly: true });
	}

	/**
	 * Fetches resource.commit from resource.cloneURL if resource.commit is
	 * missing or if it is a branch. Returns the ref for the commit (the commit
	 * hash or FETCH_HEAD) on success. If the commit is missing undefined is
	 * returned.
	 */
	private async maybeFetch(repo: Repository, resource: GitResourceAtRevision): Promise<string | undefined> {
		// Branches we always fetch to ensure we are up to date.
		if (!isAbsoluteCommitID(resource.revision)) {
			this.log(localize('fetchRef', "Fetching {0} from {1}", resource.revision, resource.cloneURL));
			await repo.fetch({ prune: true, repository: resource.cloneURL, refspec: resource.revision });
			return 'FETCH_HEAD';
		}

		// Absolute commits we only fetch if not found
		if (!await this.hasCommit(repo, resource.revision)) {
			this.log(localize('fetchRef', "Fetching {0} from {1}", resource.revision, resource.cloneURL));
			await repo.fetch({ prune: true, repository: resource.cloneURL });
			if (!await this.hasCommit(repo, resource.revision)) {
				return undefined;
			}
		}
		return resource.revision;
	}

	private async clone(resource: GitResource): Promise<string> {
		const dir = this.getFolderPath(resource.remote);
		this.log(localize('cloningResource', "Cloning {0}@{1} from {2} to {3}", resource.remote, resource.revision || 'HEAD', resource.cloneURL, dir));
		await mkdirp(path.dirname(dir));
		const uri = await this.cloneAndCheckout(resource.cloneURL, dir, resource.remote, resource.revision || null);
		return uri.fsPath;
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
		if (!options.placeHolder) {
			options.placeHolder = localize('pickExistingRepo', "Choose a clone for repository {0}", resource.remote);
		}

		if (options.autoSelectWorkspaceRoots) {
			// If we have repos that are already workspace roots, only include them
			const inWorkspace = repos.filter(repo => (workspace.workspaceFolders || []).some(f => f.uri.fsPath === repo.root));
			if (inWorkspace.length > 0) {
				repos = inWorkspace;
			}

			if (repos.length === 1) {
				this.log(localize('autoSelect', "Automatically picked {0} for prompt {1}", repos[0].root, options.placeHolder));
				return repos[0];
			}
		}

		const picks = repos.map(repo => {
			return {
				label: path.basename(repo.root),
				description: repo.root,
				repo,
			};
		});

		const pick = await window.showQuickPick(picks, options);
		if (!pick) {
			// TODO(keegan) be more graceful
			throw new Error('did not pick repo');
		}
		this.log(localize('pick', "User picked {0} for prompt {1}", pick.repo.root, options.placeHolder));
		return pick.repo;
	}

	private async stashAndCheckout(repo: Repository, resource: GitResourceAtRevision): Promise<void> {
		// If we get to this point it means we are not on resource.revision.
		// That implies we haven't run fetch since the branch would of been
		// skipped in filterReposAtRevision. So we need to run fetch to ensure
		// resource.revision even exists in its remotes.
		// TODO(keegan) Run fetch on every repo before presenting options to the
		// user to stashAndCheckout.
		const targetRef = await this.maybeFetch(repo, resource);
		if (!targetRef) {
			throw new Error(localize('missingHash', "{0} does not have {1}", repo.root, resource.revision));
		}

		// The branch might not exist locally, so create it.
		await this.updateLocalBranch(repo, resource.revision, targetRef);

		// We need to decide how to update the branch to targetRef
		let checkoutAlgorithm: 'ff' | 'detached' | 'reset';
		if (isAbsoluteCommitID(resource.revision)) {
			checkoutAlgorithm = 'detached';
		} else {
			const canFF = await this.canFastForward(repo, resource.revision, targetRef);
			if (canFF) {
				checkoutAlgorithm = 'ff';
			} else {
				checkoutAlgorithm = await this.promptCheckoutAlgorithm(resource.revision);
			}
		}
		this.log(localize('checkoutAlgo', "Will use {0} checkout algorithm", checkoutAlgorithm));

		// Stash
		const head = await repo.getHEAD();
		try {
			const msg = localize('stashAndCheckout', "WIP on {0} to checkout {1}", head.name || head.commit, resource.revision);
			await repo.createStash(msg);
			this.log(`Stashed ${repo.root} ${msg}`);
		} catch (e) {
			if (e.gitErrorCode !== GitErrorCodes.NoLocalChanges) {
				throw e;
			}
			this.log(localize('checkout', "Checking out {0} to {1}", repo.root, resource.revision));
		}

		if (checkoutAlgorithm === 'ff') {
			await repo.checkout(resource.revision, []);
			await this.fastForward(repo, resource);
		} else if (checkoutAlgorithm === 'detached') {
			await repo.checkout(targetRef, []);
		} else if (checkoutAlgorithm === 'reset') {
			await repo.checkout(resource.revision, []);
			await repo.reset(targetRef, /* hard = */ true);
		} else {
			throw new Error('Unexpected checkout algorithm ' + checkoutAlgorithm);
		}
	}

	/**
	 * updateLocalBranch will create branch revision if it does not exist to
	 * point to FETCH_HEAD.
	 */
	private async updateLocalBranch(repo: Repository, revision: string, targetRef: string): Promise<void> {
		// Absolute commits we just use a detached head, no branch to checkout
		if (isAbsoluteCommitID(revision)) {
			return;
		}

		try {
			// If this succeeds then we have the branch already
			await repo.getCommit(revision);
		} catch (e) {
			// TODO(keegan) only ignore missing commit error
			// The branch does not exist, so create it to point to targetRef
			const commit = await repo.getCommit(targetRef);
			await repo.run(['branch', revision, commit.hash]);
		}
	}

	private async promptCheckoutAlgorithm(revision: string): Promise<'detached' | 'reset'> {
		const detachedItem = localize('detachedItem', "Checkout detached head");
		const resetItem = localize('resetItem', "Force update");
		const choice = await window.showWarningMessage(
			localize('cantFFWarning', "Can't checkout {0} and fast-forward to remote {0}.", revision),
			detachedItem,
			resetItem,
		);
		if (choice === detachedItem) {
			return 'detached';
		}
		if (choice === resetItem) {
			return 'reset';
		}
		throw new Error('User did not pick option');
	}

	private log(s: string) {
		const d = new Date();
		this.outputChannel.appendLine(`${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}.${d.getMilliseconds()} ${s}`);
		this.progress.report({ message: s });
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
}

function hasRevision(resource: GitResource): resource is GitResourceAtRevision {
	return resource.revision !== undefined;
}

function isAbsoluteCommitID(revision: string): boolean {
	// Surprisingly this is the same check used in the Git codebase.
	return revision.length === 40;
}
