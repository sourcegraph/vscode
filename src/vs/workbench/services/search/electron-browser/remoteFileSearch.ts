/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import scorer = require('vs/base/common/scorer');
import strings = require('vs/base/common/strings');
import glob = require('vs/base/common/glob');
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IProgress, IUncachedSearchStats } from 'vs/platform/search/common/search';
import { IFileService } from 'vs/platform/files/common/files';
import { RemoteFileService } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { IRawFileMatch, ISerializedSearchComplete, IRawSearch, ISearchEngine } from 'vs/workbench/services/search/node/search';

/**
 * Creates an anonymous class that implements a file search engine backed by the (remote) file service.
 *
 * This factory function is needed because we need to inject the file service. The remote
 * search service expects the constructor function, not an instance, and it does not
 * instantiate the class with the instantiation service. So, we need to perform the
 * injection here.
 */
export function createRemoteFileSearchEngineClass(accessor: ServicesAccessor): { new(config: IRawSearch): ISearchEngine<IRawFileMatch> } {
	const fileService = accessor.get(IFileService) as RemoteFileService;
	if (!(fileService instanceof RemoteFileService)) {
		throw new Error('file service must be RemoteFileService');
	}

	return class extends Engine {
		constructor(config: IRawSearch) {
			super(
				config,
				fileService,
			);
		}
	};
}

abstract class Engine implements ISearchEngine<IRawFileMatch> {
	private static TOKEN_SEQ = 0;

	private currentSearchToken: number | undefined;

	constructor(
		private config: IRawSearch,
		private fileService: RemoteFileService,
	) { }

	public search(onResult: (result: IRawFileMatch) => void, onProgress: (progress: IProgress) => void, done: (error: Error, complete: ISerializedSearchComplete) => void): void {

		const token = Engine.TOKEN_SEQ++;
		this.currentSearchToken = token;

		// TODO(sqs): support extraFiles?

		// TODO(sqs): cache until onDidChange for folder root URI

		const progress: IProgress = { total: this.config.folderQueries.length, worked: 0 };
		const stats: IUncachedSearchStats = {
			fromCache: false,
			traversal: '',
			errors: [],
			fileWalkStartTime: Date.now(),
			fileWalkResultTime: undefined!,
			directoriesWalked: 0,
			filesWalked: 0,
			resultCount: 0,
			cmdForkStartTime: undefined!,
			cmdForkResultTime: undefined!,
			cmdResultCount: 0,
		};
		const complete: ISerializedSearchComplete & { stats: IUncachedSearchStats } = {
			limitHit: false,
			stats,
		};

		const remoteFolders = this.config.folderQueries
			.map(q => URI.parse(q.folder))
			.filter(uri => uri.scheme === Schemas.repo);

		TPromise.join(
			remoteFolders.map(folderResource => {
				return this.fileService.resolveFile(folderResource, { resolveAllDescendants: true }).then(
					stat => {
						if (token !== this.currentSearchToken) {
							return; // canceled
						}
						if (complete.limitHit) {
							return;
						}

						stats.directoriesWalked++;

						progress.worked++;
						onProgress(progress);

						if (stat.children) {
							for (let i = 0; i < stat.children.length; i++) {
								const child = stat.children[i];

								stats.filesWalked++;
								if (this.config.maxResults && stats.filesWalked >= this.config.maxResults) {
									complete.limitHit = true;
									return;
								}

								const childResource = child.resource.authority + child.resource.path;
								if (this.matchesForRemote(childResource, this.config.filePattern, this.config.includePattern, this.config.excludePattern)) {
									stats.resultCount++;
									onResult({
										base: folderResource.toString(),
										relativePath: child.resource.path.slice(folderResource.path.length + 1),
										basename: child.name,
									});
								}
							}
						}
					},
					err => {
						stats.errors.push(err.toString());
					},
				);
			}),
		).then(() => {
			complete.stats.fileWalkResultTime = Date.now();

			const err = stats.errors.length ? new Error(stats.errors.join('; ')) : undefined;

			done(err, complete);
		});
	}

	/**
	 * matchesForRemote is used to filter candidate search results. It is mostly copied
	 * from vscode's search service implementation.
	 */
	private matchesForRemote(resource: string, filePattern: string, includePattern: glob.IExpression, excludePattern: glob.IExpression): boolean {

		// file pattern
		if (filePattern) {
			if (!scorer.matches(resource, strings.stripWildcards(filePattern).toLowerCase())) {
				return false;
			}
		}

		// includes
		if (includePattern) {
			if (!glob.match(includePattern, resource)) {
				return false;
			}
		}

		// excludes
		if (excludePattern) {
			if (glob.match(excludePattern, resource)) {
				return false;
			}
		}

		return true;
	}

	public cancel(): void {
		this.currentSearchToken = undefined;
	}
}