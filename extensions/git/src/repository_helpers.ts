/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import { Worktree } from './git';
import { Repository } from './repository';
import { getTempDirectory, getTempSubDirectory, getGoPackagePrefix, setUpGoConfiguration } from './tempFolder';
import { pathExists } from './nodeutil';
import { canonicalRemote } from './uri';

/**
 * createTempWorktree adds a worktree to a temporary directory.
 */
export async function createTempWorktree(repository: Repository, rev: string): Promise<Worktree> {
	const tempFolder = await getTempDirectory(repository.root + '@' + rev);
	const tempSubFolder = getTempSubDirectory(rev);

	let dst: string;
	const goPackagePrefix = await getGoPackagePrefix(repository.root);
	if (goPackagePrefix) {
		dst = path.join(tempFolder, tempSubFolder, 'src', goPackagePrefix.replace(/\//g, path.sep));
	} else {
		dst = path.join(tempFolder, tempSubFolder, path.basename(repository.root));
	}

	if (!await pathExists(dst)) {
		await repository.worktreePrune();
		await repository.addWorktree(dst, rev);
		if (goPackagePrefix) {
			await setUpGoConfiguration(repository, tempFolder, dst);
		}
	}

	const commit = await repository.getCommit(rev);

	return {
		path: dst,
		head: commit.hash,
		detached: rev.length === 40,
		branch: rev.length !== 40 ? rev : undefined,
	};
}

/**
 * resolveRevision resolves a revision to an exact commit hash with respect to a particular remote. It returns an object
 * with the full name of the remote branch if it exists and the resolved commit hash, or null if the resolution
 * could not occur.
 */
export async function resolveRevision(repo: Repository, canonicalRemoteUri: string, rev: string): Promise<{ remoteBranch: string | null, commit: string } | null> {
	// Resolve revision to hash
	if (rev.length === 40) {
		return { remoteBranch: null, commit: rev };
	} else {
		for (const remote of repo.remotes) {
			if (canonicalRemote(remote.url) === canonicalRemoteUri) {
				try {
					const remoteBranch = `${remote.name}/${rev}`;
					const commit = await repo.getCommit(remoteBranch);
					return { remoteBranch: remoteBranch, commit: commit.hash };
				} catch {/* commit not found */ }
			}
		}
	}
	return null;
}

/**
 * getBestRepositoryWorktree returns the best-matching worktree in a list of repositories corresponding to a particular remote and revision.
 * The specified revision is resolved against a remote that matches the canonicalRemoteUri parameter.
 *
 * "Best match" is defined by the following precedence priority:
 * - The main working tree of a repository whose HEAD commit exactly matches the resolved revision.
 * - If the revision parameter is not an exact commit, a branch worktree whose upstream matches the revision AND whose head commit matches the resolved revision.
 * - A worktree checked out to the resolved revision.
 * - A new temporary worktree checked out to the resolved revision.
 *
 * @param repos is the list of repositories to search for a worktree
 * @param canonicalRemoteUri is a URI that identifies the remote(s)
 * @param revision is the revision with repsect to the remote. For instance, if the canonicalRemoteUri is "github.com/my/repo" and
 * 		the revision is "mybranch" and there is a remote named "upstream" with URL "https://github.com/my/repo.git", we will
 * 		return the best match worktree for "upstream/mybranch".
 */
export async function getBestRepositoryWorktree(repos: Repository[], canonicalRemoteUri: string, revision: string): Promise<[Repository, string] | null> {
	// Attempt to find a repository with the desired revision already checked out to the main worktree
	const resolvedRepoRevs: { repo: Repository, remoteBranch: string | null, commit: string }[] = [];
	for (const repo of repos) {
		const headCommit = await repo.getCommit('HEAD');
		if (headCommit.hash === revision) {
			return [repo, repo.root];
		}
		await repo.fetch({ all: true }); // TODO(beyang): potentially parallelize or make optional
		const resolved = await resolveRevision(repo, canonicalRemoteUri, revision);
		if (!resolved) {
			continue;
		}
		const { remoteBranch, commit } = resolved;
		if (commit === headCommit.hash) {
			return [repo, repo.root];
		}
		resolvedRepoRevs.push({ repo, remoteBranch, commit });
	}
	const resolvedRepoRevsWorktrees: { repo: Repository, remoteBranch: string | null, commit: string, worktreesP: Promise<Worktree[]> }[] = [];
	for (const { repo, remoteBranch, commit } of resolvedRepoRevs) {
		resolvedRepoRevsWorktrees.push({
			repo, remoteBranch, commit,
			worktreesP: repo.worktreePrune().then(() => repo.worktreeList()),
		});
	}

	if (revision.length !== 40) {
		// Attempt to find a repository with a branch worktree whose upstream matches the revision
		for (const { repo, remoteBranch, commit, worktreesP } of resolvedRepoRevsWorktrees) {
			for (const worktree of await worktreesP) {
				if (worktree.branch) {
					const branchName = worktree.branch.startsWith('refs/heads/') ? worktree.branch.slice('refs/heads/'.length) : worktree.branch;
					const branch = await repo.getBranch(branchName);
					if (branch.upstream && branch.upstream === remoteBranch && branch.commit === commit) {
						return [repo, worktree.path];
					}
				}
			}
		}
	}
	// Attempt to find a repository with a worktree checked out to the resolved revision
	for (const { repo, commit, worktreesP } of resolvedRepoRevsWorktrees) {
		const worktree = await getRepositoryWorktree(repo, commit, worktreesP);
		if (worktree) {
			return [repo, worktree.path];
		}
	}
	// Attempt to create a worktree checked out to the resolved revision
	for (const { repo, commit, worktreesP } of resolvedRepoRevsWorktrees) {
		const worktree = await getRepositoryWorktree(repo, commit, worktreesP, true);
		if (worktree) {
			return [repo, worktree.path];
		}
	}
	// We arrive here only if the revision could not be found, including in any of the remotes
	return null;
}

/**
 * getRepositoryWorktree returns the worktree corresponding to a repository and revision.
 *
 * @param repository is the repository to which the returned worktree belongs.
 * @param rev is the head revision of the worktree.
 * 		This should match whatever is shown in the `git worktree list` command; no additional resolution is attempted.
 * @param worktrees the worktrees to search over. If not defined, we invoke repository.worktreeList().
 * @param createIfNotExist if true, creates the worktree if it doesn't exist already.
 */
export async function getRepositoryWorktree(repository: Repository, rev: string, worktreesPromise?: Promise<Worktree[]>, createIfNotExist?: boolean): Promise<Worktree | null> {
	let worktrees: Worktree[];
	if (!worktreesPromise) {
		await repository.worktreePrune();
		worktrees = await repository.worktreeList();
	} else {
		worktrees = await worktreesPromise;
	}
	for (const worktree of worktrees) {
		if ((worktree.detached && worktree.head === rev) || worktree.branch === `refs/heads/${rev}`) {
			return worktree;
		}
	}
	if (createIfNotExist) {
		return await createTempWorktree(repository, rev);
	}
	return null;
}