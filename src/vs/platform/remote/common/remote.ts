/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface IRemoteConfiguration {
	remote?: {
		endpoint?: string;
		cookie?: string;
		shareContext?: boolean;
	};
}