/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Command } from 'vs/editor/common/modes';
import { ISCMResourceDecorations } from 'vs/workbench/services/scm/common/scm';

export const IChecklistService = createDecorator<IChecklistService>('checklistService');

export interface IChecklistItemDecorations extends ISCMResourceDecorations { }

export interface IChecklistItemSplice {
	start: number;
	deleteCount: number;
	items: IChecklistItem[];
}

export interface IChecklistItemCollection {
	readonly items: IChecklistItem[];
	readonly onDidSplice: Event<IChecklistItemSplice>;
}

export interface IChecklistItem {
	readonly itemGroup: IChecklistItemGroup;
	readonly name?: string;
	readonly description?: string;
	readonly decorations: IChecklistItemDecorations;

	/**
	 * Called to navigate to a detailed view of this checklist item when clicked by the user.
	 * For example, a diagnostic could open the problems panel, a commit status can jump to the build on the CI website.
	 */
	open(): TPromise<void>;
}

export interface IChecklistItemGroup {
	readonly provider: IChecklistProvider;
	readonly label: string;
	readonly id: string;
	readonly itemCollection: IChecklistItemCollection;
	readonly hideWhenEmpty: boolean;
}

export interface IChecklistProvider extends IDisposable {
	readonly label: string;
	readonly id: string;
	readonly contextValue: string;

	readonly items: IChecklistItemGroup[];
	readonly onDidChangeItems: Event<void>;

	readonly count?: number;
	readonly statusBarCommands?: Command[];
	readonly onDidChange: Event<void>;
}

export interface IChecklistService {

	readonly _serviceBrand: any;
	readonly onDidAddProvider: Event<IChecklistProvider>;
	readonly onDidRemoveProvider: Event<IChecklistProvider>;
	readonly onDidItemsChange: Event<void>;

	readonly providers: IChecklistProvider[];
	readonly items: IChecklistItemGroup[];

	registerChecklistProvider(provider: IChecklistProvider): IDisposable;
}
