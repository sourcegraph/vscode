/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as scorer from 'vs/base/common/scorer';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { WorkspaceMatch, IWorkspaceMatch, ISearchComplete, ISearchQuery, IWorkspaceSearchService, Affiliation } from 'vs/platform/multiWorkspace/common/search';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IRemoteService, requestGraphQL } from 'vs/platform/remote/node/remote';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';

type ICacheEntry = {
	stale: boolean;
	result: TPromise<ISearchComplete> | ISearchComplete;
};

export class WorkspaceSearchService implements IWorkspaceSearchService {
	_serviceBrand: any;

	/**
	 * The cache namespace (ISearchQuery.cacheKey value) that indicates the query's
	 * results should be cached in localStorage for the entire duration of the user's
	 * logged-in session.
	 */
	static readonly USER_STORAGE_CACHE_KEY = 'user/workspaceSearch';

	/**
	 * Multi-level cache. The first key is ISearchQuery.cacheKey, which is the key to the
	 * cache. Within a cache, the key is a serialized and canonicalized representation of
	 * each query (createQueryCacheKey).
	 */
	private caches = new Map<string, Map<string, ICacheEntry>>();

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IRemoteService private remoteService: IRemoteService,
		@IStorageService private storageService: IStorageService
	) {
		this.loadCache();
	}

	extendQuery(query: ISearchQuery): ISearchQuery {
		query = { ...query };

		if (!query.maxResults) {
			delete query.maxResults;
		}

		if (!query.pattern) {
			delete query.pattern;
		}

		if (query.affiliated || query.starred) {
			// Cache these more aggressively since they are less likely to change during a
			// single user session and it's very valuable to have them be immediately
			// available.
			query.cacheKey = WorkspaceSearchService.USER_STORAGE_CACHE_KEY;
		}

		return query;
	}

	search(query: ISearchQuery): TPromise<ISearchComplete> {
		query = this.extendQuery(query);

		let filter: (results: IWorkspaceMatch[]) => IWorkspaceMatch[];

		// Construct the variable parts of the GraphQL query.
		let graphqlField: string;
		let graphqlVars: { [key: string]: any };
		if (query.affiliated || query.starred) {
			if (query.affiliated && query.starred) {
				return TPromise.wrapError(new Error('invalid query: at most one of affiliated and starred may be set'));
			}

			if (query.affiliated) {
				graphqlField = 'remoteRepositories';
			} else if (query.starred) {
				graphqlField = 'remoteStarredRepositories';
			}
			graphqlVars = {};

			if (query.pattern !== undefined) {
				// The pattern is ignored by the server for
				// remoteRepositories/remoteStarredRepositories queries. Clear it out to
				// increase cache hit rate.
				const patternLower = query.pattern.toLowerCase();
				query = { ...query, pattern: undefined };
				if (patternLower) {
					filter = results => {
						return results.filter(m => {
							return scorer.matches(m.resource.path.slice(1) /* rm leading slash */, patternLower);
						});
					};
				}
			}
		} else {
			graphqlField = 'repositories(query: $query, fast: $fast)';
			graphqlVars = {
				query: query.pattern,
				fast: query.fast,
			};
		}

		let complete = this.doSearchCached(query, graphqlField, graphqlVars);
		if (filter) {
			complete = complete.then(complete => ({
				...complete, // copy to avoid modifying cached value
				results: filter(complete.results),
			}));
		}
		return complete;
	}

	private doSearchCached(query: ISearchQuery, graphqlField: string, graphqlVars: { [key: string]: any }): TPromise<ISearchComplete> {
		const cachedValue = this.getFromCache(query);

		// Optimistically use stale cached data, but trigger a refresh.
		if (!cachedValue || cachedValue.stale) {
			const result = this.doSearch(query, graphqlField, graphqlVars);

			if (cachedValue) {
				// Mark cached value as non-stale so other callers don't also try to refresh it.
				this.storeInCache(query, { ...cachedValue, stale: false });
			} else {
				this.storeInCache(query, { result, stale: false });
			}

			result.done(
				complete => {
					// Store resolved value in cache so that we can persist it more easily if
					// desired.
					this.storeInCache(query, { result: complete, stale: false });

					if (query.cacheKey === WorkspaceSearchService.USER_STORAGE_CACHE_KEY) {
						this.saveCache();
					}
				},
				err => {
					// Don't store canceled or rejected result promises.
					this.storeInCache(query, null);
				});
			if (!cachedValue) { return result; }
		}
		return TPromise.as(cachedValue.result) as TPromise<ISearchComplete>;
	}

	private toWorkspaceMatch(repo: { uri: string, description: string, private: boolean, fork: boolean, starsCount?: number, forksCount?: number, language?: string, pushedAt: string }, query?: ISearchQuery): WorkspaceMatch {
		return new WorkspaceMatch(
			URI.parse(`repo://${repo.uri}`),
			repo.description,
			repo.private,
			query && query.affiliated ? Affiliation.Member : Affiliation.None,
			repo.fork,
			repo.starsCount,
			repo.forksCount,
			repo.language,
			repo.pushedAt ? Date.parse(repo.pushedAt) : undefined,
		);
	}

	private doSearch(query: ISearchQuery, graphqlField: string, graphqlVars: { [key: string]: any }): TPromise<ISearchComplete> {
		const convertResults = (repos: any[]) => {
			return repos.map(repo => this.toWorkspaceMatch(repo, query));
		};

		const graphqlQuery = `query SearchRepos {
				root {
					${graphqlField} {
						uri
						description
						private
						fork
						starsCount
						forksCount
						language
						pushedAt
					}
				}
			}`;

		// Create our own TPromise so we can set a cancellation handler.
		let requestPromise: TPromise<any>;
		const resultPromise = new TPromise<ISearchComplete>((complete, error) => {
			// Handle empty query immediately.
			if (this.isTriviallyEmpty(query)) {
				complete({ results: [], stats: {} as any });
				return;
			}

			requestPromise = requestGraphQL<any>(this.remoteService, graphqlQuery, graphqlVars)
				.then(root => {
					const result = {
						results: convertResults(root.repositories || root.remoteRepositories || root.remoteStarredRepositories),
						stats: {} as any,
					};
					return complete(result);
				}, error);
		}, () => {
			if (requestPromise) {
				requestPromise.cancel();
			}
		});
		return resultPromise;
	}

	public getWorkspace(uri: URI): TPromise<IWorkspaceMatch | undefined> {
		return requestGraphQL(this.remoteService, `
			query GetRepo {
				root {
					repository(uri: $uri) {
						uri
						description
						private
						fork
						starsCount
						forksCount
						language
						pushedAt
					}
				}
}`,
			{ uri: uri.authority + uri.path },
		)
			.then((root: any) => {
				return root && root.repository ? this.toWorkspaceMatch(root.repository) : undefined;
			});
	}

	public isCached(query: ISearchQuery): boolean {
		query = this.extendQuery(query);
		return this.isTriviallyEmpty(query) || Boolean(this.getFromCache(query));
	}

	private isTriviallyEmpty(query: ISearchQuery): boolean {
		return !query.pattern && !query.affiliated && !query.starred;
	}

	private getFromCache(query: ISearchQuery): ICacheEntry | undefined {
		const cache = this.caches.get(query.cacheKey);
		return cache && cache.get(this.createQueryCacheKey(query));
	}

	private storeInCache(query: ISearchQuery, entry: ICacheEntry): void {
		let cache = this.caches.get(query.cacheKey);
		if (!cache) {
			cache = new Map<string, ICacheEntry>();
			this.caches.set(query.cacheKey, cache);
		}
		cache.set(this.createQueryCacheKey(query), entry);
	}

	/**
	 * Serialize and canonicalize a query to create the query cache key. Note that this is
	 * distinct from ISearchQuery.cacheKey. That identifies a cache namespace, which
	 * contains many entries keyed on the query cache key produced by this method.
	 */
	private createQueryCacheKey(query: ISearchQuery): string {
		query = { ...query }; // copy

		// Normalize
		if (query.affiliated || query.starred) { delete query.pattern; }

		// We are already bucketing on this value; no need to include it in the 2nd-level
		// cache key.
		delete query.cacheKey;

		return JSON.stringify(query);
	}

	/**
	 * Try to load the query cache from the storage service.
	 */
	private loadCache(): void {
		const raw = this.storageService.get(WorkspaceSearchService.USER_STORAGE_CACHE_KEY, StorageScope.GLOBAL);
		if (!raw) { return; }
		try {
			const cache = new Map<string, ICacheEntry>();

			const data = JSON.parse(raw);
			Object.keys(data).forEach(key => {
				cache.set(key, {
					result: {
						results: data[key].map(rawResult => WorkspaceMatch.fromJSON(rawResult)),
						stats: {} as any,
					},

					// Optimistically use the cached data but trigger a refresh.
					stale: true,
				});
			});

			this.caches.set(WorkspaceSearchService.USER_STORAGE_CACHE_KEY, cache);
		} catch (err) {
			console.error('WorkspaceSearchService#loadCacheFromStorage: error loading cache', err, raw);
			this.storageService.remove(WorkspaceSearchService.USER_STORAGE_CACHE_KEY, StorageScope.GLOBAL);
		}
	}

	/**
	 * Write the query cache to the storage service.
	 */
	private saveCache(): void {
		const cache = this.caches.get(WorkspaceSearchService.USER_STORAGE_CACHE_KEY);
		if (!cache) {
			return;
		}

		try {
			const data = Object.create(null);
			cache.forEach(({ result }, queryCacheKey) => {
				// Only store already resolved values.
				if (!TPromise.is(result) && result.results) {
					data[queryCacheKey] = result.results;
				}
			});
			this.storageService.store(WorkspaceSearchService.USER_STORAGE_CACHE_KEY, JSON.stringify(data), StorageScope.GLOBAL);
		} catch (err) {
			console.error('WorkspaceSearchService#loadCacheFromStorage: error saving cache', err);
		}
	}

	clearCache(cacheKey: string): TPromise<void> {
		this.caches.delete(cacheKey);
		if (cacheKey === WorkspaceSearchService.USER_STORAGE_CACHE_KEY) {
			this.storageService.remove(WorkspaceSearchService.USER_STORAGE_CACHE_KEY, StorageScope.GLOBAL);
		}
		return TPromise.as(void 0);
	}
}
