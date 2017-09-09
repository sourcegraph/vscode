/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise, PPromise } from 'vs/base/common/winjs.base';
import errors = require('vs/base/common/errors');
import nls = require('vs/nls');
import * as objects from 'vs/base/common/objects';
import * as strings from 'vs/base/common/strings';
import * as arrays from 'vs/base/common/arrays';
import { compareByScore, IScorableResourceAccessor } from 'vs/base/common/comparers';
import { defaultGenerator } from 'vs/base/common/idGenerator';
import URI from 'vs/base/common/uri';
import { IIconLabelOptions } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { IWorkbenchThemeService } from 'vs/workbench/services/themes/common/workbenchThemeService';
import { Mode, IEntryRunContext, IAutoFocus } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenEntry, QuickOpenModel, QuickOpenEntryGroup } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ThrottledDelayer } from 'vs/base/common/async';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { KeyMod } from 'vs/base/common/keyCodes';
import { IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IResourceResolverService } from 'vs/platform/resourceResolver/common/resourceResolver';
import { IFolder, IFoldersWorkbenchService, ISearchStats, ISearchQuery } from 'vs/workbench/services/folders/common/folders';
import { IProgressService2, ProgressLocation } from 'vs/platform/progress/common/progress';
import { AddAndExploreWorkspaceFolderAction } from 'vs/workbench/parts/workspace/browser/folderActions';

/**
* The quick open model representing folder results from a single handler.
*/
export class FolderQuickOpenModel extends QuickOpenModel {
	constructor(
		entries: QuickOpenEntry[],
		public readonly handler: QuickOpenHandler,
		private groupLabel?: string,
		public stats?: ISearchStats,
	) {
		super(entries);
	}

	public createGroup(entry: FolderEntry): FolderEntryGroup {
		return new FolderEntryGroup(entry, this.groupLabel, true);
	}
}

/**
 * The quick open model representing multiple (merged) handler results.
 */
export class MergedFolderQuickOpenModel extends QuickOpenModel {

	constructor(searchValueIsEmpty: boolean) {
		super();

		if (searchValueIsEmpty) {
			// Show OpenFolderHandler first because its empty state informs the user
			// that they can type to search, and that's useful for the user to see.
			this.pendingHandlers = [
				{ type: OpenFolderHandler },
				{ type: OpenRecentFolderHandler },
			];
		} else {
			this.pendingHandlers = [
				{ type: OpenRecentFolderHandler },
				{ type: OpenFolderHandler },
			];
		}
	}

	/**
	 * The order in which to display result groups. The pendingEntries field contains entries
	 * that were received for the handler (in addEntries) but that should not be displayed yet
	 * because the preceding handler's entries have not yet been displayed.
	 */
	private pendingHandlers: { type: any, entries?: QuickOpenEntry[] }[];

	/**
	 * Adds the quick open entries to the model, ensuring the correct order of the groups
	 * to avoid UI jitter.
	 */
	public addEntries(entries: QuickOpenEntry[], handler?: QuickOpenHandler): void {
		if (handler instanceof this.pendingHandlers[0].type) {
			// Omit any entries that represent the same resource as an already added entry, to avoid
			// duplicates.
			this.filterDuplicateEntries(entries);

			// This handler is the next one that is allowed to display entries. Add its entries.
			super.addEntries(entries);

			this.pendingHandlers.shift(); // the 0'th element's pendingEntries can't have been set

			// Add the pending entries of the handlers that follow, until we hit the next
			// handler whose entries haven't been added yet.
			while (this.pendingHandlers.length) {
				const { entries } = this.pendingHandlers[0];
				if (entries === undefined) {
					break; // stop adding further entries until this handler's entries are received
				}
				this.filterDuplicateEntries(entries);
				super.addEntries(entries);
				this.pendingHandlers.shift();
			}
		} else {
			// Mark these entries as pending until the preceding handlers' entries have
			// been added, to avoid UI jitter.
			let found = false;
			for (let i = 0; i < this.pendingHandlers.length; i++) {
				if (handler instanceof this.pendingHandlers[i].type) {
					this.pendingHandlers[i].entries = entries;
					found = true;
					break;
				}
			}
			if (!found) {
				throw new Error(`not in pendingHandlers: ${handler.constructor.toString()}`);
			}
		}
	}

