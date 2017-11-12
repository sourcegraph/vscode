/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import URI from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ExplorerViewlet } from 'vs/workbench/parts/files/browser/explorerViewlet';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

/**
 * For developer convenience. Shows a quickopen input field and adds the root folder
 * with the URI from user input.
 */
export class AddRootFolderResourceAction extends Action {
	public static ID = 'workbench.action.addRootFolderResource';
	public static LABEL = localize('openResource', "Add Folder to Workspace by URI");

	private static LAST_VALUE_STORAGE_KEY = 'addRootFolderResource.last';

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const lastValue = this.storageService.get(AddRootFolderResourceAction.LAST_VALUE_STORAGE_KEY, StorageScope.GLOBAL);

		return this.quickOpenService.input({
			prompt: localize('openResourcePrompt', "Enter Folder URI"),
			value: lastValue,
		})
			.then(value => {
				if (!value) {
					return undefined;
				}

				this.storageService.store(
					AddRootFolderResourceAction.LAST_VALUE_STORAGE_KEY,
					value,
					StorageScope.GLOBAL
				);

				const resource = URI.parse(value);
				const action = this.instantiationService.createInstance(
					AddAndShowRootFolderInExplorerAction,
					resource
				);
				return action.run();
			});
	}
}

export class AddRootFolderAction extends Action {
	private static LABEL = localize('addSpecificRootFolder', "Add Folder to Workspace");

	constructor(
		private folder: URI,
		@IWorkspaceEditingService
		private workspaceEditingService: IWorkspaceEditingService
	) {
		super('workbench.action.addSpecificRootFolder', AddRootFolderAction.LABEL);
	}

	run(): TPromise<any> {
		return this.workspaceEditingService.addFolders([{ uri: this.folder }]);
	}
}

export class ShowRootFolderInExplorerAction extends Action {
	private static LABEL = localize('showRootFolderInExplorer', "Show Workspace Folder in Side Bar");

	constructor(
		private folder: URI,
		@IViewletService private viewletService: IViewletService
	) {
		super('workbench.action.showRootFolderInExplorer', ShowRootFolderInExplorerAction.LABEL);
	}

	run(): TPromise<any> {
		return this.viewletService
			.openViewlet(EXPLORER_VIEWLET_ID, true)
			.then((viewlet: ExplorerViewlet) => {
				const explorerView = viewlet.getExplorerView();
				if (explorerView) {
					return explorerView.select(this.folder, true).then(() => {
						if (!explorerView.isExpanded()) {
							explorerView.setExpanded(true);
						}
					});
				}
				return void 0;
			});
	}
}

export class AddAndShowRootFolderInExplorerAction extends Action {
	private static LABEL = localize('addAndExploreFolderAction', "Add Folder to Workspace and Show in Side Bar");

	private addAction: AddRootFolderAction;
	private exploreAction: ShowRootFolderInExplorerAction;

	constructor(
		folder: URI,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super('workbench.action.addAndShowRootFolderInExplorer', AddAndShowRootFolderInExplorerAction.LABEL);

		this.addAction = instantiationService.createInstance(AddRootFolderAction, folder);
		this.exploreAction = instantiationService.createInstance(ShowRootFolderInExplorerAction, folder);
	}

	async run(): TPromise<any> {
		await this.addAction.run();
		await this.exploreAction.run();
	}
}