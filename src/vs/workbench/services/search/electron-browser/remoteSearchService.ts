/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as arrays from 'vs/base/common/arrays';
import * as glob from 'vs/base/common/glob';
import * as strings from 'vs/base/common/strings';
import * as nls from 'vs/nls';
import URI from 'vs/base/common/uri';
import { PPromise } from 'vs/base/common/winjs.base';
import { IFileMatch, ISearchComplete, ISearchProgressItem, ISearchQuery, ISearchService, QueryType, ISearchStats } from 'vs/platform/search/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { extractResourceInfo } from 'vs/platform/workspace/common/resource';
import { IRemoteService } from 'vs/platform/remote/node/remote';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { CodeSearchModel, CodeSearchQuery, WorkspaceRevision, CodeSearchResponse } from 'vs/workbench/services/search/node/codeSearchModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { SearchService, DiskSearch } from 'vs/workbench/services/search/node/searchService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Schemas } from 'vs/base/common/network';
import { createRemoteFileSearchEngineClass } from 'vs/workbench/services/search/electron-browser/remoteFileSearch';
import { IRawSearch, IFolderSearch } from 'vs/workbench/services/search/node/search';
import { SearchService as RawSearchService } from 'vs/workbench/services/search/node/rawSearchService';

export class RemoteSearchService extends SearchService implements ISearchService {
	_serviceBrand: any;

	private static BATCH_SIZE = 512; // same as RawSearchService

	private raw: RawSearchService;

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
		@IFileService private fileService: IFileService,
	) {
		super(
			modelService,
			untitledEditorService,
			environmentService,
			contextService,
			configurationService,
		);

		this.raw = new RawSearchService();
	}

	/**
	 * Searches multiple repos.
	 */
	private textSearch(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		if (arrays.isFalsyOrEmpty(query.folderQueries)) {
			// Avoid network request if we have no folderQueries
			return PPromise.as({
				results: [],
				limitHit: false,
				stats: {
					fromCache: false,
					resultCount: 0,
				},
			});
		}

		// If the query is searching a folder inside an SCM repository, search in its
		// current revision.
		const workspaces: WorkspaceRevision[] = (query.folderQueries || []).map(folderQuery => {
			const provider = this.scmService.getProviderForResource(folderQuery.folder);
			return {
				workspace: folderQuery.folder,
				revision: provider && provider.revision ? provider.revision.id : undefined,
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
					// The fileMatch.resource URI is in the old
					// git://github.com/foo/bar?rev#dir/file syntax. Convert it to the new
					// (usual) format.
					const oldFormatResource = URI.parse(fileMatch.resource);
					const resource = URI.from({
						scheme: Schemas.repoVersion,
						authority: oldFormatResource.authority,
						path: oldFormatResource.path + '/' + oldFormatResource.fragment,
						query: oldFormatResource.query,
					});

					const { repo, revisionSpecifier, relativePath } = extractResourceInfo(resource);
					const resourceLocallyNamed = this.contextService.isInsideWorkspace(resource) ?
						URI.parse(`repo://${repo}/${relativePath}`) :
						URI.parse(`repo+version://${repo}/${relativePath}?${revisionSpecifier}`);
					return { ...fileMatch, resource: resourceLocallyNamed };
				});
				complete({
					results: results,
					limitHit: model.response.limitHit,
					stats: {
						fromCache: false,
						resultCount: results.length,
					},
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
		// extendQuery is idempotent, so it is fine that super.search also calls it.
		this.extendQuery(query);

		// Split out local and external resources
		const localFolderQueries = query.folderQueries.filter(fq => fq.folder.scheme !== Schemas.remoteRepo);
		const remoteFolderQueries = query.folderQueries.filter(fq => fq.folder.scheme === Schemas.remoteRepo);

		return PPromise.join({
			local: this.localSearch({ ...query, folderQueries: localFolderQueries }),
			remote: this.remoteSearch({ ...query, folderQueries: remoteFolderQueries }),
		}).then(({ local, remote }) => {
			return {
				limitHit: local.limitHit || remote.limitHit,
				results: local.results.concat(remote.results),
				stats: mergeStats([local.stats, remote.stats]),
				warning: local.warning || remote.warning,
			};
		});
	}

	private localSearch(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		return super.search(query);
	}

	private remoteSearch(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {
		return query.type === QueryType.File ? this.fileSearch(query) : this.textSearch(query);
	}

	private fileSearch(query: ISearchQuery): PPromise<ISearchComplete, ISearchProgressItem> {

		const EngineClass = this.instantiationService.invokeFunction(createRemoteFileSearchEngineClass);

		type IgnoreExtraFields = { type?: any, extraFileResources?: any, fileEncoding?: any, disregardExcludeSettings?: any };
		const rawSearch: IRawSearch & IgnoreExtraFields = {
			...query,
			folderQueries: query.folderQueries ? query.folderQueries.map(q => {
				return <IFolderSearch>{
					excludePattern: q.excludePattern,
					includePattern: q.includePattern,
					fileEncoding: q.fileEncoding,
					folder: q.folder.toString(),
				};
			}) : [],
		};

		const searchP = this.raw.doFileSearch(EngineClass, rawSearch, RemoteSearchService.BATCH_SIZE);
		return DiskSearch.collectResults(searchP);
	}
}

/** mergeStats combines search stats from different search backends. */
function mergeStats(stats: (ISearchStats | undefined)[]): ISearchStats {
	stats = arrays.coalesce(stats);
	const initial = {
		fromCache: stats.length > 0,
		resultCount: 0,
	};
	return arrays.coalesce(stats).reduce((a, b) => ({
		fromCache: a.fromCache && b.fromCache,
		resultCount: a.resultCount + b.resultCount,
	}), initial);
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