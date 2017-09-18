/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IViewlet } from 'vs/workbench/common/viewlet';

export const VIEWLET_ID = 'workbench.view.management';

export interface IManagementViewlet extends IViewlet {
	/** noop */
}