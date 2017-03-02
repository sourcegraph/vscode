/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { relative, isEqualOrParent } from 'vs/base/common/paths';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { IResourceEdit } from 'vs/editor/common/services/bulkEdit';
import { TPromise } from 'vs/base/common/winjs.base';
import { fromRange } from 'vs/workbench/api/node/extHostTypeConverters';
import { ExtHostWorkspaceShape, MainContext, MainThreadWorkspaceShape } from './extHost.protocol';
import * as vscode from 'vscode';

export class ExtHostWorkspace implements ExtHostWorkspaceShape {

	private static _requestIdPool = 0;

	private _proxy: MainThreadWorkspaceShape;
	private _workspacePath: string;
	private _workspaceEmitter: Emitter<IWorkspace>;

	constructor(threadService: IThreadService, workspacePath: string) {
		this._proxy = threadService.get(MainContext.MainThreadWorkspace);
		this._workspacePath = workspacePath;
		this._workspaceEmitter = new Emitter<IWorkspace>();
	}

	getPath(): string {
		return this._workspacePath;
	}

	getRelativePath(pathOrUri: string | vscode.Uri): string {

		let path: string;
		if (typeof pathOrUri === 'string') {
			path = pathOrUri;
		} else {
			path = pathOrUri.fsPath;
		}

		if (isEqualOrParent(path, this._workspacePath)) {
			return relative(this._workspacePath, path) || path;
		}

		return path;
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

	$setWorkspaceState(state: { commitID?: string, branch?: string, zapRef?: string }): TPromise<void> {
		this._proxy.$setWorkspaceState(state);
		return TPromise.as(void 0);
	}

	$onDidUpdateWorkspace(workspace: IWorkspace): TPromise<void> {
		this._workspaceEmitter.fire(workspace);
		return TPromise.as(void 0);
	}

}
