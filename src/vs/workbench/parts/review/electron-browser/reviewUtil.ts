/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IReviewResourceGroup, IReviewResource } from 'vs/workbench/services/review/common/review';

export function isReviewResource(element: IReviewResourceGroup | IReviewResource): element is IReviewResource {
	return !!(element as IReviewResource).sourceUri;
}

export function getReviewResourceContextKey(resource: IReviewResourceGroup | IReviewResource): string {
	return isReviewResource(resource) ? resource.resourceGroup.id : resource.id;
}