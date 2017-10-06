/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { isPromiseCanceledError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { ISearchService, QueryType, ISearchQuery, IFolderQuery, ISearchConfiguration } from 'vs/platform/search/common/search';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { TPromise } from 'vs/base/common/winjs.base';
import { MainThreadWorkspaceShape, ExtHostWorkspaceShape, ExtHostContext, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { IFileService } from 'vs/platform/files/common/files';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IResourceResolutionProvider, IResourceResolverService } from 'vs/platform/resourceResolver/common/resourceResolver';
import { IFolderCatalogProvider, IFolderCatalogService } from 'vs/platform/folders/common/folderCatalog';
import { IExperimentService } from 'vs/platform/telemetry/common/experiments';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRelativePattern } from 'vs/base/common/glob';

@extHostNamedCustomer(MainContext.MainThreadWorkspace)
export class MainThreadWorkspace implements MainThreadWorkspaceShape {

	private readonly _toDispose: IDisposable[] = [];
	private readonly _activeSearches: { [id: number]: TPromise<URI[]> } = Object.create(null);
	private readonly _proxy: ExtHostWorkspaceShape;

	constructor(
		extHostContext: IExtHostContext,
		@ISearchService private readonly _searchService: ISearchService,
		@IWorkspaceContextService private readonly _contextService: IWorkspaceContextService,
		@ITextFileService private readonly _textFileService: ITextFileService,
		@IExperimentService private _experimentService: IExperimentService,
		@IResourceResolverService private readonly _resourceResolverService: IResourceResolverService,
		@IFolderCatalogService private readonly _folderCatalogService: IFolderCatalogService,
		@IConfigurationService private _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostWorkspace);
		this._contextService.onDidChangeWorkspaceFolders(this._onDidChangeWorkspace, this, this._toDispose);
		this._contextService.onDidChangeWorkbenchState(this._onDidChangeWorkspace, this, this._toDispose);
	}

	dispose(): void {
		dispose(this._toDispose);

		for (let requestId in this._activeSearches) {
			const search = this._activeSearches[requestId];
			search.cancel();
		}
	}

	// --- workspace ---

	private _onDidChangeWorkspace(): void {
		this._proxy.$acceptWorkspaceData(this._contextService.getWorkbenchState() === WorkbenchState.EMPTY ? null : this._contextService.getWorkspace());
	}

	// --- search ---

	$startSearch(include: string | IRelativePattern, exclude: string | IRelativePattern, maxResults: number, requestId: number): Thenable<URI[]> {
		const workspace = this._contextService.getWorkspace();
		if (!workspace.folders.length) {
			return undefined;
		}

		let folderQueries: IFolderQuery[];
		if (typeof include === 'string' || !include) {
			folderQueries = workspace.folders.map(folder => ({ folder: folder.uri })); // absolute pattern: search across all folders
		} else {
			folderQueries = [{ folder: URI.file(include.base) }]; // relative pattern: search only in base folder
		}

		const useRipgrep = folderQueries.every(folderQuery => {
			const folderConfig = this._configurationService.getConfiguration<ISearchConfiguration>(undefined, { resource: folderQuery.folder });
			return folderConfig.search.useRipgrep;
		});

		const query: ISearchQuery = {
			folderQueries,
			type: QueryType.File,
			maxResults,
			includePattern: { [typeof include === 'string' ? include : !!include ? include.pattern : undefined]: true },
			excludePattern: { [typeof exclude === 'string' ? exclude : !!exclude ? exclude.pattern : undefined]: true },
			useRipgrep
		};
		this._searchService.extendQuery(query);

		const search = this._searchService.search(query).then(result => {
			return result.results.map(m => m.resource);
		}, err => {
			if (!isPromiseCanceledError(err)) {
				return TPromise.wrapError(err);
			}
			return undefined;
		});

		this._activeSearches[requestId] = search;
		const onDone = () => delete this._activeSearches[requestId];
		search.done(onDone, onDone);

		return search;
	}

	$cancelSearch(requestId: number): Thenable<boolean> {
		const search = this._activeSearches[requestId];
		if (search) {
			delete this._activeSearches[requestId];
			search.cancel();
			return TPromise.as(true);
		}
		return undefined;
	}

	// --- save & edit resources ---

	$saveAll(includeUntitled?: boolean): Thenable<boolean> {
		return this._textFileService.saveAll(includeUntitled).then(result => {
			return result.results.every(each => each.success === true);
		});
	}

	// resource resolver

	private _resourceResolutionProviders = new Map<number, IResourceResolutionProvider>();

	$registerResourceResolutionProvider(handle: number, scheme: string): void {
		const provider = {
			resolveResource: resource => {
				return this._proxy.$resolveResource(handle, resource);
			},
		};
		this._resourceResolutionProviders.set(handle, provider);
		this._toDispose.push(this._resourceResolverService.registerResourceResolutionProvider(scheme, provider));
	}

	// folder search

	private _folderCatalogProviders = new Map<number, IFolderCatalogProvider>();

	$registerFolderCatalogProvider(handle: number, root: URI): void {
		const provider = {
			resolveFolder: resource => {
				return this._proxy.$resolveFolder(handle, resource);
			},
			resolveLocalFolderResource: path => {
				return this._proxy.$resolveLocalFolderResource(handle, path);
			},
			search: query => {
				return this._proxy.$searchFolders(handle, query);
			},
		};
		this._folderCatalogProviders.set(handle, provider);
		this._toDispose.push(this._folderCatalogService.registerFolderCatalogProvider(root, provider));
	}
}

