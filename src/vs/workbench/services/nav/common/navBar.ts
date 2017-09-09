/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const INavBarService = createDecorator<INavBarService>('navBarService');

/**
 * The navbar is displayed at the top of the window. It displays the application
 * state and exposes navigation actions.
 */
export interface INavBarService {

	_serviceBrand: any;

	/**
	 * Focuses the navbar's location bar input.
	 */
	focusLocationBar(): void;
}
