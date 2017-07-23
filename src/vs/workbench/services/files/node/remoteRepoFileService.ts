/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
// tslint:disable-next-line:import-patterns
import * as path from 'path';
import { startsWith } from 'vs/base/common/strings';
import { TPromise } from 'vs/base/common/winjs.base';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { FileChangesEvent, FileOperationEvent, IBaseStat, IContent, IFileService, IFileStat, IImportResult, IResolveContentOptions, IResolveFileOptions, IResolveFileResult, IStreamContent, IUpdateContentOptions } from 'vs/platform/files/common/files';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceResourceInfo, extractResourceInfo } from 'vs/platform/workspace/common/resource';
import { IRemoteService, requestGraphQL } from 'vs/platform/remote/node/remote';
import { ISCMService, ISCMRevision } from 'vs/workbench/services/scm/common/scm';

// FileService provides files from Sourcegraph's API instead of a normal file
// system.
export class RemoteRepoFileService implements IFileService {
	_serviceBrand: any;

	private _onFileChanges: Emitter<FileChangesEvent> = new Emitter<FileChangesEvent>();
	private _onAfterOperation: Emitter<FileOperationEvent> = new Emitter<FileOperationEvent>();

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IRemoteService private remoteService: IRemoteService,
		@ISCMService private scmService: ISCMService,
	) { }

	public get onFileChanges(): Event<FileChangesEvent> {
		return this._onFileChanges.event;
	}

	/**
	 * Fire a synthesized FileChangesEvent to all listeners of
	 * onFileChanges. This can be used by external callers that become
	 * aware of changes to the underlying files (e.g., after the SCM
	 * revision changes) to cause files to be refreshed.
	 */
	public fireFileChanges(event: FileChangesEvent): void {
		this._onFileChanges.fire(event);
	}

	public get onAfterOperation(): Event<FileOperationEvent> {
		return this._onAfterOperation.event;
	}

	public updateOptions(options: any): void {
		throw new Error('not implemented');
	}

	createFile(resource: URI, content: string = ''): TPromise<IFileStat> {
		throw new Error('not implemented');
	}

	public touchFile(resource: URI): TPromise<IFileStat> {
		throw new Error('not implemented');
	}

	public del(resource: URI): TPromise<void> {
		throw new Error('not implemented');
	}

	resolveFile(resource: URI, options?: IResolveFileOptions): TPromise<IFileStat> {
		// console.count('resolveFile:' + resource.toString());
		const info = extractResourceInfo(resource);
		return fetchFilesAndDirs(this.contextService, this.remoteService, this.scmService, info).then(files => {
			return toFileStat(info.workspace, files, toICustomResolveFileOptions(info.relativePath, options));
		});
	}

	resolveFiles(toResolve: { resource: URI, options?: IResolveFileOptions }[]): TPromise<IResolveFileResult[]> {
		return TPromise.join(toResolve.map(resourceAndOptions => this.resolveFile(resourceAndOptions.resource, resourceAndOptions.options)
			.then(stat => ({ stat, success: true }), error => ({ stat: undefined, success: false }))));
	}

	public resolveContents(resources: URI[]): TPromise<IContent[]> {
		return TPromise.join(resources.map(resource => this.resolveContent(resource)));
	}

	resolveContent(resource: URI, options?: IResolveContentOptions): TPromise<IContent> {
		// console.count('resolveContent:' + resource.toString());
		return TPromise.wrap(this.fetchContentAndResolveRev(resource)).then(content => {
			return {
				...toBaseStat(resource),
				value: content,
				encoding: 'utf8',
			};
		});
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): TPromise<IStreamContent> {
		// console.count('resolveStreamContent:' + resource.toString());
		return this.resolveContent(resource, options).then(content => {
			return ({
				...content,
				value: {
					on: (event: string, callback: Function): void => {
						if (event === 'data') {
							callback(content.value);
						}
						if (event === 'end') {
							callback();
						}
					}
				},
			});
		});
	}

	existsFile(resource: URI): TPromise<boolean> {
		// console.count('existsFile:' + resource.toString());
		return this.resolveFile(resource).then(
			() => true,
			() => false,
		);
	}


	public moveFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		throw new Error('not implemented');
	}

	public copyFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		throw new Error('not implemented');
	}

	public createFolder(resource: URI): TPromise<IFileStat> {
		throw new Error('not implemented');
	}

	public rename(resource: URI, newName: string): TPromise<IFileStat> {
		throw new Error('not implemented');
	}

	public importFile(source: URI, targetFolder: URI): TPromise<IImportResult> {
		throw new Error('not implemented');
	}

	public watchFileChanges(resource: URI): void {
		throw new Error('not implemented');
	}

	public getEncoding(resource: URI): string {
		throw new Error('not implemented');
	}

	public unwatchFileChanges(resource: URI): void;
	public unwatchFileChanges(path: string): void;
	public unwatchFileChanges(arg: any): void {
		throw new Error('not implemented');
	}

	// Stubbed implementation to handle updating the configuration from the VSCode extension
	public updateContent(resource: URI, value: string, options: IUpdateContentOptions = Object.create(null)): TPromise<IFileStat> {
		throw new Error('not implemented');
	}

	public dispose(): void { /* noop */ }

	private _contentCache: { [key: string]: string } = Object.create(null);

	private fetchContentAndResolveRev(resource: URI): TPromise<string> {
		return workspaceResourceInfoVars(this.contextService, this.scmService, extractResourceInfo(resource))
			.then(vars => {
				if (!vars.revision) {
					throw new Error('unable to fetch ' + resource.toString() + ' because revision was not resolved');
				}

				// Cache after resolving workspaceResourceInfoVars so that the (immutable)
				// Git commit ID is part of the cache key.
				const cacheKey = JSON.stringify(vars);
				if (this._contentCache[cacheKey]) {
					return TPromise.as(this._contentCache[cacheKey]);
				}

				return requestGraphQL<any>(this.remoteService, `query FileContentAndRev($repo: String, $rev: String, $path: String) {
						root {
							repository(uri: $repo) {
								commit(rev: $revision) {
									commit {
										file(path: $path) {
											content
										}
										sha1
									}
								}
							}
						}
					}`,
					{ repo: vars.repo, revision: vars.revision, path: vars.path },
				)
					.then(root => {
						if (!root || !root.repository || !root.repository.commit.commit) {
							throw new Error('commit information not available for ' + resource.toString());
						}
						if (!root.repository.commit.commit.file) {
							throw new Error('file not found: ' + resource.toString());
						}
						const content = root.repository.commit.commit.file.content;
						this._contentCache[cacheKey] = content;
						return content;
					});
			});
	}
}