	private addedEntryResources: { [resource: string]: boolean } = Object.create(null);

	private filterDuplicateEntries(entries: QuickOpenEntry[]): void {
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			const resource = entry.getResource();
			if (!resource) { continue; }
			if (this.addedEntryResources[resource.toString()]) {
				// Remove this duplicate entry.
				entries.splice(i, 1);

				if (entry instanceof QuickOpenEntryGroup && entries[i]) {
					// If the entry was wrapped in a group, then apply the group to the next
					// entry (so that the group label still gets displayed).
					entries[i] = new QuickOpenEntryGroup(entries[i], entry.getGroupLabel(), entry.showBorder());
				}

				i--; // compensate for splice
			} else {
				// Add our entries' resources so that subsequent handlers don't add duplicates of our entries.
				this.addedEntryResources[resource.toString()] = true;
			}
		}
	}
}

/**
 * A quick open group (of folders) in a MergedFolderQuickOpenModel.
 */
export class FolderEntryGroup extends QuickOpenEntryGroup {
	// Marker class
}

/**
 * A quick open entry representing a folder from a folder catalog.
 */
export class FolderEntry extends QuickOpenEntry {

	private label: string;

	constructor(
		private folder: IFolder,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkspacesService private workspacesService: IWorkspacesService,
		@IResourceResolverService private resourceResolverService: IResourceResolverService,
		@IWindowsService private windowsService: IWindowsService,
		@IProgressService2 private progressService: IProgressService2,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super();
		this.label = folder.displayPath;
	}

	public getLabel(): string {
		return this.label;
	}

	public getLabelOptions(): IIconLabelOptions {
		return {};
	}

	public getAriaLabel(): string {
		return nls.localize('entryAriaLabel', "{0}, folder picker", this.getLabel());
	}

	public getDescription(): string {
		return this.folder.description;
	}

	public getIcon(): string {
		return `octicon octicon-${this.folder.genericIconClass}`;
	}

	public getResource(): URI {
		return this.folder.resource;
	}

	public isFile(): boolean {
		return false;
	}

	// Override to add this folder as a workspace root (instead of just opening a new editor).
	public run(mode: Mode, context: IEntryRunContext): boolean {
		// Ctrl+Enter opens in background.
		if (context && context.keymods.indexOf(KeyMod.CtrlCmd) >= 0) {
			mode = Mode.OPEN_IN_BACKGROUND;
		}

		const hideWidget = (mode === Mode.OPEN);

		if (mode === Mode.OPEN) {
			if (!this.contextService.hasMultiFolderWorkspace()) {
				// Upgrade workspace to multi-root workspace.
				const p = this.resourceResolverService.resolveResource(this.folder.resource)
					.then(resolvedResource => this.workspacesService.createWorkspace([resolvedResource.toString()]))
					.then(({ configPath }) => this.windowsService.openWindow([configPath]));
				p.done(null, errors.onUnexpectedError);
				this.progressService.withProgress({
					location: ProgressLocation.Window,
					title: nls.localize('fetchingFolder', "Fetching {0}...", this.folder.displayPath),
				}, () => p);
				return true;
			}


			// Add folder as a root folder in the workspace.
			const addAndExploreAction = this.instantiationService.createInstance(AddAndExploreWorkspaceFolderAction);
			addAndExploreAction.folder = this.folder;
			addAndExploreAction.run().done(null, errors.onUnexpectedError);
		} else if (mode === Mode.OPEN_IN_BACKGROUND) {
			// Opens a window for this workspace.
			const p = this.resourceResolverService.resolveResource(this.folder.resource)
				.then(resolvedResource => this.windowsService.openWindow([resolvedResource.toString()]));
			p.done(null, errors.onUnexpectedError);
			this.progressService.withProgress({
				location: ProgressLocation.Window,
				title: nls.localize('fetchingFolder', "Fetching {0}...", this.folder.displayPath),
			}, () => p);
		}

		return hideWidget;
	}
}

