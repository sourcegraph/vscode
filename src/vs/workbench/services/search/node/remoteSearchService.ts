/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as glob from 'vs/base/common/glob';
import * as scorer from 'vs/base/common/scorer';
import * as strings from 'vs/base/common/strings';
import * as nls from 'vs/nls';
import { flatten } from 'vs/base/common/arrays';
import URI from 'vs/base/common/uri';
import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { FileMatch, IFileMatch, ISearchComplete, ISearchProgressItem, ISearchQuery, ISearchService, QueryType } from 'vs/platform/search/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileStat } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { extractResourceInfo } from 'vs/platform/workspace/common/resource';
import { IRemoteService } from 'vs/platform/remote/node/remote';
import { workspaceResourceInfoVars, fetchFilesAndDirs, parseSourcegraphGitURI } from 'vs/workbench/services/files/node/remoteRepoFileService';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { CodeSearchModel, CodeSearchQuery, WorkspaceRevision, CodeSearchResponse } from 'vs/workbench/services/search/node/codeSearchModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { SearchService } from 'vs/workbench/services/search/node/searchService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Schemas } from 'vs/base/common/network';

export class RemoteSearchService extends SearchService implements ISearchService {
	_serviceBrand: any;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IConfigurationService configurationService: IConfigurationService,
		@IRemoteService private remoteService: IRemoteService,
		@ISCMService private scmService: ISCMService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IModelService modelService: IModelService,
		@IUntitledEditorService untitledEditorService: IUntitledEditorService,
	) {
		super(
			modelService,
			untitledEditorService,
			environmentService,
			contextService,
			configurationService,
		);
	}

	private textSearch(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		if (!this.contextService.hasWorkspace()) {
			// If we don't have a current workspace, then just search the workspaces that were in the query.
			return this.textSearchExternalRepos(query, '', '');
		}
		const workspaceRoot = this.contextService.getWorkspace().roots[0];

		return workspaceResourceInfoVars(this.contextService, this.scmService, extractResourceInfo(workspaceRoot))
			.then(({ repo, revision }) => {
				return this.textSearchExternalRepos(query, repo, revision);
			});
	}

	/**
	 * Searches multiple repos.
	 */
	private textSearchExternalRepos(query: ISearchQuery, workspaceRepo: string, workspaceRevision: string): PPromise<ISearchComplete, ISearchProgressItem> {

		// For the current workspace, use the current revision selected in the UI. For
		// other workspaces, use the server's default revision.
		const workspaces: WorkspaceRevision[] = (query.folderQueries || []).map(folderQuery => {
			const resource = folderQuery.folder;
			const isCurrentWorkspace = this.contextService.hasWorkspace() && this.contextService.getWorkspace().roots[0].toString() === resource.toString();
			return {
				workspace: resource,
				revision: isCurrentWorkspace && this.scmService.activeProvider.revision ? this.scmService.activeProvider.revision.id : undefined,
			};
		});

		const model = this.instantiationService.createInstance(CodeSearchModel, {
			...query.contentPattern,
			workspaces,
			includePattern: globToString(query.includePattern),
			excludePattern: globToString(query.excludePattern),
		} as CodeSearchQuery, query.maxResults);
		return new PPromise<ISearchComplete, ISearchProgressItem>((complete, error, progress) => {
			model.load().then(model => {
				const results: IFileMatch[] = model.response.results.map(fileMatch => {
					const { repo, rev, path } = parseSourcegraphGitURI(fileMatch.resource);
					const inWorkspace = (repo === workspaceRepo && rev === workspaceRevision);
					const resource = inWorkspace ?
						URI.parse(`repo://${repo}/${path}`) :
						URI.parse(`gitremote://${repo}/${path}?${rev}`);
					return { ...fileMatch, resource };
				});
				complete({
					results: results,
					limitHit: model.response.limitHit,
					stats: {} as any,
					warning: this.getWarning(model.response),
				});
			}, err => error({ message: err }));
		}, () => {
			model.dispose();
		});
	}

	private getWarning(r: CodeSearchResponse): string | undefined {
		if (r.cloning.length > 0) {
			return r.cloning.length === 1 ?
				nls.localize('searchCloningWarning', "{0} is still cloning, so is missing from the results. You can retry your search soon.", r.cloning[0]) :
				nls.localize('searchCloningManyWarning', "{0} (including {1}) repositories are still cloning, so are missing from the results. You can retry your search soon.", r.cloning.length, r.cloning[0]);
		}
		if (r.missing.length > 0) {
			return r.missing.length === 1 ?
				nls.localize('searchMissingWarning', "{0} could not be found, so is missing from the results. You may have a typo in your repo selection.", r.missing[0]) :
				nls.localize('searchMissingManyWarning', "{0} (including {1}) could not be found, so are missing from the results.", r.missing.length, r.missing[0]);
		}
		return undefined;
	}

	/**
	 * search returns a promise which completes with file search results matching the specified query.
	 */
	public search(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		// Fall back to the normal search service if we aren't searching anything remote.
		//
		// TODO(sqs): merge results from local + remote if there are multiple roots and at
		// least 1 of local and remote.
		if (!this.contextService.hasWorkspace() || this.contextService.getWorkspace().roots[0].scheme !== Schemas.remoteRepo) {
			return super.search(query);
		}

		this.extendQuery(query);
		if (query.type === QueryType.File) {
			return this.fileSearch(query);
		}
		return this.textSearch(query);
	}


	private fileSearch(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		let promise: TPromise<any>;
		return new PPromise<ISearchComplete, ISearchProgressItem>((onComplete, onError, onProgress) => {
			promise = this.getWorkspaceFiles(query).then(files => {
				// TODO(nick): revert this setTimeout hack that was a temporary workaround for https://github.com/sourcegraph/sourcegraph/issues/5824
				setTimeout(() => {
					onComplete({
						results: files,
						stats: {} as any,
					});
				}, 0);
			});
		}, () => promise.cancel());
	}

	clearCache(cacheKey: string): TPromise<void> {
		return TPromise.as(void 0);
	}

	/**
	 * getWorkspaceFiles returns a promise which completes with the complete set of files
	 * in a workspace which match the specified query.
	 */
	private getWorkspaceFiles(query: ISearchQuery): TPromise<IFileMatch[]> {
		function getURIs(stat: IFileStat): URI[] {
			if (!stat.isDirectory) {
				return [stat.resource];
			}
			if (stat.children) {
				return flatten(stat.children.map(getURIs));
			}
			return [];
		}

		if (query.type === QueryType.File && this.contextService.getWorkspace()) {
			return fetchFilesAndDirs(this.contextService, this.remoteService, this.scmService).then(files => {
				const workspaceRoot = this.contextService.getWorkspace().roots[0];
				let matches: FileMatch[] = [];
				for (const fileName of files) {
					// TODO(sqs:vscode): Use a fast path to eliminate
					// vendored files, which slow down search considerably.
					// Use the search.exclude config property. Doing it here
					// instead of a few lines below means we avoid the
					// relatively costly workspace.with() call.

					if (this.matchesForRemote(fileName, query.filePattern!, query.includePattern!, query.excludePattern!)) {
						matches.push(new FileMatch(workspaceRoot.with({ path: workspaceRoot.path + `/${fileName}` })));
					}

					// maxResults is 0 when quickopen is initially
					// opened because we choose to not show any
					// files there.
					if (matches.length >= (query.maxResults || 0)) {
						break;
					}
				}
				return matches;
			});
		}

		return TPromise.wrap([]);
	}

	/**
	 * matchesForRemote is used to filter candidate search results. It is mostly copied from vscode's search service implementation.
	 */
	private matchesForRemote(resource: string, filePattern: string, includePattern: glob.IExpression, excludePattern: glob.IExpression): boolean {
		// NOTE: This assumes the workspace is always at the root of
		// the repository. If this no longer holds, you must use
		// this.contextService.toWorkspaceRelativePath instead of just
		// the `resource` below.

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
}

