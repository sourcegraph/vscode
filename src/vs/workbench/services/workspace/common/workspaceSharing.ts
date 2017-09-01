/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator, ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';

export const IWorkspaceSharingService = createDecorator<IWorkspaceSharingService>('workspaceSharingService');

export interface IWorkspaceSharingService {

	_serviceBrand: ServiceIdentifier<any>;

	/**
	 * Writes out a src-workspace of the current workspace to target. A
	 * src-workspace is a code-workspace that is shareable/relocatable.
	 *
	 * For example, if the workspace has folders with file: URIs that point to
	 * Git repositories, then the exported workspace's corresponding roots will
	 * be the git: URI pointing to the repository's clone URL.
	 */
	export(target: URI): TPromise<void>;

}