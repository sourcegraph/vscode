/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import Event from 'vs/base/common/event';
import { ICatalogFolder, FolderGenericIconClass } from 'vs/platform/folders/common/folderCatalog';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

/**
 * A folder from the folder catalog, augmented with additional information
 * from the workbench.
 */
export interface IFolder extends ICatalogFolder {
	readonly id: string;
	readonly genericIconClass: FolderGenericIconClass;
	readonly state: WorkspaceFolderState;
	readonly telemetryData: any;
};

export enum WorkspaceFolderState {
	Adding,
	Active,
	Removing,
	Inactive
}

export enum FolderOperation {
	Adding,
	Removing
}

/**
 * A query for folders in the folder catalog.
 */
export interface ISearchQuery {
	/**
	 * The query input string.
	 */
	value?: string;

	maxResults?: number;

	sortByScore?: boolean;

	cacheKey: string;
}

export interface ISearchComplete {
	limitHit?: boolean;
	results: IFolder[];
	stats: ISearchStats;
}

export interface ISearchStats {
	fromCache: boolean;
	resultCount: number;
	unsortedResultTime?: number;
	sortedResultTime?: number;
}

export const IFoldersWorkbenchService = createDecorator<IFoldersWorkbenchService>('foldersWorkbenchService');

/**
 * The workbench folders service, which augments the folder catalog service with
 * additional folder information (relating to the status of a folder in the workbench) and information
 * about folders that are workspace roots.
 */
export interface IFoldersWorkbenchService {
	_serviceBrand: any;

	/**
	 * Fired whenever any folder catalog data changes (e.g., a folder is added or removed).
	 */
	onChange: Event<void>;

	/**
	 * Returns an array of of the current workspace's folders, with additional catalog
	 * information associated if available.
	 */
	getCurrentWorkspaceFolders(): TPromise<IFolder[]>;

	/**
	 * Searches the catalog and returns matching folders.
	 */
	search(query: ISearchQuery): TPromise<ISearchComplete>;

	/**
	 * Reports whether the query can be satisfied using only the local cache (without
	 * hitting the network).
	 */
	isSearchCached(query: ISearchQuery): boolean;

	/**
	 * Clears the search cache data associated with the specified cache key.
	 */
	clearSearchCache(cacheKey: string): TPromise<void>;

	/**
	 * Adds the folders as workspace root folders, waiting for them to be resolved fully.
	 */
	addFoldersAsWorkspaceRootFolders(folders: (IFolder | URI)[]): TPromise<void>;

	/**
	 * Removes the folders as workspace root folders.
	 */
	removeFoldersAsWorkspaceRootFolders(folders: IFolder[]): TPromise<void>;

	/**
	 * Returns the workspace root folder, if any, that is the local clone of
	 * the remote catalog folder.
	 */
	getWorkspaceFolderForCatalogFolder(catalogFolder: IFolder): URI | undefined;
}