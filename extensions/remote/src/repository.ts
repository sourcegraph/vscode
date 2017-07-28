/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

/**
 * The URI scheme for a remote repository handled by this extension.
 */
export const REPO_SCHEME = 'repo';

/**
 * The URI scheme for a remote Git repository (at a specific revision) handled by this
 * extension. It differs from REPO_SCHEME in that its files are immutable and always drawn
 * from the same revision; it is not possible to change the revision.
 */
export const GIT_REMOTE_SCHEME = 'gitremote';

/**
 * Reports whether resource is a repo:// or gitremote:// URI (the two URI schemes that
 * refer to remote resources handled by this extension).
 */
export function isRemoteResource(resource: vscode.Uri): boolean {
	return resource.scheme === REPO_SCHEME || resource.scheme === GIT_REMOTE_SCHEME;
}

/**
 * An SCM repository.
 */
export interface Repository {
	/**
	 * Resolves a revision specifier for a repository.
	 */
	resolveRevisionSpecifier(input: vscode.SCMRevision): Thenable<vscode.SCMRevision>;

	/**
	 * An event that is fired when the repository's status changes. The parent (Workspace)
	 * will then call this repository's renderStatusBarItem if this is the active
	 * repository.
	 */
	onDidChangeStatus: vscode.Event<void>;

	/**
	 * Called by its parent (Workspace) to render information about this repository in the
	 * global remote SCM status bar item.
	 */
	renderStatusBarItem(statusBarItem: vscode.StatusBarItem): void;
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
}