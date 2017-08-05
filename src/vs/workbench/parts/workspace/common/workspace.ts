/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IViewlet } from 'vs/workbench/common/viewlet';
import Event from 'vs/base/common/event';
import { ICatalogFolder } from 'vs/platform/workspace/common/folder';
import { IPagedModel } from 'vs/base/common/paging';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const VIEWLET_ID = 'workbench.view.workspace';

export interface IWorkspaceViewlet extends IViewlet {
	search(text: string): void;
}

export interface IFolder extends ICatalogFolder {
	readonly id: string;
	readonly iconUrl: string;
	readonly iconUrlFallback: string;
	readonly state: WorkspaceFolderState;
	readonly telemetryData: any;
};

export enum WorkspaceFolderState {
	Adding,
	Active,
	Removing,
	Inactive
}

export enum FolderOperation {
	Adding,
	Removing
}

export const IFolderCatalogService = createDecorator<IFolderCatalogService>('folderCatalogService');

/**
 * A service that returns search results for folders (repositories). It typically
 * represents an external repository host.
 */
export interface IFolderCatalogService {
	_serviceBrand: any;

	/**
	 * Fired whenever any folder catalog data changes (e.g., a folder is added or removed).
	 */
	onChange: Event<void>;

	/**
	 * Returns an array of of the current workspace's folders, with additional catalog
	 * information associated if available.
	 */
	getCurrentWorkspaceFolders(): TPromise<IFolder[]>;

	/**
	 * Returns an array of folders that contain open documents, with additional catalog
	 * information associated if available.
	 */
	getContainingFolders(): TPromise<IFolder[]>;

	/**
	 * Returns an array of other folders that were recently open or that are related to
	 * the current workspace folders, with additional catalog information associated if
	 * available.
	 */
	getOtherFolders(): TPromise<IFolder[]>;

	/**
	 * Searches the catalog and returns matching folders.
	 */
	search(query: string): TPromise<IPagedModel<IFolder>>;

	/**
	 * Tells the service that the folder (with the given id) is undergoing an operation,
	 * so that it can update the UI to reflect the operation.
	 */
	monitorFolderOperation(folder: IFolder, operation: FolderOperation, promise: TPromise<any>): void;
}