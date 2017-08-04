/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';

/**
 * Interface to intract with Git in the current workspace.
 * TODO: refactor into service so it is easier to mock.
 */
export class Git {

	constructor(
		private scmService: ISCMService,
	) {
	}

	public getRevisionSHA(context: URI): Promise<string> {
		// TODO: return most recent commit that is actually in a upstream
		return this.spawnPromiseTrim(context, ['rev-parse', 'HEAD']);
	}

	public getUserName(context: URI): Promise<string> {
		return this.spawnPromiseTrim(context, ['config', 'user.name']);
	}

	public getUserEmail(context: URI): Promise<string> {
		return this.spawnPromiseTrim(context, ['config', 'user.email']);
	}

	public async getRoot(context: URI): Promise<URI> {
		const path = await this.spawnPromiseTrim(context, ['rev-parse', '--show-toplevel']);
		return URI.parse(path);
	}

	/**
	 * For the first iteration, it is security through obscurity.
	 * Anyone knows the URI of a repo (e.g. github.com/sourcegraph/sourcegraph)
	 * and the hash of the first commit may fetch code comments for that repo.
	 *
	 * Beta testers in this iteration will be explictly told about this limitation.
	 * Next iteration we will work on proper authorization controls by modeling organizations.
	 */
	public getAccessToken(context: URI): Promise<string> {
		return this.spawnPromiseTrim(context, ['rev-list', '--max-parents=0', 'HEAD']);
	}

	public getDiff(file: URI, from: string, to: string): Promise<string> {
		return this.spawnPromiseTrim(file, ['diff', '-U0', '--histogram', from, to, file.fsPath]);
	}

	/**
	 * Returns the primary upstream URL of the repository.
	 */
	public async getRemoteRepo(context: URI): Promise<string> {
		const url = await this.spawnPromiseTrim(context, ['ls-remote', '--get-url'])
			.then(url => url.replace(/\.git$/, ''));

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
	}

	private async spawnPromiseTrim(context: URI, params: Array<string>): Promise<string> {
		const scmProvider = this.scmService.getProviderForResource(context);
		if (!scmProvider) {
			return Promise.reject(new Error(`no scm provider in context ${context.toString()}`));
		}
		if (scmProvider.id !== 'git') {
			return Promise.reject(new Error(`only git is supported; got ${scmProvider.id}`));
		}
		const result = await scmProvider.executeCommand(params);
		return result.trim();
	}
}