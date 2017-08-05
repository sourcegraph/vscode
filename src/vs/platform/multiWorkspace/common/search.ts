/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import uri from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

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
export interface IWorkspaceMatch {
	/**
	 * The URI of the workspace's root.
	 */
	resource: uri;

	/**
	 * The user-provided description of the workspace (e.g., the
	 * GitHub repository description).
	 */
	description?: string;

	/**
	 * Whether this workspace represents a repository that is private,
	 * as defined by the repository's host.
	 */
	isPrivate?: boolean;

	/**
	 * The current user's affiliation to this workspace, if any.
	 */
	affiliation?: Affiliation;

	/**
	 * Whether this workspace represents a repository that is a fork
	 * of some other repository, as reported by the repository's host.
	 */
	fork?: boolean;

	/**
	 * The number of users who have starred this workspace.
	 */
	starsCount?: number;

	/**
	 * The number of forks of this repository that exist.
	 */
	forksCount?: number;

	/**
	 * The primary programming language of the code in this workspace.
	 */
	language?: string;

	/**
	 * The date when this repository was last git-pushed to.
	 */
	pushedAt?: number;

	/**
	 * Whether this workspace is in the "recently opened folders" list.
	 */
	recentlyOpened?: boolean;

	toJSON(): any;
}

export class WorkspaceMatch implements IWorkspaceMatch {
	constructor(
		public resource: uri,
		public description: string | undefined,
		public isPrivate: boolean | undefined,
		public affiliation: Affiliation | undefined,
		public fork: boolean | undefined,
		public starsCount: number | undefined,
		public forksCount: number | undefined,
		public language: string | undefined,
		public pushedAt: number | undefined,
		public recentlyOpened?: boolean | undefined,
	) {
		// empty
	}

	static fromJSON(data: any): WorkspaceMatch {
		return new WorkspaceMatch(
			uri.parse(data.resource),
			data.description,
			data.isPrivate,
			data.affiliation,
			data.fork,
			data.starsCount,
			data.forksCount,
			data.language,
			data.pushedAt,
			data.recentlyOpened,
		);
	}

	public toJSON(): any {
		return {
			resource: this.resource.toString(),
			description: this.description,
			isPrivate: this.isPrivate,
			affiliation: this.affiliation,
			fork: this.fork,
			starsCount: this.starsCount,
			forksCount: this.forksCount,
			language: this.language,
			pushedAt: this.pushedAt,
			recentlyOpened: this.recentlyOpened,
		};
	}
}