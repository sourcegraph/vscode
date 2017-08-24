/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

/**
 * Interface to intract with Git in the current workspace.
 */
export class Git {

	constructor(
		@ISCMService private scmService: ISCMService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
	) {
	}

	/**
	 * Returns the most recent revision in the current branch that is on any upstream.
	 */
	public getLastPushedRevision(context: URI): TPromise<string> {
		return TPromise.join<any>([
			this.isCurrentRevPushed(context),
			this.getRemoteTrackingBranches(context),
			this.getRevisionSHA(context),
		]).then(([isCurrentRevPushed, remoteRevs, rev]: [boolean, Set<string>, string]) => {
			if (isCurrentRevPushed) {
				return rev;
			}
			const args: string[] = [];
			remoteRevs.forEach(remoteRev => args.push('^' + remoteRev));
			// This returns oldest revision that is reachable from HEAD but not from any of the revs in args.
			return this.spawnPromiseTrim(context, ['rev-list', '--reverse', '--max-count', '1', 'HEAD'].concat(args))
				.then(oldestUnpushedRevision => {
					// We want to return a rev that IS pushed so we get this revision's parent.
					return this.spawnPromiseTrim(context, ['rev-parse', oldestUnpushedRevision + '~']);
				});
		});
	}

	/**
	 * Returns true if this commit is reachable from at least on remote tracking branch.
	 */
	private isCurrentRevPushed(context: URI): TPromise<boolean> {
		return this.spawnPromiseTrim(context, ['branch', '-r', '--contains', 'HEAD']).then(output => !!output);
	}

	/**
	 * Returns the current revisions of all remote tracking branches.
	 */
	private getRemoteTrackingBranches(context: URI): TPromise<Set<string>> {
		return this.spawnPromiseTrim(context, ['show-ref']).then(refs => {
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
	public getRevisionSHA(context: URI): TPromise<string> {
		return this.spawnPromiseTrim(context, ['rev-parse', 'HEAD']);
	}

	/**
	 * Returns the user's configured display name.
	 */
	public getUserName(context: URI): TPromise<string> {
		const config = this.configurationService.getConfiguration<IAuthConfiguration>();
		if (config && config.auth && config.auth.displayName) {
			return TPromise.wrap(config.auth.displayName);
		}
		return this.spawnPromiseTrim(context, ['config', 'user.name']).then(displayName => {
			if (!displayName) {
				throw new Error(localize('configureAuthDisplayName', 'Please configure auth.displayName and try again.'));
			}
			this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'auth.displayName', value: displayName });
			return displayName;
		});
	}

	/**
	 * Returns the user's configured email address.
	 */
	public getUserEmail(context: URI): TPromise<string> {
		const config = this.configurationService.getConfiguration<IAuthConfiguration>();
		if (config && config.auth && config.auth.email) {
			return TPromise.wrap(config.auth.email);
		}
		return this.spawnPromiseTrim(context, ['config', 'user.email']).then(email => {
			if (!email) {
				throw new Error(localize('configureAuthEmail', 'Please configure auth.email and try again.'));
			}
			this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: 'auth.email', value: email });
			return email;
		});
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
			.then(url => url.replace(/\.git$/, '').replace(/\/$/, ''))
			.then(url => {
				// Parse ssh procotol (e.g. user@company.com:foo/bar)
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

	private spawnPromiseTrim(context: URI, params: Array<string>): TPromise<string> {
		const scmProvider = this.scmService.getProviderForResource(context);
		if (!scmProvider) {
			return TPromise.wrapError(new Error(`no scm provider in context ${context.toString()}`));
		}
		if (scmProvider.contextValue !== 'git') {
			return TPromise.wrapError(new Error(`only git is supported; got ${scmProvider.contextValue}`));
		}
		return scmProvider.executeCommand(params).then(result => result.trim());
	}
}

interface IAuthConfiguration {
	auth?: {
		displayName?: string;
		email?: string;
	};
}

// Until we have real auth, just let the user configure their
// display name and email (like Git).
Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration({
		id: 'auth',
		title: localize('auth', "Auth"),
		type: 'object',
		properties: {
			'auth.displayName': {
				type: 'string',
				description: localize('displayName', "Your name"),
			},
			'auth.email': {
				type: 'string',
				pattern: '^[^@]+@[^@]+\.[^@]+',
				description: localize('email', "Your email address"),
			},
		}
	});