/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { FileService } from 'vs/workbench/services/files/electron-browser/fileService';
import { IContent, IStreamContent, IFileStat, IResolveContentOptions, IResolveFileOptions, IResolveFileResult, IUpdateContentOptions, FileChangesEvent, FileChangeType, IImportResult } from 'vs/platform/files/common/files';
import { TPromise } from "vs/base/common/winjs.base";
import Event from "vs/base/common/event";
import { EventEmitter } from "events";
import { basename } from "path";
import { IDisposable } from "vs/base/common/lifecycle";
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { Schemas } from 'vs/base/common/network';

// FileService constructor injected types
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IMessageService } from 'vs/platform/message/common/message';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService } from 'vs/platform/storage/common/storage';

export interface IRemoteFileSystemProvider {
	onDidChange: Event<URI>;
	resolveFile?(resource: URI, options?: IResolveRemoteFileOptions): TPromise<IFileStat>;
	resolve(resource: URI): TPromise<string>;
	update(resource: URI, content: string): TPromise<any>;
}

export interface IResolveRemoteFileOptions extends IResolveFileOptions {
	/**
	 * Return all descendants in a flat array in the FileStat's children property. This is
	 * an optimization for (1) file system providers where roundtrips are expensive and
	 * (2) to avoid needless tree construction for callers who just want a list.
	 */
	resolveAllDescendants?: boolean;
}

export class RemoteFileService extends FileService {

