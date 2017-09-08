/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const INavService = createDecorator<INavService>('navService');

export interface INavService {

	_serviceBrand: any;

	getLocation(): string;

	getShareableLocation(): string;

	focusLocationBar(): void;
}