class PlaceholderQuickOpenEntry extends QuickOpenEntryGroup {
	private placeHolderLabel: string;

	constructor(placeHolderLabel: string) {
		super();

		this.placeHolderLabel = placeHolderLabel;
	}

	public getLabel(): string {
		return this.placeHolderLabel;
	}
}

export type FolderEntryOrGroup = FolderEntry | FolderEntryGroup;

/**
* Quick open handler that combines results from folder catalogs and recent folders.
*/
export class OpenAnyFolderHandler extends QuickOpenHandler {

	private static MAX_DISPLAYED_RESULTS = 150;

	private static LOG_VERBOSE = false;

	private pendingSearch: TPromise<QuickOpenModel> | undefined;

	private openFolderHandler: OpenFolderHandler;
	private openRecentFolderHandler: OpenRecentFolderHandler;
	private isClosed: boolean;
	private scorerCache: { [key: string]: number };

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IFoldersWorkbenchService private foldersWorkbenchService: IFoldersWorkbenchService,
		@IMessageService private messageService: IMessageService
	) {
		super();

		this.scorerCache = Object.create(null);

		this.openFolderHandler = instantiationService.createInstance(OpenFolderHandler);
		this.openRecentFolderHandler = instantiationService.createInstance(OpenRecentFolderHandler);

		this.updateHandlers();
	}

	public setOptions(options: { forceUseIcons: boolean }): void { }

	private updateHandlers(): void {
		const options: IOpenWorkspaceOptions = {
			skipSorting: true,
			skipHighlighting: true,
		};

		this.openFolderHandler.setOptions(options);
		this.openRecentFolderHandler.setOptions(options);
	}

	private getHandlerResults(handler: QuickOpenHandler, searchValue: string): TPromise<FolderQuickOpenModel> {
		if (handler.canRun() !== true) {
			return TPromise.as(new FolderQuickOpenModel([], handler));
		}

		return handler.getResults(searchValue).then((model: FolderQuickOpenModel) => {
			if (model && !model.entries.length) {
				const emptyEntry = new PlaceholderQuickOpenEntry(handler.getEmptyLabel(searchValue));
				if (model.handler instanceof OpenRecentFolderHandler) {
					// We don't actually want to show this entry, but we do want its
					// addition to trigger a refresh (so that when the recent
					// folders are no longer matched, they disappear immediately).
					emptyEntry.setHidden(true);
				}
				model.setEntries([emptyEntry]);
			}
			return model;
		});
	}

	public getResults(searchValue: string, maxSortedResults?: number): PPromise<QuickOpenModel, QuickOpenModel> {
		const startTime = Date.now();

		this.cancelPendingSearch();
		this.isClosed = false;

		const promiseFactory = () => {
			const resultPromises: TPromise<FolderQuickOpenModel>[] = [];

			resultPromises.push(this.getHandlerResults(this.openFolderHandler, searchValue));
			resultPromises.push(this.getHandlerResults(this.openRecentFolderHandler, searchValue));

			// Reuse model so that the quick open controller merges the results from the
			// individual handlers.
			const model = new MergedFolderQuickOpenModel(!searchValue.trim());

			const handleResult = (result: FolderQuickOpenModel) => {
				this.pendingSearch = undefined;

				// If the quick open widget has been closed meanwhile, ignore the result
				if (this.isClosed) {
					return new QuickOpenModel();
				}

				const entries = result.entries as FolderEntry[];

				// Sort
				const unsortedResultTime = Date.now();
				const normalizedSearchValue = strings.stripWildcards(searchValue).toLowerCase();
				const viewResults: FolderEntryOrGroup[] = arrays.top(
					entries,
					this.createComparer(searchValue, normalizedSearchValue),
					OpenAnyFolderHandler.MAX_DISPLAYED_RESULTS,
				);
				const sortedResultTime = Date.now();

				// Highlight
				const unhighlightedResultTime = Date.now();
				viewResults.forEach(entry => {
					const { labelHighlights, descriptionHighlights } = QuickOpenEntry.highlight(entry, searchValue, true /* fuzzy highlight */);
					entry.setHighlights(labelHighlights, descriptionHighlights);
				});
				const highlightedResultTime = Date.now();

				const duration = Date.now() - startTime;
				const handlerName = (result.handler.constructor as any).name;
				if (OpenAnyFolderHandler.LOG_VERBOSE) {
					console.log(`OpenAnyWorkspaceHandler[${handlerName}]: ${entries.length} results for ${JSON.stringify(searchValue)} in ${duration}ms (sorting ${sortedResultTime - unsortedResultTime}ms, highlighting ${highlightedResultTime - unhighlightedResultTime}ms)`);
				}

				// Group
				if (viewResults.length) {
					viewResults[0] = result.createGroup(viewResults[0] as FolderEntry);
				}

				model.addEntries(viewResults, result.handler);
				return model;
			};

			this.pendingSearch = new PPromise<QuickOpenModel, QuickOpenModel>((complete, error, progress) => {
				// When any of the result promises return, forward the result as progress.
				const processed = resultPromises.map(resultPromise =>
					resultPromise.then(result => {
						if (result) {
							progress(handleResult(result));
						}
					})
				);
				// Complete the promise when all promises have completed.
				TPromise.join(processed).then(() => {
					// We already sent the results via progress.
					complete(model);
				}, error => {
					this.pendingSearch = null;
					this.messageService.show(Severity.Error, error);
				});
			}, () => {
				resultPromises.forEach(p => p.cancel());
			});

			return this.pendingSearch;
		};

		return promiseFactory();
	}

	/**
	 * Create a function to compare two FolderEntry instances, weighting matches on the
	 * final workspace path component more highly.
	 */
	private createComparer(searchValue: string, normalizedSearchValue: string): (elementA: FolderEntry, elementB: FolderEntry) => number {
		return (a: FolderEntry, b: FolderEntry) => {
			return compareByScore<FolderEntry>(a, b, OpenAnyFolderHandler.FolderEntryAccessor, searchValue, normalizedSearchValue, this.scorerCache);
		};
	}

	private static FolderEntryAccessor: IScorableResourceAccessor<FolderEntry> = {
		getLabel(entry: FolderEntry): string {
			// Only return the final path component, so that it's weighted more heavily in
			// scoring.
			return entry.getLabel();
		},

		getResourcePath(entry: FolderEntry): string {
			const resource = entry.getResource();
			return resource.authority + resource.path;
		},
	};

	public getGroupLabel(): string {
		return nls.localize('folderSearchResults', "folder results");
	}

	public getEmptyLabel(searchString: string): string {
		return this.openFolderHandler.getEmptyLabel(searchString);
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue.trim(),
		};
	}

	public onOpen(): void {
		this.openFolderHandler.onOpen();
		this.openRecentFolderHandler.onOpen();
	}

	public onClose(canceled: boolean): void {
		this.isClosed = true;

		// Cancel any pending search
		this.cancelPendingSearch();

		// Clear Cache
		this.scorerCache = Object.create(null);

		// Propagate
		this.openFolderHandler.onClose(canceled);
		this.openRecentFolderHandler.onClose(canceled);
	}

	private cancelPendingSearch(): void {
		if (this.pendingSearch) {
			this.pendingSearch.cancel();
			this.pendingSearch = null;
		}
	}
}

