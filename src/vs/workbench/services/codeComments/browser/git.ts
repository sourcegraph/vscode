/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ISCMService, ISCMProvider } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';

/**
 * Interface to intract with Git in the current workspace.
 */
export class Git {

	constructor(
		public readonly resource: URI,
		@ISCMService private scmService: ISCMService,
	) {
	}

	/**
	 * Returns the most recent revision in the current branch that is on any upstream.
	 */
	public getLastPushedRevision(): TPromise<string> {
		return TPromise.join<any>([
			this.isCurrentRevPushed(),
			this.getRemoteTrackingBranches(),
			this.getRevisionSHA(),
		]).then(([isCurrentRevPushed, remoteRevs, rev]: [boolean, Set<string>, string]) => {
			if (isCurrentRevPushed) {
				return rev;
			}
			const args: string[] = [];
			remoteRevs.forEach(remoteRev => args.push('^' + remoteRev));
			// This returns oldest revision that is reachable from HEAD but not from any of the revs in args.
			return this.spawnPromiseTrim(['rev-list', '--reverse', '--max-count', '1', 'HEAD'].concat(args))
				.then(oldestUnpushedRevision => {
					// We want to return a rev that IS pushed so we get this revision's parent.
					return this.spawnPromiseTrim(['rev-parse', oldestUnpushedRevision + '~']);
				});
		});
	}

	/**
	 * Returns true if this commit is reachable from at least on remote tracking branch.
	 */
	private isCurrentRevPushed(): TPromise<boolean> {
		return this.spawnPromiseTrim(['branch', '-r', '--contains', 'HEAD']).then(output => !!output);
	}

	/**
	 * Returns the current revisions of all remote tracking branches.
	 */
	private getRemoteTrackingBranches(): TPromise<Set<string>> {
		return this.spawnPromiseTrim(['show-ref']).then(refs => {
			return refs.split('\n').reduce((remoteRefs, line) => {
				const [sha, ref] = line.split(' ', 3);
				if (ref && ref.indexOf('refs/remotes/') === 0) {
					remoteRefs.add(sha);
				}
				return remoteRefs;
			}, new Set<string>());
		});
	}

	/**
	 * Returns the SHA of the current revision.
	 */
	public getRevisionSHA(): TPromise<string> {
		return this.spawnPromiseTrim(['rev-parse', 'HEAD']);
	}

	/**
	 * Returns the files contents at a certain revision.
	 * HACK! This should be removed
	 */
	public getContentsAtRevision(relativeFile: string, revision: string): TPromise<string> {
		return this.spawnPromise(['show', `${revision}:${relativeFile}`]);
	}

	/**
	 * Returns the diff of file from a revision to the current state.
	 */
	public getDiff(fromRev: string, options?: { reverse?: boolean }): TPromise<string> {
		// To help range transformations for comments:
		// --histogram to spend extra time making more semantically correct diffs
		const args = ['diff', '-U0', '--histogram'];
		if (options && options.reverse) {
			args.push('-R');
		}
		args.push(fromRev, this.resource.fsPath);
		return this.spawnPromiseTrim(args);
	}

	/**
	 * Returns the primary upstream URL of the repository.
	 */
	public getRemoteRepo(): TPromise<string> {
		return this.spawnPromiseTrim(['ls-remote', '--get-url'])
			.then(url => url.replace(/\.git$/, '').replace(/\/$/, ''))
			.then(url => {
				url = decodeURIComponent(url);
				// Parse ssh protocol (e.g. user@company.com:foo/bar)
				const sshMatch = url.match(/^(?:[^/@:]+@)?([^:/]+):([^/].*)$/);
				if (sshMatch) {
					return sshMatch[1] + '/' + sshMatch[2];
				}
				// We can just remove a prefix for these protocols.
				const prefix = /^((https?)|(git)|(ssh)):\/\/([^/@]+@)?/;
				if (!prefix.test(url)) {
					throw new Error('unsupported remote url format: ' + url);
				}
				return url.replace(prefix, '');
			});
	}

	public getBranch(): TPromise<string> {
		return this.getSCMProvider().then(provider => provider.revision && provider.revision.specifier);
	}

	private spawnPromiseTrim(params: Array<string>): TPromise<string> {
		return this.spawnPromise(params).then(result => result.trim());
	}

	private getSCMProvider(): TPromise<ISCMProvider> {
		const repository = this.scmService.getRepositoryForResource(this.resource);
		if (!repository) {
			return TPromise.wrapError(new Error(`no repository in context ${this.resource.toString()}`));
		}
		if (!repository.provider) {
			return TPromise.wrapError(new Error(`no scm provider in context ${this.resource.toString()}`));
		}
		if (repository.provider.contextValue !== 'git') {
			return TPromise.wrapError(new Error(`only git is supported; got ${repository.provider.contextValue} for ${this.resource.toString()}`));
		}
		return TPromise.as(repository.provider);
	}

	private spawnPromise(params: Array<string>): TPromise<string> {
		return this.getSCMProvider().then(provider => provider.executeCommand(params));
	}
}