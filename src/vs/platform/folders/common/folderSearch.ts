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
 * A folder search result from a FolderSearchProvider, typically representing a repository on
 * a remote code host.
 */
export interface IFolderResult {
    /**
     * The unique identifier for this folder (typically repository).
     */
    resource: URI;

    /**
     * A slash-separated path that names the folder. It should only contain the
     * relevant path components. For example, a GitHub repository at
     * https://github.com/foo/bar has path "github.com/foo/bar".
     */
    path: string;

    /**
     * The name of the folder, typically consisting of the last path component in
     * the folder's path.
     */
    name: string;

    /**
     * The icon to show for the result. Any icon in the [octicon](https://octicons.github.com)
     * icon set can be used (e.g., `repo`, `lock`, `repo-forked`, etc.).
     */
    icon?: string;
}

/**
 * Provides a method to search for folders (typically repositories).
 */
export interface IFolderSearchProvider {
    /**
     * Searches for folders, typically repositories on a remote code host.
     */
    search(query: string): TPromise<IFolderResult[]>;
}

export const IFolderSearchService = createDecorator<IFolderSearchService>('folderSearchService');

/**
 * Searches for folders (typically local and remote repositories).
 */
export interface IFolderSearchService {
    _serviceBrand: any;

	/**
	 * Registers a IFolderSearchProvider (typically to search a remote code host for
     * repositories).
	 */
    registerFolderSearchProvider(id: string, provider: IFolderSearchProvider): IDisposable;

    /**
     * Searches for folders, typically repositories on a remote code host, across all
     * registered folder search providers.
     */
    search(query: string): TPromise<IFolderResult[]>;
}

/**
 * A noop implementation of IFolderSearchService for use by tests.
 */
export const NullFolderSearchService: IFolderSearchService = {
    _serviceBrand: undefined,
    registerFolderSearchProvider(id: string, provider: IFolderSearchProvider): IDisposable {
        throw new Error('not implemented');
    },
    search(query: string): TPromise<IFolderResult[]> {
        return TPromise.as([]);
    },
};