/**
 * Configuration options for workspace quick open handlers.
 */
export interface IOpenWorkspaceOptions {
	skipSorting?: boolean;
	skipHighlighting?: boolean;
}

/**
 * The abstract base class for quick open handlers that send a query to the search service
 * and return workspace results.
 */
export abstract class AbstractOpenFolderHandler extends QuickOpenHandler {

	protected options: IOpenWorkspaceOptions;
	protected cacheState: CacheState;

	private pendingSearch: TPromise<FolderQuickOpenModel> | undefined;
	private searchDelayer: ThrottledDelayer<QuickOpenModel | void>;

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchThemeService private themeService: IWorkbenchThemeService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IFoldersWorkbenchService private foldersWorkbenchService: IFoldersWorkbenchService,
		@IMessageService private messageService: IMessageService,
	) {
		super();

		this.searchDelayer = new ThrottledDelayer<QuickOpenModel>(0);

		this.options = {};
	}

	public setOptions(options: IOpenWorkspaceOptions) {
		this.options = options;
	}

	/**
	 * Override to use a custom delay between user input and triggering a search in the
	 * backend.
	 */
	protected getDelayForSearchValue(searchValue: string): number {
		return 0;
	}

	/**
	 * Sets query fields on the query to be sent to the search service.
	 */
	protected abstract extendQuery(query: ISearchQuery, searchValue?: string): void;

	public getResults(searchValue: string, maxSortedResults?: number): PPromise<FolderQuickOpenModel, FolderQuickOpenModel> {
		this.cancelPendingSearch();

		if (!this.cacheState) {
			this.loadCache();
		}

		// Construct query.
		const query: ISearchQuery = {
			cacheKey: this.cacheState.cacheKey,
		};
		if (typeof maxSortedResults === 'number') {
			query.maxResults = maxSortedResults;
			query.sortByScore = true;
		}
		this.extendQuery(query, searchValue);

		// Set delay before triggering search.
		let delay: number; // msec
		if (this.foldersWorkbenchService.isSearchCached(query)) {
			delay = 0;
		} else {
			delay = this.getDelayForSearchValue(searchValue);
		}

		const pendingSearch = this.searchDelayer.trigger(() => this.search(query), delay);
		this.pendingSearch = pendingSearch;
		return pendingSearch;
	}

	private search(query: ISearchQuery): TPromise<FolderQuickOpenModel | void> {
		return this.foldersWorkbenchService.search(query).then(complete => {
			this.pendingSearch = undefined;

			const results = complete.results.map(folder => {
				const entry = this.instantiationService.createInstance(FolderEntry, folder);
				if (!this.options.skipHighlighting) {
					setHighlights(entry, query.value);
				}
				return entry;
			}) as FolderEntryOrGroup[];

			return new FolderQuickOpenModel(results, this, this.getGroupLabel(), complete.stats);
		}, err => {
			this.pendingSearch = undefined;
			this.messageService.show(Severity.Error, err);
		});
	}

	public onOpen(): void {
		this.loadCache();
	}

	public onClose(canceled: boolean): void {
		// Cancel any pending search
		this.cancelPendingSearch();
	}

	private loadCache(): void {
		if (this.canRun() !== true) {
			return;
		}
		this.cacheState = new CacheState(cacheKey => this.cacheQuery(cacheKey), query => this.foldersWorkbenchService.search(query), cacheKey => this.foldersWorkbenchService.clearSearchCache(cacheKey), this.cacheState);
		this.cacheState.load();
	}

	private cacheQuery(cacheKey: string): ISearchQuery {
		const query: ISearchQuery = {
			cacheKey,
			maxResults: 0,
		};
		this.extendQuery(query);
		return query;
	}

	public getGroupLabel(): string {
		return nls.localize('folderSearchResults', "folder results");
	}

	public getEmptyLabel(searchString: string): string {
		if (searchString.length > 0) {
			return nls.localize('noFoldersMatching', "No folders matching");
		}
		return nls.localize('noFoldersWithoutInput', "Type to search for folders");
	}

	public getAutoFocus(searchValue: string): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue.trim(),
		};
	}

	private cancelPendingSearch(): void {
		if (this.pendingSearch) {
			this.searchDelayer.cancel();
			this.pendingSearch.cancel();
			this.pendingSearch = null;
		}
	}
}

