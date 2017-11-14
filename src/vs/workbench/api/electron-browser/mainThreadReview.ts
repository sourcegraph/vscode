/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IReviewService, IReviewItem, IReviewProvider } from 'vs/workbench/services/review/common/review';
import { ExtHostContext, MainThreadReviewShape, ExtHostReviewShape, ReviewProviderFeatures, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { Command } from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';


class MainThreadReviewProvider implements IReviewProvider {

	private static ID_HANDLE = 0;
	private _id = `code-review-${MainThreadReviewProvider.ID_HANDLE++}`;
	get id(): string { return this._id; }

	private features: ReviewProviderFeatures = {};

	get handle(): number { return this._handle; }
	get label(): string { return this._label; }
	get rootUri(): URI { return this._rootUri; }
	get description(): string { return this._description; }
	get icon(): string { return this._icon; }
	get contextValue(): string { return this._contextValue; }
	get reviewCommand(): Command | undefined { return this.features.reviewCommand; }
	get date(): number | undefined { return this.features.date; }
	get author(): string | undefined { return this.features.author; }

	private _onDidChange = new Emitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	constructor(
		proxy: ExtHostReviewShape,
		private _handle: number,
		private _contextValue: string,
		private _label: string,
		private _description: string,
		private _icon: string,
		private _rootUri: URI,
		@IReviewService reviewService: IReviewService,
	) { }

	$updateReviewControl(features: ReviewProviderFeatures): void {
		this.features = assign(this.features, features);
		this._onDidChange.fire();
	}

	toJSON(): any {
		return {
			$mid: 1005,
			handle: this.handle
		};
	}

	dispose(): void {

	}
}

@extHostNamedCustomer(MainContext.MainThreadReview)
export class MainThreadReview implements MainThreadReviewShape {

	private _proxy: ExtHostReviewShape;
	private _reviewItems: { [handle: number]: IReviewItem; } = Object.create(null);
	private _disposables: IDisposable[] = [];

	constructor(
		extHostContext: IExtHostContext,
		@IReviewService private reviewService: IReviewService,
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostReview);
	}

	dispose(): void {
		Object.keys(this._reviewItems)
			.forEach(id => this._reviewItems[id].dispose());
		this._reviewItems = Object.create(null);
		this._disposables = dispose(this._disposables);
	}

	$registerReviewControl(handle: number, id: string, label: string, description: string, icon: string, rootUri: string): void {
		const provider = new MainThreadReviewProvider(this._proxy, handle, id, label, description, icon, URI.parse(rootUri), this.reviewService);
		const reviewItem = this.reviewService.registerReviewProvider(provider);
		this._reviewItems[handle] = reviewItem;
	}

	$updateReviewControl(handle: number, features: ReviewProviderFeatures): void {
		const reviewItem = this._reviewItems[handle];

		if (!reviewItem) {
			return;
		}

		const provider = reviewItem.provider as MainThreadReviewProvider;
		provider.$updateReviewControl(features);
	}

	$unregisterReviewControl(handle: number): void {
		const reviewItem = this._reviewItems[handle];

		if (!reviewItem) {
			return;
		}

		reviewItem.dispose();
		delete this._reviewItems[handle];
	}
}
