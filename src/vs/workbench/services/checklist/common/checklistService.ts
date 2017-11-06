/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import Event, { anyEvent, Emitter } from 'vs/base/common/event';
import { flatten } from 'vs/base/common/arrays';
import { IChecklistService, IChecklistProvider, IChecklistItemGroup } from './checklist';

export class ChecklistService implements IChecklistService {

	_serviceBrand: any;

	private _providerIds = new Set<string>();
	private _providers: IChecklistProvider[] = [];
	get providers(): IChecklistProvider[] { return [...this._providers]; }

	get items(): IChecklistItemGroup[] {
		return flatten(this.providers.map(provider => provider.items));
	}

	private _onDidAddProvider = new Emitter<IChecklistProvider>();
	get onDidAddProvider(): Event<IChecklistProvider> { return this._onDidAddProvider.event; }

	private _onDidRemoveProvider = new Emitter<IChecklistProvider>();
	get onDidRemoveProvider(): Event<IChecklistProvider> { return this._onDidRemoveProvider.event; }

	private _onDidItemsChange = new Emitter<void>();
	get onDidItemsChange(): Event<void> { return anyEvent<any>(this._onDidItemsChange.event, this.onDidAddProvider, this.onDidRemoveProvider); }

	registerChecklistProvider(provider: IChecklistProvider): IDisposable {
		if (this._providerIds.has(provider.id)) {
			throw new Error(`Checklist Provider ${provider.id} already exists.`);
		}

		this._providerIds.add(provider.id);

		const onChangeDisposable = provider.onDidChangeItems(() => {
			this._onDidItemsChange.fire();
		});

		const disposable = toDisposable(() => {
			const index = this._providers.indexOf(provider);

			if (index < 0) {
				return;
			}

			this._providerIds.delete(provider.id);
			this._providers.splice(index, 1);
			this._onDidRemoveProvider.fire(provider);
			onChangeDisposable.dispose();
			provider.dispose();
		});

		this._providers.push(provider);
		this._onDidAddProvider.fire(provider);

		return disposable;
	}
}
