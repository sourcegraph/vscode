/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ICatalogFolder } from 'vs/platform/workspace/common/folder';

export const IWorkspaceSearchService = createDecorator<IWorkspaceSearchService>('multiWorkspaceSearch');

/**
 * A service that enables searching among all known workspaces. The results are
 * workspaces themselves; this does not search inside of workspaces and this is
 * not cross-workspace text search.
 */
export interface IWorkspaceSearchService {
	_serviceBrand: any;

	/**
	 * search returns a promise which completes with workspace search results
	 * matching the specified query.
	 */
	search(query: ISearchQuery): TPromise<ISearchComplete>;

	/**
	 * Returns information about a specific workspace.
	 */
	getWorkspace(uri: uri): TPromise<IWorkspaceMatch>;

	/**
	 * Reports whether the query can be satisfied using only the local cache (without
	 * hitting the network).
	 */
	isCached(query: ISearchQuery): boolean;

	clearCache(cacheKey: string): TPromise<void>;
}

export interface ISearchQuery {
	pattern?: string;
	maxResults?: number;
	sortByScore?: boolean;
	cacheKey: string;

	/**
	 * Search only among repositories that the current user is affiliated with.
	 */
	affiliated?: boolean;

	/**
	 * Search only among repositories that the current user has starred.
	 */
	starred?: boolean;

	/**
	 * Ask the server to return possibly incomplete results quickly. This is a hint to the
	 * server, and the client can't make any assumptions about this.
	 *
	 * TODO(sqs): We will improve the Sourcegraph API for repositories soon and have
	 * clearer definitions for all of this stuff. Right now, a "fast" query will be
	 * satisfied with purely local data and will exclude repositories that haven't yet
	 * been mirrored to Sourcegraph but that exist on GitHub.
	 */
	fast?: boolean;
}

export interface ISearchComplete {
	limitHit?: boolean;
	results: IWorkspaceMatch[];
	stats: ISearchStats;
}

export interface ISearchStats {
	fromCache: boolean;
	resultCount: number;
	unsortedResultTime?: number;
	sortedResultTime?: number;
}

/**
 * Describes a user's affiliation with a workspace (such as contributor, member, etc.).
 */
export enum Affiliation {
	None = 0,
	Member,
}

/**
 * A workspace (typically a repository) that matched a search query.
 */
export interface IWorkspaceMatch extends ICatalogFolder {
	/**
	 * The current user's affiliation to this workspace, if any.
	 */
	affiliation?: Affiliation;

	toJSON(): any;
}

export class WorkspaceMatch implements IWorkspaceMatch {
	constructor(
		public uri: uri,
		public name: string,
		public displayName: string,
		public iconUrl: string | undefined,
		public cloneUrl: uri | undefined,
		public description: string | undefined,
		public isPrivate: boolean | undefined,
		public affiliation: Affiliation | undefined,
		public fork: boolean | undefined,
		public starsCount: number | undefined,
		public forksCount: number | undefined,
		public language: string | undefined,
		public updatedAt: Date | undefined,
	) {
		// empty
	}

	static fromJSON(data: any): WorkspaceMatch {
		return new WorkspaceMatch(
			uri.parse(data.uri),
			data.name,
			data.displayName,
			data.iconUrl,
			data.cloneUrl ? uri.parse(data.cloneUrl) : undefined,
			data.description,
			data.isPrivate,
			data.affiliation,
			data.fork,
			data.starsCount,
			data.forksCount,
			data.language,
			data.updatedAt,
		);
	}

	public toJSON(): any {
		return {
			uri: this.uri.toString(),
			name: this.name,
			displayName: this.displayName,
			iconUrl: this.iconUrl,
			cloneUrl: this.cloneUrl.toString(),
			description: this.description,
			isPrivate: this.isPrivate,
			affiliation: this.affiliation,
			fork: this.fork,
			starsCount: this.starsCount,
			forksCount: this.forksCount,
			language: this.language,
			updatedAt: this.updatedAt,
		};
	}
}