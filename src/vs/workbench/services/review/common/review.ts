/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Command } from 'vs/editor/common/modes';

export const IReviewService = createDecorator<IReviewService>('review');

export interface IReviewResourceDecorations {
	icon?: URI;
	iconDark?: URI;
	tooltip?: string;
	strikeThrough?: boolean;
	faded?: boolean;
}

export interface IReviewResourceSplice {
	start: number;
	deleteCount: number;
	resources: IReviewResource[];
}

export interface IReviewResourceCollection {
	readonly resources: IReviewResource[];
	readonly onDidSplice: Event<IReviewResourceSplice>;
}

export interface IReviewResource {
	readonly resourceGroup: IReviewResourceGroup;
	readonly sourceUri: URI;
	readonly decorations: IReviewResourceDecorations;
	open(): TPromise<void>;
}

export interface IReviewResourceGroup {
	readonly provider: IReviewProvider;
	readonly label: string;
	readonly id: string;
	readonly resourceCollection: IReviewResourceCollection;
	readonly hideWhenEmpty: boolean;
}

export interface IReviewProvider extends IDisposable {
	readonly label: string;
	readonly id: string;
	readonly contextValue: string;

	readonly resources: IReviewResourceGroup[];
	readonly onDidChangeResources: Event<void>;

	readonly reviewCommands?: Command[];
	readonly remoteResources?: URI[];
	readonly onDidChange: Event<void>;
}

export interface IReviewItem extends IDisposable {
	readonly onDidFocus: Event<void>;
	readonly provider: IReviewProvider;
	focus(): void;
}

export interface IReviewService {

	readonly _serviceBrand: any;
	readonly onDidAddReviewItem: Event<IReviewItem>;
	readonly onDidRemoveReviewItem: Event<IReviewItem>;
	readonly onDidChangeReviewItem: Event<IReviewItem>;

	readonly reviewItems: IReviewItem[];

	registerReviewProvider(provider: IReviewProvider): IReviewItem;
}