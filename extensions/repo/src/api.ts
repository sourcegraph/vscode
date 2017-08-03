/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';

/**
 * The public API for this extension, used by other extensions to handle repositories,
 * revisions, and resources inside repositories.
 */
export interface IRepoExtension {
	/**
	 * Returns the repository instance that contains the resource, or undefined if the
	 * resource's repository is unable to be determined.
	 */
	getRepository(resource: vscode.Uri): IRepository | undefined;

	/**
	 * Returns the resolved source control revision information for the resource.
	 */
	resolveResourceRevision(resource: vscode.Uri): Thenable<vscode.SCMRevision | undefined>;

	/**
	 * Returns the relative file path of resource inside folder.
	 */
	toRelativePath(folder: vscode.Uri, resource: vscode.Uri): string;

	/**
	 * Reports whether resource is a repo:// or repo+version:// URI (the two URI schemes that
	 * refer to repo resources handled by this extension).
	 */
	isRepoResource(resource: vscode.Uri): boolean;
}

/**
 * Represents a repository. This is a slightly expanded interface vs. a
 * vscode.SourceControl. In the future these fields may be added to vscode.SourceControl.
 */
export interface IRepository {
	/**
	 * The last-known revision of the repository.
	 *
	 * When the repository's revision is changed (by the user or otherwise), this field's
	 * revision object may be temporarily unresolved (i.e., the 'specifier' and 'id'
	 * fields are undefined) while resolution occurs. Use resolvedRevision instead if you
	 * want to wait for the resolved revision.
	 */
	readonly revision: vscode.SCMRevision;

	/**
	 * The resolved revision of the repository.
	 *
	 * When the repository's revision changes, this field's promise becomes unresolved
	 * immediately until the new revision is resolved.
	 */
	readonly resolvedRevision: Thenable<vscode.SCMRevision>;

	/**
	 * An event that is fired when the repository's status changes. The parent (Workspace)
	 * will then call this repository's renderStatusBarItem if this is the active
	 * repository.
	 */
	readonly onDidChangeStatus: vscode.Event<void>;
}