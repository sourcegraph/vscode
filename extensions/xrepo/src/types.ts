/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface PackageData {
	lang: string;
	packageInfo: { [k: string]: string };
	dependencies?: { [k: string]: string }[];

	toDisplayString(): string;
}

export interface PackageQuery {
	lang: string;
	packageInfo: { [k: string]: string }; // build-system-specific package descriptor
}
