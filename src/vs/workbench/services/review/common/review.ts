/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

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

/**
 * Examples: a branches provider, a GitHub PR provider
 */
export interface IReviewProvider extends IDisposable {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly icon: string;

	readonly rootUri: URI;
	readonly reviewCommand?: Command;

	/** The potential reviewee */
	readonly author?: string;

	/** A timestamp in ms of the most recent activity on the review item */
	readonly date?: number;

	readonly onDidChange: Event<void>;
}

export interface IReviewItem extends IDisposable {
	readonly provider: IReviewProvider;
}

export interface IReviewService {

	readonly _serviceBrand: any;
	readonly onDidAddReviewItem: Event<IReviewItem>;
	readonly onDidRemoveReviewItem: Event<IReviewItem>;
	readonly onDidChangeReviewItem: Event<IReviewItem>;

	readonly reviewItems: IReviewItem[];

	registerReviewProvider(provider: IReviewProvider): IReviewItem;
}
