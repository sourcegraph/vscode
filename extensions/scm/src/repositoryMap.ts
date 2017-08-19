/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { Repository } from './repository';
import { GitRepository } from './git';
import { repoExtension } from './main';

export interface ResolvedSCMRevision extends vscode.SCMRevision {
	id: string; // narrows from "| undefined"
}

export interface IResourceInfo {
	repo: Repository;
	revision?: ResolvedSCMRevision;

	/**
	 * Whether the resource is immutable. For example, a file at a specific Git commit is
	 * immutable, but a file in Git worktree is mutable.
	 */
	immutable: boolean;

	path: string;
}

/**
* Returns the repository, revision, and path of the resource. If the resource isn't from a
* repository or the revision is not resolved, it returns undefined.
*/
export function getResourceInfo(resource: vscode.Uri): IResourceInfo | undefined {
	const repo = repositoryForResource(resource);
	if (!repo) {
		return;
	}
	if (!repo.sourceControl.revision || !repo.sourceControl.revision.id) {
		return;
	}

	const folder = vscode.workspace.findContainingFolder(resource);
	if (!folder) {
		return;
	}
	const path = repoExtension.toRelativePath(folder, resource);
	if (!path) {
		return;
	}

	return {
		repo,
		revision: repo.sourceControl.revision as ResolvedSCMRevision,
		immutable: repoExtension.isRepoResource(resource),
		path,
	};
}

/**
 * Returns the repository that the given resource originates from, or undefined if there
 * is no repository or if it doesn't implement the Repository interface.
 */
export function repositoryForResource(resource: vscode.Uri): Repository | undefined {
	const sourceControl = vscode.scm.getSourceControlForResource(resource);
	if (!sourceControl) {
		return;
	}

	let repo = repositories.find(repo => repo.sourceControl === sourceControl);
	if (!repo) {
		repo = createRepository(sourceControl);
		if (repo) {
			repositories.push(repo);
		}
	}
	return repo;
}

const repositories: Repository[] = [];

function createRepository(sourceControl: vscode.SourceControl): Repository | undefined {
	if (!sourceControl.rootFolder) {
		return;
	}
	if (sourceControl.rootFolder.scheme !== 'file' && sourceControl.rootFolder.scheme !== 'repo' && sourceControl.rootFolder.scheme !== 'gitremote') {
		return;
	}

	return new GitRepository(sourceControl);
}

/**
 * Dispose all repositories.
 */
export function dispose(): void {
	for (const repo of repositories) {
		repo.dispose();
	}
	repositories.length = 0;
}