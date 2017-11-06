/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IChecklistItemGroup, IChecklistItem } from 'vs/workbench/services/checklist/common/checklist';

export function isChecklistItem(element: IChecklistItemGroup | IChecklistItem): element is IChecklistItem {
	return !!(element as IChecklistItem).itemGroup;
}

export function getChecklistItemContextKey(resource: IChecklistItemGroup | IChecklistItem): string {
	return isChecklistItem(resource) ? resource.itemGroup.id : resource.id;
}