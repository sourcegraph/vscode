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
 * An SCM repository.
 */
export interface Repository {
	/**
	 * Resolves a revision specifier for a repository.
	 */
	resolveRevisionSpecifier(input: vscode.SCMRevision): Thenable<vscode.SCMRevision>;
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