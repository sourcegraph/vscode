/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IReviewService, IReviewProvider, IReviewItem } from './review';

export class ReviewItem implements IReviewItem {

	private _onDidFocus = new Emitter<void>();
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	constructor(
		public readonly provider: IReviewProvider,
		private disposable: IDisposable
	) { }

	focus(): void {
		this._onDidFocus.fire();
	}

	dispose(): void {
		this.disposable.dispose();
		this.provider.dispose();
	}
}

export class ReviewService implements IReviewService {

	_serviceBrand: any;

	private _providerIds = new Set<string>();
	private _reviewItems: IReviewItem[] = [];
	get reviewItems(): IReviewItem[] { return [...this._reviewItems]; }

	private _onDidAddProvider = new Emitter<IReviewItem>();
	get onDidAddReviewItem(): Event<IReviewItem> { return this._onDidAddProvider.event; }

	private _onDidRemoveProvider = new Emitter<IReviewItem>();
	get onDidRemoveReviewItem(): Event<IReviewItem> { return this._onDidRemoveProvider.event; }

	private _onDidChangeProvider = new Emitter<IReviewItem>();
	get onDidChangeReviewItem(): Event<IReviewItem> { return this._onDidChangeProvider.event; }

	registerReviewProvider(provider: IReviewProvider): IReviewItem {
		if (this._providerIds.has(provider.id)) {
			throw new Error(`Review Provider ${provider.id} already exists.`);
		}

		this._providerIds.add(provider.id);

		const disposable = toDisposable(() => {
			const index = this._reviewItems.indexOf(reviewItem);

			if (index < 0) {
				return;
			}

			this._providerIds.delete(provider.id);
			this._reviewItems.splice(index, 1);
			this._onDidRemoveProvider.fire(reviewItem);
		});

		const reviewItem = new ReviewItem(provider, disposable);
		this._reviewItems.push(reviewItem);
		this._onDidAddProvider.fire(reviewItem);

		return reviewItem;
	}
}