/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { normalize } from 'vs/base/common/paths';
import { delta } from 'vs/base/common/arrays';
import { relative, dirname } from 'path';
import { Workspace, WorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceData, ExtHostWorkspaceShape, MainContext, MainThreadWorkspaceShape, IMainContext } from './extHost.protocol';
import * as vscode from 'vscode';
import { compare } from 'vs/base/common/strings';
import { TrieMap } from 'vs/base/common/map';
import { asWinJsPromise } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/workbench/api/node/extHostTypes';
import { ICatalogFolder } from 'vs/platform/folders/common/folderCatalog';
import { IRelativePattern } from 'vs/base/common/glob';

class Workspace2 extends Workspace {

	static fromData(data: IWorkspaceData) {
		return data ? new Workspace2(data) : null;
	}

	private readonly _workspaceFolders: vscode.WorkspaceFolder[] = [];
	private readonly _structure = new TrieMap<URI, vscode.WorkspaceFolder>(uri => [uri.scheme, uri.authority].concat(uri.path.split('/')));

	private constructor(data: IWorkspaceData) {
		super(data.id, data.name, data.folders.map(folder => new WorkspaceFolder(folder)));

		// setup the workspace folder data structure
		this.folders.forEach(({ name, uri, index }) => {
			const workspaceFolder = { name, uri, index };
			this._workspaceFolders.push(workspaceFolder);
			this._structure.insert(workspaceFolder.uri, workspaceFolder);
		});
	}

	get workspaceFolders(): vscode.WorkspaceFolder[] {
		return this._workspaceFolders.slice(0);
	}

	getWorkspaceFolder(uri: URI, resolveParent?: boolean): vscode.WorkspaceFolder {
		if (resolveParent && this._structure.lookUp(uri)) {
			// `uri` is a workspace folder so we check for its parent
			uri = uri.with({ path: dirname(uri.path) });
		}
		return this._structure.findSubstr(uri);
	}
}

export class ExtHostWorkspace implements ExtHostWorkspaceShape {

	private static _requestIdPool = 0;

	private readonly _onDidChangeWorkspace = new Emitter<vscode.WorkspaceFoldersChangeEvent>();
	private readonly _proxy: MainThreadWorkspaceShape;
	private _workspace: Workspace2;

	readonly onDidChangeWorkspace: Event<vscode.WorkspaceFoldersChangeEvent> = this._onDidChangeWorkspace.event;

	constructor(mainContext: IMainContext, data: IWorkspaceData) {
		this._proxy = mainContext.get(MainContext.MainThreadWorkspace);
		this._workspace = Workspace2.fromData(data);
	}

	// --- workspace ---

	get workspace(): Workspace {
		return this._workspace;
	}

	getWorkspaceFolders(): vscode.WorkspaceFolder[] {
		if (!this._workspace) {
			return undefined;
		} else {
			return this._workspace.workspaceFolders.slice(0);
		}
	}

	getWorkspaceFolder(uri: vscode.Uri, resolveParent?: boolean): vscode.WorkspaceFolder {
		if (!this._workspace) {
			return undefined;
		}
		return this._workspace.getWorkspaceFolder(uri, resolveParent);
	}

	getPath(): string {
		// this is legacy from the days before having
		// multi-root and we keep it only alive if there
		// is just one workspace folder.
		if (!this._workspace) {
			return undefined;
		}
		const { folders } = this._workspace;
		if (folders.length === 0) {
			return undefined;
		}
		return folders[0].uri.fsPath;
	}

	getRelativePath(pathOrUri: string | vscode.Uri, includeWorkspace?: boolean): string {

		let path: string;
		if (typeof pathOrUri === 'string') {
			path = pathOrUri;
		} else if (typeof pathOrUri !== 'undefined') {
			path = pathOrUri.fsPath;
		}

		if (!path) {
			return path;
		}

		const folder = this.getWorkspaceFolder(
			typeof pathOrUri === 'string' ? URI.file(pathOrUri) : pathOrUri,
			true
		);

		if (!folder) {
			return path;
		}

		if (typeof includeWorkspace === 'undefined') {
			includeWorkspace = this.workspace.folders.length > 1;
		}

		let result = relative(folder.uri.fsPath, path);
		if (includeWorkspace) {
			result = `${folder.name}/${result}`;
		}
		return normalize(result, true);
	}

