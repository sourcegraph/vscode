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
import { mkdirp, replaceVariables } from './util';
import { Model } from './model';
import { Repository } from './repository';
import * as nls from 'vscode-nls';
import { canonicalRemote } from './uri';
import { getBestRepositoryWorktree } from './repository_helpers';

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
		private commands: CommandCenter,
	) {
		for (const scheme of GitResourceResolver.SCHEMES) {
			this.disposables.push(workspace.registerResourceResolutionProvider(scheme, this));
		}
	}

	public async resolveResource(resource: Uri): Promise<Uri> {
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

		const repoForRemote = await this.model.tryOpenRepositoryWithRemote(repoUri);
		if (repoForRemote) {
			if (!revision) {
				return Uri.file(repoForRemote.root);
			}
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

	private getFolderPath(cloneUrl: Uri): string {
		const host = cloneUrl.authority && cloneUrl.authority.includes('@') ? cloneUrl.authority.slice(cloneUrl.authority.indexOf('@') + 1) : cloneUrl.authority; // remove userinfo from URI
		const folderRelativePath = path.join(host, cloneUrl.path.replace(/\.git$/, ''));
		const homePath = os.homedir();
		const separator = path.sep;

		const pathTemplate = workspace.getConfiguration('folders').get<string>('path')!;
		return replaceVariables(pathTemplate, { folderRelativePath, homePath, separator });
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}