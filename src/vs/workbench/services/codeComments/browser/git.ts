/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';

/**
 * Interface to intract with Git in the current workspace.
 */
export class Git {

	constructor(
		private scmService: ISCMService,
	) {
	}

	/**
	 * Returns the most recent revision in the current branch that is on the upstream.
	 */
	public getLastPushedRevision(context: URI): TPromise<string> {
		return this.getRemoteTrackingBranches(context).then(remotes => {
			const remoteArgs = remotes.map(remote => '^' + remote);
			// This returns oldest revision that is reachable from HEAD but not from any of remoteArgs.
			return this.spawnPromiseTrim(context, ['rev-list', '--reverse', '--max-count', '1', 'HEAD'].concat(remoteArgs));
		}).then(oldestUnpushedRevision => {
			// We want to return a rev that IS pushed so we get this revision's parent.
			return this.spawnPromiseTrim(context, ['rev-parse', oldestUnpushedRevision + '~']);
		});
	}

	/**
	 * Returns all remote tracking branches
	 * (e.g. origin/HEAD, origin/master, origin/featurebranch)
	 */
	private getRemoteTrackingBranches(context: URI): TPromise<string[]> {
		return this.spawnPromiseTrim(context, ['branch', '-r', '-v']).then(refs => {
			return refs.split('\n').map(line => {
				line = line.trim();
				const end = line.indexOf(' ');
				return line.substr(0, end);
			});
		});
	}

	public getRevisionSHA(context: URI): TPromise<string> {
		return this.spawnPromiseTrim(context, ['rev-parse', 'HEAD']);
	}

	public getUserName(context: URI): TPromise<string> {
		return this.spawnPromiseTrim(context, ['config', 'user.name']);
	}

	public getUserEmail(context: URI): TPromise<string> {
		return this.spawnPromiseTrim(context, ['config', 'user.email']);
	}

	public getRoot(context: URI): TPromise<string> {
		return this.spawnPromiseTrim(context, ['rev-parse', '--show-toplevel']);
	}

	/**
	 * For the first iteration, it is security through obscurity.
	 * Anyone knows the URI of a repo (e.g. github.com/sourcegraph/sourcegraph)
	 * and the hash of the first commit may fetch code comments for that repo.
	 *
	 * Beta testers in this iteration will be explictly told about this limitation.
	 * Next iteration we will work on proper authorization controls by modeling organizations.
	 */
	public getAccessToken(context: URI): TPromise<string> {
		return this.spawnPromiseTrim(context, ['rev-list', '--max-parents=0', 'HEAD']);
	}

	/**
	 * Returns the diff of file from a revision to the current state.
	 */
	public getDiff(file: URI, fromRev: string, options?: { reverse?: boolean }): TPromise<string> {
		// To help range transformations for comments:
		// -U1 to request the minimum useful amount of context (git default is three)
		// --histogram to spend extra time making more semantically correct diffs
		const args = ['diff', '-U1', '--histogram'];
		if (options && options.reverse) {
			args.push('-R');
		}
		args.push(fromRev, file.fsPath);
		return this.spawnPromiseTrim(file, args);
	}

	/**
	 * Returns the primary upstream URL of the repository.
	 */
	public getRemoteRepo(context: URI): TPromise<string> {
		return this.spawnPromiseTrim(context, ['ls-remote', '--get-url'])
			.then(url => url.replace(/\.git$/, ''))
			.then(url => {
				// We can just remove a prefix for these protocols.
				const prefixProtocols = [
					/^https?:\/\//,
					/^git:\/\//,
					/^ssh:\/\/[^/@]+@/,
				];
				for (let prefixProtocol of prefixProtocols) {
					if (prefixProtocol.test(url)) {
						return url.replace(prefixProtocol, '');
					}
				}
				// Parse ssh procotol (e.g. user@company.com:foo/bar)
				const sshMatch = url.match(/[^/@]+@([^:/]+):(.+)$/);
				if (sshMatch) {
					return sshMatch[1] + '/' + sshMatch[2];
				}
				throw new Error('unsupported remote url format: ' + url);
			});
	}

	private spawnPromiseTrim(context: URI, params: Array<string>): TPromise<string> {
		const scmProvider = this.scmService.getProviderForResource(context);
		if (!scmProvider) {
			return TPromise.wrapError(new Error(`no scm provider in context ${context.toString()}`));
		}
		if (scmProvider.id !== 'git') {
			return TPromise.wrapError(new Error(`only git is supported; got ${scmProvider.id}`));
		}
		return scmProvider.executeCommand(params).then(result => result.trim());
	}
}