/**
 * A quick open handler that provides results from among all folders. This is a large
 * dataset that is assumed to not be cacheable locally.
 */
export class OpenFolderHandler extends AbstractOpenFolderHandler {

	protected getDelayForSearchValue(searchValue: string): number {
		// Shorter queries will return more irrelevant results slowly, so don't
		// immediately fire off short searches.
		if (searchValue.length <= 2) {
			return 1250;
		} else if (searchValue.length <= 3) {
			return 1000;
		}
		return 500;
	}

	public extendQuery(query: ISearchQuery, searchValue?: string): void {
		if (searchValue !== undefined) {
			query.value = searchValue.trim();
		}
	}

	public getGroupLabel(): string {
		return nls.localize('folderSearchResults', "folder results");
	}
}

/**
 * A quick open handler that provides results from the list of recent folders. It is
 * separate because that subset can be locally cached and then locally searched, which is
 * fast.
 */
export class OpenRecentFolderHandler extends AbstractOpenFolderHandler {

	public extendQuery(query: ISearchQuery, searchValue?: string): void {
		if (searchValue !== undefined) {
			query.value = searchValue.trim();
		}
	}

	public canRun(): boolean | string {
		return true;
	}

	public hasShortResponseTime(): boolean {
		return this.isCacheLoaded;
	}

