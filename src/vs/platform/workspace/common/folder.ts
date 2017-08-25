/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';

/**
 * Rich information about a folder (typically repository) from a folder catalog (such as a
 * repository host).
 */
export interface ICatalogFolder {
	readonly uri: URI;
	readonly name: string;
	readonly displayName: string;
	readonly iconUrl?: string;

	/**
	 * The primary clone URL of this folder's repository.
	 */
	cloneUrl?: URI;

	/**
	 * The user-provided description of the folder (e.g., the
	 * repository description).
	 */
	description?: string;

	/**
	 * Whether this folder represents a repository that is private,
	 * as defined by the repository's host.
	 */
	isPrivate?: boolean;

	/**
	 * Whether this folder represents a repository that is a fork
	 * of some other repository, as reported by the repository's host.
	 */
	fork?: boolean;

	/**
	 * The number of users who have starred this folder's repository.
	 */
	starsCount?: number;

	/**
	 * The number of forks of this folder's repository that exist.
	 */
	forksCount?: number;

	/**
	 * The primary programming language of the code in this folder.
	 */
	language?: string;

	/**
	 * The date when this repository was last updated.
	 */
	readonly updatedAt?: Date;
}
