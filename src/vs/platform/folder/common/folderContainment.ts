/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

export const IFolderContainmentService = createDecorator<IFolderContainmentService>('folderContainmentService');

/**
 * Manages the mapping of resources to their preferred parent folders (i.e., the folders
 * that should be opened as a root when the resource is opened).
 *
 * This is useful for things like (1) opening the top-level repository directory for a
 * file you open to make it easier to navigate around and get more context and (2)
 * associating a resource with the (possibly remote) repository it exists in.
 *
 * A containing folder is not necessarily a root folder of the current workspace (or any
 * workspace). This service is designed with the assumption that there are too many
 * potential containing folders globally to enumerate.
 */
export interface IFolderContainmentService {
	_serviceBrand: any;

	/**
	 * Finds the preferred parent folder for the resource. If none is found, the promise
	 * resolves to undefined.
	 */
	findContainingFolder(resource: URI): TPromise<URI | undefined>;
}

export class FolderContainmentService implements IFolderContainmentService, IDisposable {
	_serviceBrand: any;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
	) { }

	public findContainingFolder(resource: URI): TPromise<URI | undefined> {
		// TODO(sqs): only correct for repos with 3 components (such as
		// github.com/foo/bar).
		const root = this.contextService.getRoot(resource);
		if (root) {
			return TPromise.as(root);
		}
		return TPromise.as(findContainingFolder(resource));
	}

	public dispose(): void { }
}

/**
 * TODO(sqs): While we migrate from extractResourceInfo to
 * findContainingFolder/IFolderContainmentService, this function is exported and used by
 * both the workbench and extension host processes to determine the containing folder in a
 * limited but simple manner (that's equivalent to extractResourceInfo). In the future
 * this implementation will become more advanced to support repositories with varying
 * number of path components, etc.
 */
export function findContainingFolder(resource: URI): URI | undefined {
	if (resource.scheme === 'repo') {
		return resource.with({
			path: resource.path.split('/').slice(0, 3).join('/'),
		});
	}
	if (resource.scheme === 'repo+version') {
		return resource.with({
			path: resource.path.split('/').slice(0, 3).join('/'),
			// Preserve query component of URI.
		});
	}
	return undefined;
}