	$acceptWorkspaceData(data: IWorkspaceData): void {

		// keep old workspace folder, build new workspace, and
		// capture new workspace folders. Compute delta between
		// them send that as event
		const oldRoots = this._workspace ? this._workspace.workspaceFolders.sort(ExtHostWorkspace._compareWorkspaceFolder) : [];

		this._workspace = Workspace2.fromData(data);
		const newRoots = this._workspace ? this._workspace.workspaceFolders.sort(ExtHostWorkspace._compareWorkspaceFolder) : [];

		const { added, removed } = delta(oldRoots, newRoots, ExtHostWorkspace._compareWorkspaceFolder);
		this._onDidChangeWorkspace.fire(Object.freeze({
			added: Object.freeze<vscode.WorkspaceFolder[]>(added),
			removed: Object.freeze<vscode.WorkspaceFolder[]>(removed)
		}));
	}

	private static _compareWorkspaceFolder(a: vscode.WorkspaceFolder, b: vscode.WorkspaceFolder): number {
		return compare(a.uri.toString(), b.uri.toString());
	}

	// --- search ---

	findFiles(include: string | IRelativePattern, exclude: string | IRelativePattern, maxResults?: number, token?: vscode.CancellationToken): Thenable<vscode.Uri[]> {
		const requestId = ExtHostWorkspace._requestIdPool++;
		const result = this._proxy.$startSearch(include, exclude, maxResults, requestId);
		if (token) {
			token.onCancellationRequested(() => this._proxy.$cancelSearch(requestId));
		}
		return result;
	}

	saveAll(includeUntitled?: boolean): Thenable<boolean> {
		return this._proxy.$saveAll(includeUntitled);
	}

	// resource resolver

	private readonly _resourceResolutionProvider = new Map<number, vscode.ResourceResolutionProvider>();

	public registerResourceResolutionProvider(scheme: string, provider: vscode.ResourceResolutionProvider): vscode.Disposable {

		const handle = this._resourceResolutionProvider.size;
		this._resourceResolutionProvider.set(handle, provider);
		this._proxy.$registerResourceResolutionProvider(handle, scheme);
		return new Disposable(() => {
			this._resourceResolutionProvider.delete(handle);
		});
	}

	$resolveResource(handle: number, resource: URI): TPromise<URI> {
		const provider = this._resourceResolutionProvider.get(handle);
		return asWinJsPromise(token => provider.resolveResource(resource) as TPromise<URI>);
	}

	// folder search

	private readonly _folderCatalogProvider = new Map<number, vscode.FolderCatalogProvider>();

	public registerFolderCatalogProvider(root: URI, provider: vscode.FolderCatalogProvider): vscode.Disposable {
		const handle = this._folderCatalogProvider.size;
		this._folderCatalogProvider.set(handle, provider);
		this._proxy.$registerFolderCatalogProvider(handle, root);
		return new Disposable(() => {
			this._folderCatalogProvider.delete(handle);
		});
	}

	$resolveFolder(handle: number, resource: URI): TPromise<ICatalogFolder> {
		const provider = this._folderCatalogProvider.get(handle);
		return asWinJsPromise(token => provider.resolveFolder(resource) as TPromise<ICatalogFolder>);
	}

	$resolveLocalFolderResource(handle: number, path: string): TPromise<URI | null> {
		const provider = this._folderCatalogProvider.get(handle);
		return asWinJsPromise(token => provider.resolveLocalFolderResource(path) as TPromise<URI | null>);
	}

	$searchFolders(handle: number, query: string): TPromise<ICatalogFolder[]> {
		const provider = this._folderCatalogProvider.get(handle);
		return asWinJsPromise(token => provider.search(query, token) as TPromise<ICatalogFolder[]>);
	}
}
