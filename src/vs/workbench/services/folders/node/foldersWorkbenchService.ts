/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import * as paths from 'vs/base/common/paths';
import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IMessageService, Severity, CloseAction } from 'vs/platform/message/common/message';
import URI from 'vs/base/common/uri';
import { IFolder, ISearchQuery, ISearchComplete, ISearchStats, IFoldersWorkbenchService, IFolderConfiguration, FoldersConfigurationKey } from 'vs/workbench/services/folders/common/folders';
import { IWorkspaceContextService, WorkbenchState, IWorkspaceFoldersChangeEvent, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IFolderCatalogService, ICatalogFolder, FolderGenericIconClass } from 'vs/platform/folders/common/folderCatalog';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { IConfigurationService, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { IResourceResolverService } from 'vs/platform/resourceResolver/common/resourceResolver';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
// tslint:disable-next-line:import-patterns
import { ITaskService } from 'vs/workbench/parts/tasks/common/taskService';
import { Action } from 'vs/base/common/actions';

class Folder implements IFolder {

	constructor(
		public resource: URI,
		public catalog: ICatalogFolder = null
	) { }

	get id(): string {
		return this.resource.toString();
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
		return this.resource.scheme === Schemas.file ? this.resource.fsPath : this.resource.authority + this.resource.path.replace(/\.(git|hg|svn)$/, '');
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

type ICacheEntry = {
	stale: boolean;
	result: TPromise<ISearchComplete> | ISearchComplete;
};

export class FoldersWorkbenchService implements IFoldersWorkbenchService {

	_serviceBrand: any;

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
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IFolderCatalogService private folderCatalogService: IFolderCatalogService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IResourceResolverService private resourceResolverService: IResourceResolverService,
		@IExtensionService private extensionService: IExtensionService,
		@ITaskService private taskService: ITaskService,
	) {
		this.registerListeners();
	}

	private registerListeners(): void {
		this.disposables.push(this.contextService.onDidChangeWorkspaceFolders(e => this.handleWorkspaceFoldersChanged(e)));
		if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
			this.handleWorkspaceFoldersChanged({
				added: this.contextService.getWorkspace().folders,
				removed: [],
				changed: [],
			});
		}
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
				results: results.map(result => new Folder(result.resource, result)),
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

	public async addFoldersAsWorkspaceRootFolders(anyFolders: (IFolder | URI)[]): TPromise<URI[]> {
		// Caution: The order of operations here is important and changes may cause subtle errors.
		// Any change to workspace configuration settings will cause the extension host
		// to be restarted and kill all outstanding extension requests. The addFolders
		// method may trigger workspace configuration changes that interfere with other actions
		// in the Promise chain. This is a subtle flaw in the extension API at the moment, so
		// we code defensively here by retrying on failure. The second time should succeed,
		// because no workspace folder configuration changes should occur.

		// Wait for all extensions to register resource resolvers.
		//
		// TODO(sqs): add resource resolver-specific activation events for extensions so that they
		// don't all need to be always (eagerly) activated (i.e., '*')
		await this.extensionService.onReady(); // extensions register resource resolvers
		await this.extensionService.activateByEvent('*');

		const unresolvedURIs = anyFolders.map(folder => folder instanceof URI ? folder : folder.resource);
		const uris = await Promise.all(unresolvedURIs.map(uri => this.resourceResolverService.resolveResource(uri)));
		try {
			return await this.addFoldersAsWorkspaceRootFoldersOnce(uris);
		} catch {/* Try again */ }
		await new Promise(resolve => setTimeout(resolve, 1000));
		return this.addFoldersAsWorkspaceRootFoldersOnce(uris);
	}

	private async addFoldersAsWorkspaceRootFoldersOnce(uris: URI[]): Promise<URI[]> {
		// Do not mess with order of operations unless you know what you are doing.
		// See caution in addFoldersAsWorkspaceRootFolders.
		await this.workspaceEditingService.addFolders(uris.map(uri => ({ uri })));
		await this.configurationService.reloadConfiguration();
		return uris;
	}

	private async handleWorkspaceFoldersChanged(e: IWorkspaceFoldersChangeEvent): Promise<void> {
		await Promise.all(e.added.map(f => this.promptForInitTask(f)));
		this._onChange.fire();
	}

	private async promptForInitTask(folder: IWorkspaceFolder): Promise<void> {
		// Adding a folder to a workspace can result in configuration changes that
		// cause the extension host to be restarted. This results in all outstanding
		// promises that communicate with the extension host to be killed / cancelled.
		// taskService communicates with the extension host, so there is a risk
		// that its promise is cancelled if the host restarts. We try prompting twice
		// to handle this case.
		// See the comment in addFoldersAsWorkspaceRootFolders for more context.
		try {
			return await this.doPromptForInitTask(folder);
		} catch { /* Try again after a second*/ }

		await new Promise(resolve => setTimeout(resolve, 1000));
		await this.doPromptForInitTask(folder);
	}

	private async doPromptForInitTask(folder: IWorkspaceFolder): Promise<void> {
		const initTask = await this.taskService.getTask(folder, 'init');

		if (!initTask) {
			return;
		}

		const neverPromptInit = this.configurationService.getValue<IFolderConfiguration>(FoldersConfigurationKey).neverPromptInit;
		if (neverPromptInit) {
			return;
		}

		const message = localize('folder.promptInit', "Enhance code intelligence by running the init task configured in {0}?", folder.name);
		this.messageService.show(Severity.Info, {
			message,
			actions: [
				new Action('folder.prompt.run.id', localize('folder.promptInit.run.label', "Run"), null, true, () => {
					return this.taskService.run(initTask);
				}),
				new Action('folder.prompt.never.id', localize('folder.promptInit.never.label', "Never"), null, true, () => {
					return this.configurationService.updateValue(`${FoldersConfigurationKey}.neverPromptInit`, true, ConfigurationTarget.USER);
				}),
				CloseAction,
			]
		});
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}