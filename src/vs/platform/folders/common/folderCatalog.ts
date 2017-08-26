/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

/**
 * Octicon class names that can be used as a folder's generic icon.
 */
export type FolderGenericIconClass = 'repo' | 'lock' | 'repo-forked' | 'mirror' | 'circle-slash' | 'file-directory' | 'file-submodule' | 'file-symlink-directory';

/**
 * A folder from the folder catalog service, typically representing a repository on
 * a remote code host.
 */
export interface ICatalogFolder {
	/**
	 * The unique identifier for this folder. See CatalogFolder#resource in the
	 * extension API for more information.
	 */
	readonly resource: URI;

	// See the corresponding fields on CatalogFolder in the extension API for documentation.
	readonly displayPath?: string;
	readonly displayName?: string;
	readonly iconUrl?: string;
	readonly genericIconClass?: FolderGenericIconClass;
	readonly cloneUrl?: URI;
	readonly description?: string;
	readonly isPrivate?: boolean;
	readonly isFork?: boolean;
	readonly isMirror?: boolean;
	readonly starsCount?: number;
	readonly forksCount?: number;
	readonly watchersCount?: number;
	readonly primaryLanguage?: string;
	readonly createdAt?: Date;
	readonly updatedAt?: Date;
	readonly pushedAt?: Date;
	readonly viewerHasStarred?: boolean;
	readonly viewerCanAdminister?: boolean;
	readonly approximateByteSize?: number;
}

/**
 * Provides methods for searching and managing folders (typically repositories).
 */
export interface IFolderCatalogProvider {
	/**
	 * Gets information about the folder (typically a repository) with the given URI.
	 */
	resolveFolder(resource: URI): TPromise<ICatalogFolder | null>;

	/**
	 * Searches for folders, typically repositories on a remote code host.
	 */
	search(query: string): TPromise<ICatalogFolder[]>;
}

export const IFolderCatalogService = createDecorator<IFolderCatalogService>('folderCatalogService');

/**
 * Searches and manages folders (that typically represent remote repositories).
 */
export interface IFolderCatalogService {
	_serviceBrand: any;

	/**
	 * Registers a folder catalog provider to search and manage folders (typically repositories on
	 * a remote code host).
	 *
	 * All folders underneath the given root resource are associated with the provider. See
	 * ICatalogFolder#resource for more information.
	 */
	registerFolderCatalogProvider(root: URI, provider: IFolderCatalogProvider): IDisposable;

	/**
	 * Gets information about the folder (typically a repository) with the given URI. The
	 * URI must be the unique identifier originally retrieved from the folder catalog in
	 * ICatalogFolder#resource (which is different from the clone URL in general).
	 */
	resolveFolder(resource: URI): TPromise<ICatalogFolder>;

	/**
	 * Searches for folders, typically repositories on a remote code host, across all
	 * registered folder catalog providers.
	 */
	search(query: string): TPromise<ICatalogFolder[]>;
}

/**
 * A noop implementation of IFolderCatalogService for use by tests.
 */
export const NullFolderCatalogService: IFolderCatalogService = {
	_serviceBrand: undefined,
	registerFolderCatalogProvider(root: URI, provider: IFolderCatalogProvider): IDisposable {
		throw new Error('not implemented');
	},
	resolveFolder(resource: URI): TPromise<ICatalogFolder> {
		throw new Error('not implemented');
	},
	search(query: string): TPromise<ICatalogFolder[]> {
		return TPromise.as([]);
	},
};