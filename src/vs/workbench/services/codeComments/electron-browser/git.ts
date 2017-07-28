/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { startsWith } from 'vs/base/common/strings';
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

	public getDiff(file: URI, from: string, to: string): Promise<string> {
		return this.spawnPromiseTrim(file, ['diff', '-U0', '--histogram', from, to, file.fsPath]);
	}

	public async getRemoteRepo(context: URI): Promise<string> {
		const url = await this.spawnPromiseTrim(context, ['ls-remote', '--get-url']);
		const gitPrefix = 'git@';
		if (startsWith(url, gitPrefix)) {
			return this.trimGitSuffix(url.substr(gitPrefix.length).replace(':', '/'));
		}
		const schemeSep = '://';
		if (url.indexOf(schemeSep) > 0) {
			return this.trimGitSuffix(url.split(schemeSep, 2)[1]);
		}
		throw new Error('unsupported remote url format: ' + url);
	}

	private trimGitSuffix(s: string): string {
		return s.replace(/\.git$/, '');
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