	private get isCacheLoaded(): boolean {
		return this.cacheState && this.cacheState.isLoaded;
	}

	public getGroupLabel(): string {
		return nls.localize('recentFolderSearchResults', "recently used");
	}
}
function setHighlights(result: FolderEntry, query: string): void {
	if (!query) { return; }
	const { labelHighlights, descriptionHighlights } = QuickOpenEntry.highlight(result, query, true /* fuzzy highlight */);
	result.setHighlights(labelHighlights, descriptionHighlights);
}

enum LoadingPhase {
	Created = 1,
	Loading,
	Loaded,
	Errored,
	Disposed
}

/**
 * Exported for testing.
 */
export class CacheState {

	private _cacheKey = defaultGenerator.nextId();
	private query: ISearchQuery;

	private loadingPhase = LoadingPhase.Created;
	private promise: TPromise<void>;

	constructor(cacheQuery: (cacheKey: string) => ISearchQuery, private doLoad: (query: ISearchQuery) => TPromise<any>, private doDispose: (cacheKey: string) => TPromise<void>, private previous: CacheState) {
		this.query = cacheQuery(this._cacheKey);
		if (this.previous) {
			const current = objects.assign({}, this.query, { cacheKey: null });
			const previous = objects.assign({}, this.previous.query, { cacheKey: null });
			if (!objects.equals(current, previous)) {
				this.previous.dispose();
				this.previous = null;
			}
		}
	}

	public get cacheKey(): string {
		return this.loadingPhase === LoadingPhase.Loaded || !this.previous ? this._cacheKey : this.previous.cacheKey;
	}

	public get isLoaded(): boolean {
		const isLoaded = this.loadingPhase === LoadingPhase.Loaded;
		return isLoaded || !this.previous ? isLoaded : this.previous.isLoaded;
	}

	public get isUpdating(): boolean {
		const isUpdating = this.loadingPhase === LoadingPhase.Loading;
		return isUpdating || !this.previous ? isUpdating : this.previous.isUpdating;
	}

	public load(): void {
		if (this.isUpdating) {
			return;
		}
		this.loadingPhase = LoadingPhase.Loading;
		this.promise = this.doLoad(this.query)
			.then(() => {
				this.loadingPhase = LoadingPhase.Loaded;
				if (this.previous) {
					this.previous.dispose();
					this.previous = null;
				}
			}, err => {
				this.loadingPhase = LoadingPhase.Errored;
				errors.onUnexpectedError(err);
			});
	}

	public dispose(): void {
		if (this.promise) {
			this.promise.then(null, () => { })
				.then(() => {
					this.loadingPhase = LoadingPhase.Disposed;
					return this.doDispose(this._cacheKey);
				}).then(null, err => {
					errors.onUnexpectedError(err);
				});
		} else {
			this.loadingPhase = LoadingPhase.Disposed;
		}
		if (this.previous) {
			this.previous.dispose();
			this.previous = null;
		}
	}
}