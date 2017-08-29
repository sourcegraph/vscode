/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const VIEWLET_ID = 'workbench.view.scm';

export const SCMViewletActiveRepositoryContext = new RawContextKey<string>('scmViewletActiveRepository', undefined);