/**
 * Converts a glob expression to a comma-separated input string (e.g., "foo/*.js,
 * bar/*.txt").
 *
 * NOTE: This is Sourcegraph-specific in 1 way: if it encounters a pattern that expects to
 * match a path with a leading slash, it (tries to) add an equivalent pattern that matches
 * the same paths but without a leading slash. This is necessary because VS Code expects
 * filenames to have leading slashes, but our Go search.concurrentFind func does not expect
 * filenames to have leading slashes.
 */
export function globToString(expr: glob.IExpression): string {
	if (!expr) { return ''; }
	const patterns = [];
	Object.keys(expr).forEach(pattern => {
		let subpatterns: string[];
		if (strings.startsWith(pattern, '{') && strings.endsWith(pattern, '}')) {
			subpatterns = pattern.slice(1, -1).split(',');
		} else {
			subpatterns = [pattern];
		}

		subpatterns.forEach(pattern => {
			// See note about Sourcegraph-specific behavior in docstring.
			if (strings.startsWith(pattern, '**/')) {
				patterns.push(strings.ltrim(pattern, '**/'));
			}
			if (strings.startsWith(pattern, '*/')) {
				patterns.push(strings.ltrim(pattern, '*/'));
			}
			if (strings.startsWith(pattern, '/')) {
				patterns.push(strings.ltrim(pattern, '/'));
			}
			patterns.push(pattern);
		});
	});
	return '{' + patterns.join(',') + '}';
}