/**
 * Returns useful pieces of information about a resource. The revision uses the SCM
 * provider's revision's ISCMRevision.id field, if available; see that field's
 * documentation for more information.
 */
export function workspaceResourceInfoVars(contextService: IWorkspaceContextService, scmService: ISCMService, info: IWorkspaceResourceInfo): TPromise<{ repo: string, revision?: string, path: string }> {
	const repo = info.workspace.authority + info.workspace.path;
	let revision: TPromise<ISCMRevision>;
	if (info.revisionSpecifier) {
		revision = TPromise.as({ rawSpecifier: info.revisionSpecifier, specifier: info.revisionSpecifier });
	} else if (info.workspace.toString() === contextService.getWorkspace().roots[0].toString()) {
		// For active workspace, take revision from SCM provider.
		const scmProvider = scmService.activeProvider;
		revision = scmProvider.ready().then(() => scmService.activeProvider.revision);
	} else {
		throw new Error('unable to determine SCM revision for ' + info.workspace.toString() + ' resource ' + info.relativePath);
	}
	return revision.then(revision => ({ repo, revision: revision ? (revision.id || revision.specifier) : undefined, path: info.relativePath }));
}

/**
 * workspaceFiles caches the contents of a directory. This helps us avoid
 * multiple round trips to fetch the contents of the same directory.
 */
const workspaceFiles = new Map<string, string[]>();

/**
 * Gets and caches a list of all the files underneath the given root. If not specified, or if
 * the root is the active workspace, the context service is consulted for additional workspace
 * params.
 */
export function fetchFilesAndDirs(contextService: IWorkspaceContextService, remoteService: IRemoteService, scmService: ISCMService, root?: IWorkspaceResourceInfo): TPromise<string[]> {
	if (!root && contextService.hasWorkspace()) {
		root = extractResourceInfo(contextService.getWorkspace().roots[0]);
	}

	if (!root) {
		return TPromise.as([]);
	}

	return workspaceResourceInfoVars(contextService, scmService, root).then(vars => {
		const key = JSON.stringify({ ...vars, path: undefined }); // value doesn't vary on path, so omit from key
		const cachedFilenames = workspaceFiles.get(key);
		if (cachedFilenames) {
			return TPromise.as(cachedFilenames);
		}

		if (!vars.revision) {
			return TPromise.wrapError(new Error('Repository or revision not found'));
		}

		return requestGraphQL<any>(remoteService, `query FileTree($repo: String!, $revision: String!) {
				root {
					repository(uri: $repo) {
						uri
						description
						defaultBranch
						commit(rev: $revision) {
							commit {
								tree(recursive: true) {
									files {
										name
									}
								}
							}
							cloneInProgress
						}
					}
				}
			}`,
			{ repo: vars.repo, revision: vars.revision },
		).then(root => {
			const filenames = root.repository!.commit.commit!.tree!.files.map(file => file.name);
			workspaceFiles.set(key, filenames);
			return filenames;
		});
	});
}

