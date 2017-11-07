/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ISCMService, ISCMProvider } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { keys } from 'vs/base/common/map';

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
	 * Returns the oldest revision (topologically) that contains the exact same content for the inclusive range [startLine, endLine].
	 */
	public async getBlame(file: string, startLine: number, endLine: number): Promise<{ commitId: string, file: string } | undefined> {
		const blame = await this.spawnPromiseTrim(['blame', '-s', '-l', '--show-name', '-L', `${startLine},${endLine}`, file]);
		const lines = blame.split('\n');
		const filesByCommit = new Map<string, string>();
		for (const line of lines) {
			const [sha, file] = line.split(' ', 2);
			if (sha === '0000000000000000000000000000000000000000') {
				// Uncomitted change
				return undefined;
			}
			// Trim leading '^' which blame prepends for boundary commits (e.g. initial commit in repo).
			const commitId = sha[0] === '^' ? sha.substr(1) : sha.substr(0, 39);
			filesByCommit.set(commitId, file);
		}
		const commitId = await this.spawnPromiseTrim(['rev-list', '--max-count', '1'].concat(keys(filesByCommit)));
		const fileAtCommit = filesByCommit.get(commitId.substr(0, 39));
		return commitId && { commitId, file: fileAtCommit };
	}

	/**
	 * Returns the files contents at a certain revision.
	 * HACK! This should be removed
	 */
	public getContentsAtRevision(relativeFile: string, revision: string): TPromise<string> {
		return this.spawnPromise(['show', `${revision}:${relativeFile}`]);
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

	private spawnPromiseTrim(params: string[]): TPromise<string> {
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
