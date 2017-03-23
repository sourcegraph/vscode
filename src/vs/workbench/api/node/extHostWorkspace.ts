/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { normalize } from 'vs/base/common/paths';
import { relative } from 'path';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IWorkspace, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IResourceEdit } from 'vs/editor/common/services/bulkEdit';
import { TPromise } from 'vs/base/common/winjs.base';
import { fromRange } from 'vs/workbench/api/node/extHostTypeConverters';
import { ExtHostWorkspaceShape, MainContext, MainThreadWorkspaceShape } from './extHost.protocol';
import * as vscode from 'vscode';

export class ExtHostWorkspace implements ExtHostWorkspaceShape {

	private static _requestIdPool = 0;

	private _proxy: MainThreadWorkspaceShape;
	private _workspaceEmitter: Emitter<IWorkspace>;

	constructor(threadService: IThreadService, private contextService: IWorkspaceContextService) {
		this._proxy = threadService.get(MainContext.MainThreadWorkspace);
		this._workspaceEmitter = new Emitter<IWorkspace>();
	}

	getPath(): string {
		const workspace = this.contextService.getWorkspace();
		if (!workspace.resource) {
			return undefined;
		}
		const resource = workspace.resource;
		if (resource.query === '' && workspace.revState && workspace.revState.commitID) {
			return `${resource.toString()}?${workspace.revState.commitID}`;
		}
		return resource.toString();
	}

	getRelativePath(pathOrUri: string | vscode.Uri): string {

		let path: string;
		if (typeof pathOrUri === 'string') {
			path = pathOrUri;
		} else if (typeof pathOrUri !== 'undefined') {
			path = pathOrUri.fsPath;
		}

		if (!path) {
			return path;
		}

		if (!this.getPath()) {
			return normalize(path);
		}

		let result = relative(this.getPath(), path);
		if (!result || result.indexOf('..') === 0) {
			return normalize(path);
		}

		return normalize(result);
	}

	findFiles(include: string, exclude: string, maxResults?: number, token?: vscode.CancellationToken): Thenable<vscode.Uri[]> {
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

	appyEdit(edit: vscode.WorkspaceEdit): TPromise<boolean> {

		let resourceEdits: IResourceEdit[] = [];

		let entries = edit.entries();
		for (let entry of entries) {
			let [uri, edits] = entry;

			for (let edit of edits) {
				resourceEdits.push({
					resource: <URI>uri,
					newText: edit.newText,
					range: fromRange(edit.range)
				});
			}
		}

		return this._proxy.$applyWorkspaceEdit(resourceEdits);
	}

	get onDidUpdateWorkspace(): Event<IWorkspace> {
		return this._workspaceEmitter.event;
	}

	$setWorkspace(resource: URI, revState: { commitID?: string, branch?: string, zapRef?: string }): TPromise<void> {
		this.contextService.setWorkspace({ resource, revState }); // TODO(john): is this ok?
		this._proxy.$setWorkspace(resource, revState);
		return TPromise.as(void 0);
	}

	$setWorkspaceState(state: { commitID?: string, branch?: string, zapRef?: string }): TPromise<void> {
		this._proxy.$setWorkspaceState(state);
		return TPromise.as(void 0);
	}

	$onDidUpdateWorkspace(workspace: IWorkspace): TPromise<void> {
		this._workspaceEmitter.fire(workspace);
		return TPromise.as(void 0);
	}

}
