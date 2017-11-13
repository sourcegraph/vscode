/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { MainThreadWindowShape, ExtHostWindowShape, ExtHostContext, MainContext, IExtHostContext, WorkbenchWindowFeatures } from '../node/extHost.protocol';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import * as vscode from 'vscode';
import { readFile } from 'vs/base/node/pfs';
import { toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { WorkspaceConfigurationModelParser } from 'vs/workbench/services/configuration/common/configurationModels';

@extHostNamedCustomer(MainContext.MainThreadWindow)
export class MainThreadWindow implements MainThreadWindowShape {

	private readonly proxy: ExtHostWindowShape;
	private disposables: IDisposable[] = [];

	constructor(
		extHostContext: IExtHostContext,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService
	) {
		this.proxy = extHostContext.get(ExtHostContext.ExtHostWindow);

		windowService.onDidChangeFocus(this.proxy.$onDidChangeWindowFocus, this.proxy, this.disposables);
	}

	$getWindowVisibility(): TPromise<boolean> {
		return this.windowService.isFocused();
	}

	async $getWindows(): TPromise<WorkbenchWindowFeatures[]> {
		const windows = await this.windowsService.getWindows();
		return TPromise.join(windows.map(async (win) => {
			let folders: vscode.WorkspaceFolder[] | undefined = undefined;
			if (win.workspace) {
				const contents = await readFile(win.workspace.configPath, 'utf8');
				const model = new WorkspaceConfigurationModelParser(win.workspace.configPath);
				model.parse(contents);
				folders = toWorkspaceFolders(model.folders);
			}
			return {
				id: win.id,
				title: win.title,
				workspace: win.workspace ? { folders } : undefined,
			} as WorkbenchWindowFeatures;
		}));
	}

	$showAndFocusWindow(windowId: number): TPromise<void> {
		return this.windowsService.focusWindow(windowId);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
