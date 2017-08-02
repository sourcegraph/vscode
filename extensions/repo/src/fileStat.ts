/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { toRelativePath } from './util';

/**
 * ICustomResolveFileOptions is based on vscode.ResolveFileOptions. It is only used when
 * calling toFileStat.
 */
export interface ICustomResolveFileOptions {
	/**
	 * If speceified, return only the subtree rooted at parentPath
	 * (which is relative to the root passed to toFileStat). This
	 * field is not present in vs/platform/files/common/files'
	 * IResolveFileOptions.
	 */
	parentPath?: string;

	/**
	 * Same as in vscode.ResolveFileOptions.
	 */
	resolveSingleChildDescendants?: boolean;

	/**
	 * Same as in vs/platform/files/common/files, except the array
	 * elements are file paths relative to the root passed to
	 * toFileStat, not absolute URIs. This is a performance
	 * optimization.
	 */
	resolveTo?: string[];

	/**
	 * Same as in vscode.ResolveFileOptions.
	 */
	resolveAllDescendants?: boolean;
}

/**
 * Converts from IResolveFileOptions to our slightly custom and
 * optimized ICustomResolveFileOptions.
 *
 * It precomputes/transforms the input parameters for toFileStat. For example, instead of
 * passing toFileStat a full URI for each resolveTo entry, it only passes the relative
 * paths. This lets toFileStat avoid URI operations in its tight loop.
 */
export function toICustomResolveFileOptions(root: vscode.Uri, parentPath?: string, options?: vscode.ResolveFileOptions): ICustomResolveFileOptions {
	return {
		parentPath,
		resolveSingleChildDescendants: options ? options.resolveSingleChildDescendants : undefined,
		resolveTo: options && options.resolveTo ? toRelativePaths(root, options.resolveTo) : undefined,
		resolveAllDescendants: options && options.resolveAllDescendants,
	};
}

function toRelativePaths(root: vscode.Uri, resources: vscode.Uri[]): string[] {
	const relativePaths: string[] = [];
	for (const resource of resources) {
		relativePaths.push(toRelativePath(root, resource));
	}
	return relativePaths;
}

/**
 * toFileStat returns a tree of IFileStat that represents a tree underneath the given root
 * URI. It returns null if (root + '/' + options.parentPath) does not exist.
 *
 * @param root The root URI of the file paths.
 * @param files A lexicographically sorted list of file paths in
 *              the workspace, relative to the root and
 *              without a leading '/'.
 */
export function toFileStat(root: vscode.Uri, files: string[], options: ICustomResolveFileOptions, skipFiles: number = 0): vscode.FileStat | null {
	const { parentPath, resolveSingleChildDescendants, resolveTo, resolveAllDescendants } = options;

	if (parentPath && parentPath.startsWith('/')) {
		throw new Error('parentPath must not have a leading slash: ' + parentPath);
	}

	const resolveToPrefixes = Object.create(null);
	if (resolveTo) {
		for (const path of resolveTo) {
			const parts = path.split('/');
			// The path might be a file or dir (or might not exist).
			for (let i = 1; i <= parts.length; i++) {
				const ancestor = parts.slice(0, i).join('/');
				resolveToPrefixes[ancestor] = true;
			}
		}
	}

	const rootResource: vscode.Uri = parentPath ? root.with({ path: root.path + '/' + parentPath }) : root;

	const rootStat: vscode.FileStat = {
		resource: rootResource,
		name: path.basename(rootResource.path),
		isDirectory: undefined!,
		hasChildren: undefined!,
		mtime: undefined!,
		etag: undefined!,
	};
	if (!parentPath) {
		// The root is assumed to be a directory that exists.
		rootStat.isDirectory = true;
	}

	if (resolveAllDescendants) {
		// Simple flat case.
		rootStat.children = [];
		for (const file of files) {
			if (parentPath && !file.startsWith(parentPath + '/')) {
				continue;
			}
			rootStat.children.push({
				resource: rootResource.with({ path: rootResource.path + '/' + file }),
				name: path.basename(file),
				isDirectory: false,
				hasChildren: false,
				mtime: undefined!,
				etag: undefined!,
			});
		}
		rootStat.isDirectory = true;
		rootStat.hasChildren = !!rootStat.children;
		return rootStat;
	}

	// NOTE: This loop is performance sensitive. It runs one iteration per file in the
	// repo. We take shortcuts (such as `undefined!` instead of Math.random() or
	// Date.now()) because they meaningfully improve performance and we have tested them
	// to ensure they don't cause other problems.
	let lastSubdir: string | undefined = undefined;
	let hasSeenParentPathPrefix = false;
	for (let i = skipFiles; i < files.length; i++) {
		const file = files[i];
		if (file === parentPath) {
			rootStat.isDirectory = false;
			rootStat.hasChildren = false;
			return rootStat;
		} else if (!parentPath || file.startsWith(parentPath + '/')) {
			if (parentPath) { hasSeenParentPathPrefix = true; }
			if (!rootStat.hasChildren) {
				rootStat.isDirectory = true;
				rootStat.hasChildren = true;
				rootStat.children = [];
			}

			const pathComponentPos = parentPath ? parentPath.length + 1 : 0;
			const slashPos = file.indexOf('/', pathComponentPos);
			if (slashPos === -1) {
				// Is a file directly underneath parentPath.
				rootStat.children!.push({
					resource: root.with({ path: root.path + '/' + file }),
					name: path.basename(file),
					isDirectory: false,
					hasChildren: false,
					mtime: undefined!,
					etag: undefined!,
				});
				lastSubdir = undefined;
			} else {
				// Is a file that is two or more levels below parentPath.
				const subdir = file.slice(pathComponentPos, slashPos);
				const parent = file.slice(0, slashPos);
				const resolveToThisFile = resolveToPrefixes && resolveToPrefixes[parent];
				if (subdir !== lastSubdir) {
					lastSubdir = subdir;
					const recurse = resolveToThisFile ||
						(resolveSingleChildDescendants && (i === files.length - 1 || !files[i + 1].startsWith(parentPath ? (parentPath + '/' + subdir) : subdir)));
					if (recurse) {
						const recurseParentPath = parentPath ? (parentPath + '/' + subdir) : subdir;
						rootStat.children!.push(toFileStat(root, files, {
							parentPath: recurseParentPath,
							resolveSingleChildDescendants,
							resolveTo,
						}, i)!);
					} else {
						rootStat.children!.push({
							resource: rootResource.with({ path: rootResource.path + '/' + subdir }),
							name: subdir,
							isDirectory: true,
							hasChildren: true,
							mtime: undefined!,
							etag: undefined!,
						});
					}
				}
			}
		} else if (hasSeenParentPathPrefix) {
			// Because we assume files is sorted, we know we won't
			// find any more matches.
			break;
		}
	}

	if (!rootStat.isDirectory) {
		return null; // not found
	}

	if (!rootStat.children) {
		rootStat.hasChildren = false;
	}
	return rootStat;
}