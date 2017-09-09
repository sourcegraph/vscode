/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { Emitter, filterEvent, toPromise } from 'vs/base/common/event';
import * as paths from 'vs/base/common/paths';
import * as arrays from 'vs/base/common/arrays';
import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { assign } from 'vs/base/common/objects';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose, combinedDisposable } from 'vs/base/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IMessageService } from 'vs/platform/message/common/message';
import URI from 'vs/base/common/uri';
import { IFolder, ISearchQuery, ISearchComplete, ISearchStats, WorkspaceFolderState, FolderOperation, IFoldersWorkbenchService } from 'vs/workbench/services/folders/common/folders';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IFolderCatalogService, ICatalogFolder, FolderGenericIconClass } from 'vs/platform/folders/common/folderCatalog';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { IProgressService2, IProgressOptions, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

interface IWorkspaceFolderStateProvider {
	(folder: Folder): WorkspaceFolderState;
}

class Folder implements IFolder {

	constructor(
		private catalogService: IFoldersWorkbenchService,
		private stateProvider: IWorkspaceFolderStateProvider,
		public resource: URI,
		public catalog: ICatalogFolder = null
	) { }

	get id(): string {
		return this.resource.toString();
	}

	get state(): WorkspaceFolderState {
		return this.stateProvider(this);
	}

	get telemetryData(): any {
		return {
			hasCatalog: !!this.catalog,
			primaryLanguage: this.catalog ? this.catalog.primaryLanguage : undefined,
			hasIconImage: !!(this.catalog && this.catalog.iconUrl),
			isPrivate: this.catalog ? this.catalog.isPrivate : undefined,
		};
	}

	get displayPath(): string {
		if (this.catalog) {
			return this.catalog.displayPath;
		}
		return this.resource.scheme === Schemas.file ? this.resource.fsPath : this.resource.authority + this.resource.path;
	}

	get displayName(): string {
		if (this.catalog) {
			return this.catalog.displayName;
		}
		return this.resource.scheme === Schemas.file ? paths.basename(this.resource.fsPath) : this.resource.path.slice(1); // omit leading '/'
	}

	get iconUrl(): string {
		return this.catalog ? this.catalog.iconUrl : undefined;
	}

	get genericIconClass(): FolderGenericIconClass {
		if (this.catalog && this.catalog.genericIconClass) {
			return this.catalog.genericIconClass;
		}
		if (this.resource.scheme === Schemas.file) {
			return 'file-directory';
		}
		if (this.catalog) {
			if (this.catalog.isPrivate) {
				return 'lock';
			} else if (this.catalog.isFork) {
				return 'repo-forked';
			} else if (this.catalog.isMirror) {
				return 'mirror';
			}
		}
		return 'repo';
	}

	get cloneUrl(): URI | undefined {
		return this.catalog ? this.catalog.cloneUrl : this.resource;
	}

	get description(): string | undefined {
		return this.catalog ? this.catalog.description : undefined;
	}

	get isPrivate(): boolean | undefined {
		return this.catalog ? this.catalog.isPrivate : undefined;
	}

	get isFork(): boolean | undefined {
		return this.catalog ? this.catalog.isFork : undefined;
	}

	get isMirror(): boolean | undefined {
		return this.catalog ? this.catalog.isMirror : undefined;
	}

	get starsCount(): number | undefined {
		return this.catalog ? this.catalog.starsCount : undefined;
	}

	get forksCount(): number | undefined {
		return this.catalog ? this.catalog.forksCount : undefined;
	}

	get watchersCount(): number | undefined {
		return this.catalog ? this.catalog.watchersCount : undefined;
	}

	get primaryLanguage(): string | undefined {
		return this.catalog ? this.catalog.primaryLanguage : undefined;
	}

	get createdAt(): Date | undefined {
		return this.catalog ? this.catalog.createdAt : undefined;
	}

	get updatedAt(): Date | undefined {
		return this.catalog ? this.catalog.updatedAt : undefined;
	}

	get pushedAt(): Date | undefined {
		return this.catalog ? this.catalog.pushedAt : undefined;
	}

	get viewerHasStarred(): boolean | undefined {
		return this.catalog ? this.catalog.viewerHasStarred : undefined;
	}

	get viewerCanAdminister(): boolean | undefined {
		return this.catalog ? this.catalog.viewerCanAdminister : undefined;
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

type ICacheEntry = {
	stale: boolean;
	result: TPromise<ISearchComplete> | ISearchComplete;
};

export class FoldersWorkbenchService implements IFoldersWorkbenchService {

	_serviceBrand: any;

	private adding: IActiveFolderOperation[] = [];
	private removing: IActiveFolderOperation[] = [];
	private stateProvider: IWorkspaceFolderStateProvider;
	private disposables: IDisposable[] = [];

	private _onChange: Emitter<void> = new Emitter<void>();
	get onChange(): Event<void> { return this._onChange.event; }

	/**
	 * Multi-level cache. The first key is ISearchQuery.cacheKey, which is the key to the
	 * cache. Within a cache, the key is a serialized and canonicalized representation of
	 * each query (createQueryCacheKey).
	 */
	private caches = new Map<string, Map<string, ICacheEntry>>();

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IFolderCatalogService private folderCatalogService: IFolderCatalogService,
		@ISCMService private scmService: ISCMService,
		@IProgressService2 private progressService: IProgressService2,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
		this.stateProvider = folder => this.getFolderState(folder);

		this.registerListeners();
	}

	private registerListeners(): void {
		// Fire onChange even for folder operations that aren't monitored by
		// monitorFolderOperation.
		this.disposables.push(this.contextService.onDidChangeWorkspaceRoots(() => this._onChange.fire()));
		this.disposables.push(this.scmService.onDidAddRepository(repository => this.onDidAddRepository(repository)));
		this.disposables.push(this.scmService.onDidChangeRepository(() => this._onChange.fire()));
		for (const repository of this.scmService.repositories) {
			this.onDidAddRepository(repository);
		}
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		this._onChange.fire();

		const changeDisposable = repository.provider.onDidChange(() => {
			this._onChange.fire();
		});

		const onDidRemove = filterEvent(this.scmService.onDidRemoveRepository, e => e === repository);
		const removeDisposable = onDidRemove(() => {
			disposable.dispose();
			this.disposables = this.disposables.filter(d => d !== removeDisposable);
		});

		const disposable = combinedDisposable([changeDisposable, removeDisposable]);
		this.disposables.push(disposable);
	}

	public getCurrentWorkspaceFolders(): TPromise<IFolder[]> {
		const roots = (this.contextService.hasWorkspace() ? this.contextService.getWorkspace().roots : []);
		return TPromise.as(this.populateCatalogInfo(roots.map(root => new Folder(this, this.stateProvider, root))));
	}

	/**
	 * Normalize the query object.
	 */
	private extendQuery(query: ISearchQuery): ISearchQuery {
		query = { ...query };

		if (!query.maxResults) {
			delete query.maxResults;
		}

		if (!query.value) {
			delete query.value;
		}

		return query;
	}

	public search(query: ISearchQuery): TPromise<ISearchComplete> {
		query = this.extendQuery(query);

		const cachedValue = this.getFromCache(query);

		// Optimistically use stale cached data, but trigger a refresh.
		if (!cachedValue || cachedValue.stale) {
			const result = this.doSearch(query);

			if (cachedValue) {
				// Mark cached value as non-stale so other callers don't also try to refresh it.
				this.storeInCache(query, { ...cachedValue, stale: false });
			} else {
				this.storeInCache(query, { result, stale: false });
			}

			result.done(
				complete => {
					// Store resolved value in cache so that we can persist it more easily if
					// desired.
					this.storeInCache(query, { result: complete, stale: false });
				},
				err => {
					// Don't store canceled or rejected result promises.
					this.storeInCache(query, null);
				});
			if (!cachedValue) {
				return result;
			}
		}
		return TPromise.as(cachedValue.result) as TPromise<ISearchComplete>;
	}

	private doSearch(query: ISearchQuery): TPromise<ISearchComplete> {
		return this.folderCatalogService.search(query.value).then(results => {
			return {
				results: results.map(result => new Folder(this, this.stateProvider, result.resource, result)),
				stats: {} as ISearchStats,
			};
		});
	}

	public isSearchCached(query: ISearchQuery): boolean {
		query = this.extendQuery(query);
		return Boolean(this.getFromCache(query));
	}

	private getFromCache(query: ISearchQuery): ICacheEntry | undefined {
		const cache = this.caches.get(query.cacheKey);
		return cache && cache.get(this.createQueryCacheKey(query));
	}

	private storeInCache(query: ISearchQuery, entry: ICacheEntry): void {
		let cache = this.caches.get(query.cacheKey);
		if (!cache) {
			cache = new Map<string, ICacheEntry>();
			this.caches.set(query.cacheKey, cache);
		}
		cache.set(this.createQueryCacheKey(query), entry);
	}

	/**
	 * Serialize and canonicalize a query to create the query cache key. Note that this is
	 * distinct from ISearchQuery.cacheKey. That identifies a cache namespace, which
	 * contains many entries keyed on the query cache key produced by this method.
	 */
	private createQueryCacheKey(query: ISearchQuery): string {
		query = { ...query }; // copy

		// We are already bucketing on this value; no need to include it in the 2nd-level
		// cache key.
		delete query.cacheKey;

		return JSON.stringify(query);
	}

	public clearSearchCache(cacheKey: string): TPromise<void> {
		this.caches.delete(cacheKey);
		return TPromise.as(void 0);
	}

	private populateCatalogInfo(folders: Folder[]): TPromise<IFolder[]> {
		return TPromise.join(folders.filter(folder => !folder.catalog).map(folder => {
			return this.folderCatalogService.resolveFolder(folder.resource)
				.then(result => {
					if (!folder.catalog && result) {
						folder.catalog = result;
					}
					return folder;
				}, err => {
					if (folder.resource.scheme === Schemas.file) {
						return folder;
					}
					throw err;
				});
		}));
	}

	public addFoldersAsWorkspaceRootFolders(anyFolders: (IFolder | URI)[]): TPromise<URI[]> {
		const folders = anyFolders.map(folder => folder instanceof URI ? new Folder(this, this.stateProvider, folder) : folder);

		const allPromise = this.workspaceEditingService.addRoots(folders.map(folder => folder instanceof URI ? folder : folder.resource))
			.then(() => this.configurationService.reloadConfiguration());

		return TPromise.join(folders.map(folder => {
			let folderPromise: TPromise<void>;
			if (this.getWorkspaceFolderForCatalogFolder(folder)) {
				// Folder is already added and ready.
				folderPromise = TPromise.as(void 0);
			} else {
				folderPromise = allPromise.then(() => {
					// Wait for each folder's SCM provider to be ready.
					return toPromise(filterEvent(this.onChange, () => !!this.getWorkspaceFolderForCatalogFolder(folder)));
				});
			}

			// Monitor the progress of the entire operation (addRoots, reloadConfiguration, and SCM ready).
			this.monitorFolderOperation(folder, FolderOperation.Adding, folderPromise);

			return folderPromise.then(() => this.getWorkspaceFolderForCatalogFolder(folder));
		}));
	}

	public removeFoldersAsWorkspaceRootFolders(folders: IFolder[]): TPromise<void> {
		const rootsToRemove = arrays.coalesce(folders.map(folder => this.getWorkspaceFolderForCatalogFolder(folder)));

		const promise = this.workspaceEditingService.removeRoots(rootsToRemove)
			.then<void>(() => this.configurationService.reloadConfiguration());
		for (const folder of folders) {
			this.monitorFolderOperation(folder, FolderOperation.Removing, promise);
		}

		return promise;
	}

	private monitorFolderOperation(folder: IFolder, operation: FolderOperation, promise: TPromise<any>): void {
		const op: IActiveFolderOperation = { operation, folder, start: new Date() };

		let onDone: (success: boolean) => void;
		switch (operation) {
			case FolderOperation.Adding:
				// Show progress while adding because it can take a while.
				let options: IProgressOptions = {
					location: ProgressLocation.Window,
					title: localize('addingFolder', "Adding {0}...", folder.displayPath),
				};
				this.progressService.withProgress(options, () => promise);

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

		this._onChange.fire();
		promise.done(onDone, onDone);
	}

	public getWorkspaceFolderForCatalogFolder(catalogFolder: IFolder): URI | undefined {
		if (catalogFolder.resource.scheme === Schemas.file) {
			return catalogFolder.resource;
		}

		if (!this.contextService.hasWorkspace()) {
			return undefined;
		}

		for (const root of this.contextService.getWorkspace().roots) {
			const repository = this.scmService.getRepositoryForResource(root);
			if (repository && repository.provider && repository.provider.remoteResources) {
				for (const remoteResource of repository.provider.remoteResources) {
					if (catalogFolder.resource.toString() === remoteResource.toString() ||
						remoteResourcesProbablyEquivalent(catalogFolder.cloneUrl, remoteResource)) {
						return root;
					}
				}
			}
		}

		return undefined;
	}

	private getFolderState(folder: Folder): WorkspaceFolderState {
		if (this.adding.some(op => op.folder.id === folder.id)) {
			return WorkspaceFolderState.Adding;
		}

		if (this.removing.some(op => op.folder.id === folder.id)) {
			return WorkspaceFolderState.Removing;
		}

		const isActive = !!this.getWorkspaceFolderForCatalogFolder(folder);
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

/**
 * Match two resources that probably represent the same repository clone URL. For example,
 * git://github.com/gorilla/mux and ssh://git@github.com/gorilla/mux.git are "probably equivalent".
 */
function remoteResourcesProbablyEquivalent(a: URI, b: URI): boolean {
	const stripUserinfo = (authority: string): string => {
		const idx = authority.indexOf('@');
		if (idx === -1) {
			return authority;
		}
		return authority.slice(idx + 1);
	};

	const stripVCSPathSuffix = (path: string): string => {
		return path.replace(/\.(git|hg|svn)$/i, '');
	};

	return stripUserinfo(a.authority).toLowerCase() === stripUserinfo(b.authority).toLowerCase() &&
		stripVCSPathSuffix(a.path).toLowerCase() === stripVCSPathSuffix(b.path).toLowerCase();
}