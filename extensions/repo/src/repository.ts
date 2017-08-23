/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { IRepository } from './api';

/**
 * The URI scheme for a repository handled by this extension.
 */
export const REPO_SCHEME = 'repo';

/**
 * The URI scheme for a Git repository (at a specific revision) handled by this
 * extension. It differs from REPO_SCHEME in that it refers to a specific revision that is
 * inherent in the URI and not subject to external modification (e.g., when the user
 * switches the revision).
 */
export const REPO_VERSION_SCHEME = 'repo+version';

/**
* Returns the revision obtained purely by parsing the input URI. For example, returns "x"
* if resource is "repo+version://github.com/foo/bar/baz?x".
*/
export function parseResourceRevision(resource: vscode.Uri): string | undefined {
	return resource.scheme === REPO_VERSION_SCHEME && resource.query ? resource.query : undefined;
}

/**
 * Reports whether resource is a repo:// or repo+version:// URI (the two URI schemes that
 * refer to repo resources handled by this extension).
 */
export function isRepoResource(resource: vscode.Uri): boolean {
	return resource.scheme === REPO_SCHEME || resource.scheme === REPO_VERSION_SCHEME;
}

/**
 * An SCM repository.
 */
export interface Repository extends IRepository {
	/**
	 * Resolves a revision specifier for a repository.
	 */
	resolveRevisionSpecifier(input: vscode.SCMRevision): Thenable<vscode.SCMRevision>;

	/**
	 * Called by its parent (Workspace) to render information about this repository in the
	 * global SCM status bar item.
	 */
	renderStatusBarItem(statusBarItem: vscode.StatusBarItem): void;

	/**
	 * Shows a quickopen that lists available revisions for the current
	 * repository. Selecting any of these revisions switches the current repository to
	 * that revision, updating all of its open documents to that revision.
	 */
	openRevisionPicker(): void;
}

/**
 * Implemented by things that have a revision.
 */
export interface Revisioned {
	/**
	 * Update the receiver's revision to the specified absolute revision string (e.g., a
	 * Git commit SHA-1).
	 */
	setRevision(revision: string): void;

	/**
	 * Sets an error that occurred while resolving the revision. It also clears the
	 * revision previously set by setRevision (if any).
	 */
	setRevisionError(err: any): void;
}