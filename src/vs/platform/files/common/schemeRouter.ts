/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IFileService, FileChangesEvent, IResolveFileOptions, IFileStat, IContent, IResolveContentOptions, IResolveFileResult, FileOperationEvent, IStreamContent, IUpdateContentOptions, IImportResult } from 'vs/platform/files/common/files';

/**
 * SchemeRouterFileService implements IFileService by mapping resource URI
 * schemes to different underlying IFileServices. For example, the 'file' scheme
 * can map to the builtin file service, and the 'https' scheme can map to an
 * IFileService that communicates with a remote server.
 */
export class SchemeRouterFileService implements IFileService {
	_serviceBrand: any;

	private schemes = new Map<string, IFileService>();
	private toDispose: IDisposable[] = [];

	private _onAfterOperation = new Emitter<FileOperationEvent>();
	onAfterOperation: Event<FileOperationEvent> = this._onAfterOperation.event;

	private _onFileChanges = new Emitter<FileChangesEvent>();
	onFileChanges: Event<FileChangesEvent> = this._onFileChanges.event;

	/**
	 * Use the provided fileService for handling all IFileService methods whose
	 * resource URI's scheme matches the given scheme.
	 */
	registerSchemeFileService(scheme: string, fileService: IFileService): void {
		if (this.schemes.has(scheme)) {
			throw new Error('scheme ' + scheme + ' already has a registered IFileService');
		}
		this.schemes.set(scheme, fileService);
		fileService.onAfterOperation(e => this._onAfterOperation.fire(e), null, this.toDispose);
		fileService.onFileChanges(e => this._onFileChanges.fire(e), null, this.toDispose);
	}

	getFileService(scheme: string): IFileService | undefined { return this.schemes.get(scheme); }

	private route(resource: URI): IFileService {
		const fileService = this.schemes.get(resource.scheme);
		if (!fileService) {
			throw new Error('unable to route: no file service registered for scheme of resource ' + resource.toString());
		}
		return fileService;
	}

	resolveFile(resource: URI, options?: IResolveFileOptions): TPromise<IFileStat> {
		return this.route(resource).resolveFile(resource, options);
	}

	resolveFiles(toResolve: { resource: URI, options?: IResolveFileOptions }[]): TPromise<IResolveFileResult[]> {
		return TPromise.join(toResolve.map(resourceAndOptions => this.resolveFile(resourceAndOptions.resource, resourceAndOptions.options)
			.then(stat => ({ stat, success: true }), error => ({ stat: undefined, success: false }))));
	}

	existsFile(resource: URI): TPromise<boolean> {
		return this.route(resource).existsFile(resource);
	}

	resolveContent(resource: URI, options?: IResolveContentOptions): TPromise<IContent> {
		return this.route(resource).resolveContent(resource, options);
	}

	resolveStreamContent(resource: URI, options?: IResolveContentOptions): TPromise<IStreamContent> {
		return this.route(resource).resolveStreamContent(resource, options);
	}

	resolveContents(resources: URI[]): TPromise<IContent[]> {
		return TPromise.join(resources.map(resource => this.resolveContent(resource)));
	}

	updateContent(resource: URI, value: string, options?: IUpdateContentOptions): TPromise<IFileStat> {
		return this.route(resource).updateContent(resource, value, options);
	}

	moveFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		return this.route(source).moveFile(source, target, overwrite);
	}

	copyFile(source: URI, target: URI, overwrite?: boolean): TPromise<IFileStat> {
		return this.route(source).copyFile(source, target, overwrite);
	}

	createFile(resource: URI, content?: string): TPromise<IFileStat> {
		return this.route(resource).createFile(resource, content);
	}

	createFolder(resource: URI): TPromise<IFileStat> {
		return this.route(resource).createFolder(resource);
	}


	rename(resource: URI, newName: string): TPromise<IFileStat> {
		return this.route(resource).rename(resource, newName);
	}

	touchFile(resource: URI): TPromise<IFileStat> {
		return this.route(resource).touchFile(resource);
	}

	del(resource: URI, useTrash?: boolean): TPromise<void> {
		return this.route(resource).del(resource, useTrash);
	}

	importFile(source: URI, targetFolder: URI): TPromise<IImportResult> {
		return this.route(source).importFile(source, targetFolder);
	}

	watchFileChanges(resource: URI): void {
		return this.route(resource).watchFileChanges(resource);
	}

	unwatchFileChanges(resource: URI): void;
	unwatchFileChanges(fsPath: string): void;
	unwatchFileChanges(arg: any): void {
		return this.route(typeof arg === 'string' ? URI.file(arg) : arg).unwatchFileChanges(arg);
	}

	updateOptions(options: any): void {
		throw new Error('not implemented: updateOptions');
		// TODO(sqs): send this to all IFileServices? if not, how do we know which one?
		//
		// return this.route(resource).updateOptions(options);
	}

	getEncoding(resource: URI, preferredEncoding?: string): string {
		return this.route(resource).getEncoding(resource, preferredEncoding);
	}

	dispose(): void {
		// We do not own the IFileServices registered with us, so don't dispose them.
		this.toDispose = dispose(this.toDispose);
	}
}