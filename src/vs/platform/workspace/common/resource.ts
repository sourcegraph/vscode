/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';

/**
 * IResourceInfo describes a resource in a workspace. This information is obtained solely
 * from a URI.
 */
export interface IWorkspaceResourceInfo {
	workspace: URI; // the URI of the workspace containing the resource
	repo?: string; // the repository of the workspace
	revisionSpecifier?: string; // the revision specifier of the resource's workspace
	relativePath?: string; // the resource's path, relative to the workspace root
}

/**
 * Parses the workspace, repo, SCM revision specifier, and path from a resource URI. This
 * should only be used as a guess or as input to ISCMProvider.resolveRevision; if you need
 * the accurate value, you need to resolve the ISCMProvider's revision.
 */
export function extractResourceInfo(uri: string | URI): IWorkspaceResourceInfo | undefined {
	if (typeof uri === 'string') {
		uri = URI.parse(uri);
	}
	// TODO(sqs:vscode): support URIs of the form
	switch (uri.scheme) {
		case Schemas.repo:   // repo://github.com/owner/repo/dir/file
		case Schemas.repoVersion: // repo+version://github.com/owner/repo/dir/file?gitrev
			if (uri.fragment) {
				throw new Error('unexpected old-style URI: ' + uri.toString());
			}
			const pathParts = uri.path.replace(/^\//, '').replace(/\/$/, '').split('/');
			const pathComponentsForRepo = 2;
			const info: IWorkspaceResourceInfo = {
				workspace: uri.with({ path: '/' + pathParts.slice(0, pathComponentsForRepo).join('/'), query: '' }),
				relativePath: pathParts.slice(pathComponentsForRepo).join('/'),
			};
			info.repo = info.workspace.authority + info.workspace.path;
			if (uri.query) {
				info.revisionSpecifier = decodeURIComponent(uri.query);
			}
			return info;

		default:
			return undefined;
	}
}