export function parseSourcegraphGitURI(uriStr: string): { repo: string, rev: string, path: string } {
	const uri = URI.parse(uriStr);
	if (uri.scheme !== 'git') {
		throw new Error('expected git scheme in URI ' + uri.toString());
	}
	return {
		repo: uri.authority + uri.path,
		rev: decodeURIComponent(uri.query),
		path: decodeURIComponent(uri.fragment),
	};
}

export function toBaseStat(resource: URI): IBaseStat {
	return {
		resource: resource,
		name: extractResourceInfo(resource).relativePath,
		mtime: 0,
		etag: resource.toString(),
	};
}

/**
* ICustomResolveFileOptions is based on the IResolveFileOptions in
* vs/platform/files/common/files. It is only used when calling
* toFileStat.
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
	 * Same as in vs/platform/files/common/files.
	 */
	resolveSingleChildDescendants?: boolean;

	/**
	 * Same as in vs/platform/files/common/files, except the array
	 * elements are file paths relative to the root passed to
	 * toFileStat, not absolute URIs. This is a performance
	 * optimization.
	 */
	resolveTo?: string[];
}

/**
 * Converts from IResolveFileOptions to our slightly custom and
 * optimized ICustomResolveFileOptions.
 */
function toICustomResolveFileOptions(parentPath?: string, options?: IResolveFileOptions): ICustomResolveFileOptions {
	return {
		parentPath,
		resolveSingleChildDescendants: options ? options.resolveSingleChildDescendants : undefined,
		resolveTo: options && options.resolveTo ? toRelativePaths(options.resolveTo) : undefined,
	};
}

function toRelativePaths(resources: URI[]): string[] {
	const relativePaths: string[] = [];
	resources.forEach(resource => {
		const info = extractResourceInfo(resource);
		if (info) {
			relativePaths.push(info.relativePath);
		}
	});
	return relativePaths;
}

/**
 * toFileStat returns a tree of IFileStat that represents a tree underneath
 * the given root URI.
 *
 * @param root The root URI of the file paths.
 * @param files A lexicographically sorted list of file paths in
 *              the workspace, relative to the root and
 *              without a leading '/'.
 */
export function toFileStat(root: URI, files: string[], options: ICustomResolveFileOptions, skipFiles: number = 0): IFileStat {
	const { parentPath, resolveSingleChildDescendants, resolveTo } = options;

	if (parentPath && startsWith(parentPath, '/')) {
		throw new Error('parentPath must not have a leading slash: ' + parentPath);
	}

	const resolveToPrefixes = Object.create(null);
	if (resolveTo) {
		resolveTo.forEach(path => {
			const parts = path.split('/');
			// The path might be a file or dir (or might not exist).
			for (let i = 1; i <= parts.length; i++) {
				const ancestor = parts.slice(0, i).join('/');
				resolveToPrefixes[ancestor] = true;
			}
		});
	}

	const rootResource: URI = parentPath ? root.with({ path: root.path + '/' + parentPath }) : root;

	const rootStat: IFileStat = {
		resource: rootResource,
		name: path.basename(rootResource.path),
		isDirectory: undefined,
		hasChildren: undefined,
		mtime: undefined,
		etag: undefined,
	};
	if (!parentPath) {
		// The root is assumed to be a directory that exists.
		rootStat.isDirectory = true;
	}

	let lastSubdir: string | undefined = undefined;
	let hasSeenParentPathPrefix = false;
	for (let i = skipFiles; i < files.length; i++) {
		const file = files[i];
		if (file === parentPath) {
			rootStat.isDirectory = false;
			rootStat.hasChildren = false;
			return rootStat;
		} else if (!parentPath || startsWith(file, parentPath + '/')) {
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
				rootStat.children.push({
					resource: root.with({ path: root.path + '/' + file }),
					name: path.basename(file),
					isDirectory: false,
					hasChildren: false,
					mtime: undefined,
					etag: undefined,
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
						(resolveSingleChildDescendants && (i === files.length - 1 || !startsWith(files[i + 1], parentPath ? (parentPath + '/' + subdir) : subdir)));
					if (recurse) {
						const recurseParentPath = parentPath ? (parentPath + '/' + subdir) : subdir;
						rootStat.children.push(toFileStat(root, files, {
							parentPath: recurseParentPath,
							resolveSingleChildDescendants,
							resolveTo,
						}, i));
					} else {
						rootStat.children.push({
							resource: rootResource.with({ path: rootResource.path + '/' + subdir }),
							name: subdir,
							isDirectory: true,
							hasChildren: true,
							mtime: undefined,
							etag: undefined,
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

	if (!rootStat.isDirectory) { throw new Error('not found: ' + rootResource.toString()); }
	if (!rootStat.children) {
		rootStat.hasChildren = false;
	}
	return rootStat;
}
