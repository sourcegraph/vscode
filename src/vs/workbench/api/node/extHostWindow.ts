/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ExtHostWindowShape, MainContext, MainThreadWindowShape } from './extHost.protocol';
import { WindowState, WorkbenchWindow, WorkspaceData } from 'vscode';
import { TPromise } from 'vs/base/common/winjs.base';

class ExtHostWorkbenchWindow implements WorkbenchWindow {
	constructor(
		private _proxy: MainThreadWindowShape,
		public readonly id: number,
		public readonly title: string,
		public readonly workspace?: WorkspaceData,
	) { }

	showAndFocus(): Thenable<void> {
		return this._proxy.$showAndFocusWindow(this.id);
	}
}

export class ExtHostWindow implements ExtHostWindowShape {

	private static InitialState: WindowState = {
		focused: true
	};

	private _proxy: MainThreadWindowShape;

	private _onDidChangeWindowState = new Emitter<WindowState>();
	readonly onDidChangeWindowState: Event<WindowState> = this._onDidChangeWindowState.event;

	private _state = ExtHostWindow.InitialState;
	get state(): WindowState { return this._state; }

	constructor(threadService: IThreadService, public readonly id: number) {
		this._proxy = threadService.get(MainContext.MainThreadWindow);
		this._proxy.$getWindowVisibility().then(isFocused => this.$onDidChangeWindowFocus(isFocused));
	}

	$onDidChangeWindowFocus(focused: boolean): void {
		if (focused === this._state.focused) {
			return;
		}

		this._state = { ...this._state, focused };
		this._onDidChangeWindowState.fire(this._state);
	}

	getWindows(): TPromise<WorkbenchWindow[]> {
		return this._proxy.$getWindows().then(windows =>
			windows.map(win => new ExtHostWorkbenchWindow(this._proxy, win.id, win.title, win.workspace))
		);
	}
}