	private readonly _provider = new Map<string, IRemoteFileSystemProvider>();

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IEditorGroupService editorGroupService: IEditorGroupService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IMessageService messageService: IMessageService,
		@IStorageService storageService: IStorageService,
		@IExtensionService private extensionService: IExtensionService,
	) {
		super(
			configurationService,
			contextService,
			editorService,
			environmentService,
			editorGroupService,
			lifecycleService,
			messageService,
			storageService,
		);
	}

	registerProvider(scheme: string, provider: IRemoteFileSystemProvider): IDisposable {
		if (this._provider.has(scheme)) {
			throw new Error();
		}

		this._provider.set(scheme, provider);
		const reg = provider.onDidChange(e => {
			// forward change events
			this._onFileChanges.fire(new FileChangesEvent([{ resource: e, type: FileChangeType.UPDATED }]));
		});
		return {
			dispose: () => {
				this._provider.delete(scheme);
				reg.dispose();
			}
		};
	}

	private getProvider(scheme: string): TPromise<IRemoteFileSystemProvider | null> {
		if (!scheme || scheme === Schemas.file) {
			return TPromise.as(null);
		}

		if (this._provider.has(scheme)) {
			return TPromise.as(this._provider.get(scheme));
		}

		// Try to use remote file system from extension.
		return this.extensionService.onReady().then(() =>
			this.extensionService.activateByEvent(`resource:${scheme}`).then(() =>
				this._provider.get(scheme) || null
			)
		);
	}

	// --- resolve file

	resolveFile(resource: URI, options?: IResolveRemoteFileOptions): TPromise<IFileStat> {
		return this.getProvider(resource.scheme).then(provider => {
			if (provider) {
				return this._doResolveFile(provider, resource, options);
			}

			return super.resolveFile(resource, options);
		});
	}

	resolveFiles(toResolve: { resource: URI, options?: IResolveRemoteFileOptions }[]): TPromise<IResolveFileResult[]> {
		return TPromise.join(toResolve.map(({ resource }) => this.getProvider(resource.scheme))).then(providers => {
			if (providers.some(provider => !!provider)) {
				return TPromise.join(toResolve.map(resourceAndOptions => this.resolveFile(resourceAndOptions.resource, resourceAndOptions.options)
					.then(stat => ({ stat, success: true }), error => ({ stat: undefined, success: false }))));
			}

			return super.resolveFiles(toResolve);
		});
	}

	existsFile(resource: URI): TPromise<boolean> {
		return this.getProvider(resource.scheme).then(provider => {
			if (provider) {
				return this._doResolveFile(provider, resource).then(() => true, () => false);
			}

			return super.existsFile(resource);
		});
	}

	private _doResolveFile(provider: IRemoteFileSystemProvider, resource: URI, options?: IResolveRemoteFileOptions): TPromise<IFileStat> {
		if (!provider.resolveFile) {
			return TPromise.wrapError(new Error('not implemented: stat'));
		}

		return provider.resolveFile(resource, options).then(stat => {
			if (stat === null) {
				throw this.createNotFoundError(resource.toString());
			}
			return stat;
		});
	}

	isWritable(resource: URI): TPromise<boolean> {
		// Ideally this would not be synchronous (because it's called from places that
		// would benefit from it being sync), but it can't be because providers are
		// registered asynchronously by extensions. Once they're registered, this returns
		// extremely quickly because it does not need to perform any I/O to return the
		// answer.
		return this.getProvider(resource.scheme).then(provider => {
			if (provider) {
				// Assume all remote file system providers are read only.
				//
				// TODO(sqs): This is true for us currently but is not true in general.
				return false;
			}

			return true;
		});
	}

	// --- resolve content

	resolveContent(resource: URI, options?: IResolveContentOptions): TPromise<IContent> {
		return this.getProvider(resource.scheme).then(provider => {
			if (provider) {
				return this._doResolveContent(provider, resource);
			}

			return super.resolveContent(resource, options);
		});
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): TPromise<IStreamContent> {
		return this.getProvider(resource.scheme).then(provider => {
			if (provider) {
				return this._doResolveContent(provider, resource).then(RemoteFileService._asStreamContent);;
			}

			return super.resolveStreamContent(resource, options);
		});
	}

	resolveContents(resources: URI[]): TPromise<IContent[]> {
		return TPromise.join(resources.map(resource => this.getProvider(resource.scheme))).then(providers => {
			if (providers.some(provider => !!provider)) {
				return TPromise.join(resources.map(resource => this.resolveContent(resource)));
			}

			return super.resolveContents(resources);
		});
	}

	private _doResolveContent(provider: IRemoteFileSystemProvider, resource: URI): TPromise<IContent> {

		return provider.resolve(resource).then(
			value => ({ ...RemoteFileService._createFakeStat(resource), value }) as any,
		);
	}

	// --- saving

	updateContent(resource: URI, value: string, options?: IUpdateContentOptions): TPromise<IFileStat> {
		return this.getProvider(resource.scheme).then(provider => {
			if (provider) {
				return this._doUpdateContent(provider, resource, value).then(RemoteFileService._createFakeStat);
			}

			return super.updateContent(resource, value, options);
		});
	}

	private async _doUpdateContent(provider: IRemoteFileSystemProvider, resource: URI, content: string): TPromise<URI> {
		await provider.update(resource, content);
		return resource;
	}

	// --- operations

	// TODO(sqs): make these unimplemented methods consistent with the above (i.e., using
	// activationEvents instead of just checking for the provider synchronously).

	moveFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		if (this._provider.has(source.scheme) || this._provider.has(target.scheme)) {
			throw new Error(`not implemented: move ${source.toString()} -> ${target.toString()}`);
		}

		return super.moveFile(source, target, overwrite);
	}

	copyFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		if (this._provider.has(source.scheme) || this._provider.has(target.scheme)) {
			throw new Error(`not implemented: copy ${source.toString()} -> ${target.toString()}`);
		}

		return super.copyFile(source, target, overwrite);
	}

	createFile(resource: URI, content?: string): TPromise<IFileStat> {
		if (this._provider.has(resource.scheme)) {
			throw new Error(`not implemented: create ${resource.toString()}`);
		}

		return super.createFile(resource, content);
	}

	createFolder(resource: URI): TPromise<IFileStat> {
		if (this._provider.has(resource.scheme)) {
			throw new Error(`not implemented: create folder ${resource.toString()}`);
		}

		return super.createFolder(resource);
	}

	rename(resource: URI, newName: string): TPromise<IFileStat> {
		if (this._provider.has(resource.scheme)) {
			throw new Error(`not implemented: rename ${resource.toString()} -> $[newName}`);
		}

		return super.rename(resource, newName);
	}

	touchFile(resource: URI): TPromise<IFileStat> {
		if (this._provider.has(resource.scheme)) {
			throw new Error(`not implemented: touch file ${resource.toString()}`);
		}

		return super.touchFile(resource);
	}

	del(resource: URI, useTrash?: boolean): TPromise<void> {
		if (this._provider.has(resource.scheme)) {
			throw new Error(`not implemented: del ${resource.toString()}`);
		}

		return super.del(resource, useTrash);
	}

	importFile(source: URI, targetFolder: URI): TPromise<IImportResult> {
		if (this._provider.has(source.scheme)) {
			throw new Error(`not implemented: import file ${source.toString()} into ${targetFolder.toString()}`);
		}

		return super.importFile(source, targetFolder);
	}

	getEncoding(resource: URI, preferredEncoding?: string): string {
		if (this._provider.has(resource.scheme)) {
			throw new Error(`not implemented: get encoding for ${resource.toString()}`);
		}

		return super.getEncoding(resource, preferredEncoding);
	}

	// --- util

	private static _createFakeStat(resource: URI): IFileStat {

		return <IFileStat>{
			resource,
			name: basename(resource.path),
			encoding: 'utf8',
			mtime: Date.now(),
			etag: Date.now().toString(16),
			isDirectory: false,
			hasChildren: false
		};
	}

	private static _asStreamContent(content: IContent): IStreamContent {
		const emitter = new EventEmitter();
		const { value } = content;
		const result = <IStreamContent><any>content;
		result.value = emitter;
		setTimeout(() => {
			emitter.emit('data', value);
			emitter.emit('end');
		}, 0);
		return result;
	}

	/**
	 * Create an error that the workbench will treat as a 'not found' error and handle
	 * internally. If we just use normal Errors without these extra fields, the workbench
	 * will always display them to users even if the caller was just checking for
	 * existence (and the file not existing would not an error).
	 */
	private createNotFoundError(path: string): NodeJS.ErrnoException {
		const err: NodeJS.ErrnoException = new Error(`resource not found: ${path}`);
		err.code = 'ENOENT';
		err.errno = 34; // libuv ENOENT code
		err.path = path;
		return err;
	}
}
