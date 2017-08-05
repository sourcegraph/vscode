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
	readonly description?: string;
	readonly starsCount?: number;
	readonly forksCount?: number;
	readonly language?: string;
	readonly iconUrl?: string;
	readonly updatedAt?: Date;
}
