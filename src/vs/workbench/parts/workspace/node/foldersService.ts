/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import * as paths from 'vs/base/common/paths';
import { Schemas } from 'vs/base/common/network';
import { assign } from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { PagedModel, IPagedModel } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';
import URI from 'vs/base/common/uri';
import { IFolder, WorkspaceFolderState, FolderOperation, IFolderCatalogService } from 'vs/workbench/parts/workspace/common/workspace';
import { ICatalogFolder } from 'vs/platform/workspace/common/folder';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceSearchService } from 'vs/platform/multiWorkspace/common/search';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IFolderContainmentService } from 'vs/platform/folder/common/folderContainment';
import { IFolderSearchService } from 'vs/platform/folders/common/folderSearch';

interface IWorkspaceFolderStateProvider {
	(folder: Folder): WorkspaceFolderState;
}

class Folder implements IFolder {

	constructor(
		private catalogService: IFolderCatalogService,
		private stateProvider: IWorkspaceFolderStateProvider,
		public uri: URI,
		public catalog: ICatalogFolder = null
	) { }

	get name(): string {
		if (this.catalog) {
			return this.catalog.name;
		}
		return this.uri.scheme === Schemas.file ? this.uri.fsPath : this.uri.authority + this.uri.path;
	}

	get displayName(): string {
		if (this.catalog) {
			return this.catalog.displayName || this.catalog.name;
		}

		return this.uri.scheme === Schemas.file ? paths.basename(this.uri.fsPath) : this.uri.path.slice(1); // omit leading '/'
	}

	get id(): string {
		return this.uri.toString();
	}

	get description(): string {
		if (this.catalog) {
			return this.catalog.description;
		}
		if (this.uri.scheme === Schemas.file) {
			return paths.dirname(this.uri.fsPath);
		}
		return undefined;
	}

	get iconUrl(): string {
		return this.catalogIconUrl || this.defaultIconUrl;
	}

	get iconUrlFallback(): string {
		return this.defaultIconUrl;
	}

	private get catalogIconUrl(): string {
		return this.catalog && this.catalog.iconUrl;
	}

	private get defaultIconUrl(): string {
		if (this.uri.scheme === Schemas.file) {
			return require.toUrl('../browser/media/defaultFolderIcon.svg');
		}
		return require.toUrl('../browser/media/defaultRepoIcon.svg');
	}

	get state(): WorkspaceFolderState {
		return this.stateProvider(this);
	}

	get starsCount(): number | undefined {
		return this.catalog ? this.catalog.starsCount : undefined;
	}

	get forksCount(): number | undefined {
		return this.catalog ? this.catalog.forksCount : undefined;
	}

	get language(): string | undefined {
		return this.catalog ? this.catalog.language : undefined;
	}

	get updatedAt(): Date | undefined {
		return this.catalog ? this.catalog.updatedAt : undefined;
	}

	get telemetryData(): any {
		return {
			hasCatalog: !!this.catalog,
			language: this.catalog && this.catalog.language,
			hasIcon: !!this.catalogIconUrl,
		};
	}
}

/**
 * An operation in progress on a folder.
 */
interface IActiveFolderOperation {
	operation: FolderOperation;

	/**
	 * The folder that this operation is affecting.
	 */
	folder: IFolder;

	start: Date;
}

function toTelemetryEventName(operation: FolderOperation) {
	switch (operation) {
		case FolderOperation.Adding: return 'folderCatalog:add';
		case FolderOperation.Removing: return 'folderCatalog:remove';
	}

	return '';
}

export class FolderCatalogService implements IFolderCatalogService {

	_serviceBrand: any;

	private adding: IActiveFolderOperation[] = [];
	private removing: IActiveFolderOperation[] = [];
	private stateProvider: IWorkspaceFolderStateProvider;
	private disposables: IDisposable[] = [];

	private _onChange: Emitter<void> = new Emitter<void>();
	get onChange(): Event<void> { return this._onChange.event; }

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkspaceSearchService private workspaceSearchService: IWorkspaceSearchService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFolderContainmentService private folderContainmentService: IFolderContainmentService,
		@IFolderSearchService private folderSearchService: IFolderSearchService,
	) {
		this.stateProvider = folder => this.getFolderState(folder);

		// Fire onChange even for folder operations that aren't monitored by
		// monitorFolderOperation.
		this.disposables.push(contextService.onDidChangeWorkspaceRoots(() => this._onChange.fire()));
	}

	public getCurrentWorkspaceFolders(): TPromise<IFolder[]> {
		const roots = (this.contextService.hasWorkspace() ? this.contextService.getWorkspace().roots : []);
		return TPromise.as(this.populateCatalogInfo(roots.map(root => new Folder(this, this.stateProvider, root))));
	}

	public search(query: string): TPromise<IPagedModel<IFolder>> {
		return this.folderSearchService.search(query).then(results => {
			return new PagedModel(results.map(result => {
				const match: ICatalogFolder = {
					displayName: result.path,
					name: result.name,
					isPrivate: result.icon === 'lock',
					fork: result.icon === 'repo-forked',
				} as any;
				return new Folder(this, this.stateProvider, result.resource, match);
			}));
		});
	}

	private populateCatalogInfo(folders: Folder[]): TPromise<IFolder[]> {
		// TODO(sqs): make this faster
		return TPromise.join(folders.map(folder => {
			return this.workspaceSearchService.getWorkspace(folder.uri)
				.then(match => {
					if (!folder.catalog && match) {
						folder.catalog = match;
					}
					return folder;
				});
		}));
	}

	public monitorFolderOperation(folder: IFolder, operation: FolderOperation, promise: TPromise<any>): void {
		this._onChange.fire();

		const op: IActiveFolderOperation = { operation, folder, start: new Date() };

		let onDone: (success: boolean) => void;
		switch (operation) {
			case FolderOperation.Adding:
				this.adding.push(op);
				onDone = (success: boolean) => {
					this.adding = this.adding.filter(e => e !== op);
					this._onChange.fire();
					this.reportTelemetry(op, success);
				};
				break;

			case FolderOperation.Removing:
				this.removing.push(op);
				onDone = (success: boolean) => {
					this.removing = this.removing.filter(e => e !== op);
					this._onChange.fire();
					this.reportTelemetry(op, success);
				};
				break;
		}

		promise.done(onDone, onDone);
	}

	private getFolderState(folder: Folder): WorkspaceFolderState {

		if (this.adding.some(op => op.folder.id === folder.id)) {
			return WorkspaceFolderState.Adding;
		}

		if (this.removing.some(op => op.folder.id === folder.id)) {
			return WorkspaceFolderState.Removing;
		}

		const currentWorkspaceFolders = this.contextService.hasWorkspace() ? this.contextService.getWorkspace().roots : [];
		const isActive = currentWorkspaceFolders.some(uri => uri.toString() === folder.uri.toString());
		return isActive ? WorkspaceFolderState.Active : WorkspaceFolderState.Inactive;
	}

	private reportTelemetry(active: IActiveFolderOperation, success: boolean): void {
		const data = active.folder.telemetryData;
		const duration = new Date().getTime() - active.start.getTime();
		const eventName = toTelemetryEventName(active.operation);

		this.telemetryService.publicLog(eventName, assign(data, { success, duration }));
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}