/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IChecklistService, IChecklistProvider, IChecklistItem, IChecklistItemGroup, IChecklistItemDecorations, IChecklistItemCollection, IChecklistItemSplice } from 'vs/workbench/services/checklist/common/checklist';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ExtHostContext, MainThreadChecklistShape, ExtHostChecklistShape, ChecklistProviderFeatures, ChecklistRawItemSplices, ChecklistItemGroupFeatures, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { Command } from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

class MainThreadChecklistItemCollection implements IChecklistItemCollection {

	readonly items: IChecklistItem[] = [];

	private _onDidSplice = new Emitter<IChecklistItemSplice>();
	readonly onDidSplice = this._onDidSplice.event;

	splice(start: number, deleteCount: number, items: IChecklistItem[]) {
		this.items.splice(start, deleteCount, ...items);
		this._onDidSplice.fire({ start, deleteCount, items });
	}
}

class MainThreadChecklistlistItemGroup implements IChecklistItemGroup {

	readonly itemCollection = new MainThreadChecklistItemCollection();
	get hideWhenEmpty(): boolean { return this.features.hideWhenEmpty; }

	constructor(
		private sourceControlHandle: number,
		private handle: number,
		public provider: IChecklistProvider,
		public features: ChecklistItemGroupFeatures,
		public label: string,
		public id: string
	) { }

	toJSON(): any {
		return {
			$mid: 94,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.handle
		};
	}
}

class MainThreadChecklistItem implements IChecklistItem {

	constructor(
		private proxy: ExtHostChecklistShape,
		private sourceControlHandle: number,
		private groupHandle: number,
		private handle: number,
		public name: string,
		public description: string,
		public itemGroup: IChecklistItemGroup,
		public decorations: IChecklistItemDecorations
	) { }

	open(): TPromise<void> {
		return this.proxy.$executeItemCommand(this.sourceControlHandle, this.groupHandle, this.handle);
	}

	toJSON(): any {
		return {
			$mid: 93,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.groupHandle,
			handle: this.handle
		};
	}
}

class MainThreadChecklistProvider implements IChecklistProvider {

	private static ID_HANDLE = 0;
	private _id = `check${MainThreadChecklistProvider.ID_HANDLE++}`;
	get id(): string { return this._id; }

	private _groups: MainThreadChecklistlistItemGroup[] = [];
	private _groupsByHandle: { [handle: number]: MainThreadChecklistlistItemGroup; } = Object.create(null);

	get items(): IChecklistItemGroup[] {
		return this._groups
			.filter(g => g.itemCollection.items.length > 0 || !g.features.hideWhenEmpty);
	}

	private _onDidChangeResources = new Emitter<void>();
	get onDidChangeItems(): Event<void> { return this._onDidChangeResources.event; }

	private features: ChecklistProviderFeatures = {};

	get handle(): number { return this._handle; }
	get label(): string { return this._label; }
	get contextValue(): string { return this._contextValue; }

	get statusBarCommands(): Command[] | undefined { return this.features.statusBarCommands; }
	get count(): number | undefined { return this.features.count; }

	private _onDidChange = new Emitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	constructor(
		private proxy: ExtHostChecklistShape,
		private _handle: number,
		private _contextValue: string,
		private _label: string,
		@IChecklistService scmService: IChecklistService,
		@ICommandService private commandService: ICommandService
	) { }

	$updateProvider(features: ChecklistProviderFeatures): void {
		this.features = assign(this.features, features);
		this._onDidChange.fire();
	}

	$registerGroup(handle: number, id: string, label: string): void {
		const group = new MainThreadChecklistlistItemGroup(
			this.handle,
			handle,
			this,
			{},
			label,
			id
		);

		this._groups.push(group);
		this._groupsByHandle[handle] = group;
	}

	$updateGroup(handle: number, features: ChecklistItemGroupFeatures): void {
		const group = this._groupsByHandle[handle];

		if (!group) {
			return;
		}

		group.features = assign(group.features, features);
		this._onDidChange.fire();
	}

	$updateGroupLabel(handle: number, label: string): void {
		const group = this._groupsByHandle[handle];

		if (!group) {
			return;
		}

		group.label = label;
		this._onDidChange.fire();
	}

	$spliceGroupResourceStates(splices: ChecklistRawItemSplices[]): void {
		for (const [groupHandle, groupSlices] of splices) {
			const group = this._groupsByHandle[groupHandle];

			if (!group) {
				return;
			}

			// reverse the splices sequence in order to apply them correctly
			groupSlices.reverse();

			for (const [start, deleteCount, rawItems] of groupSlices) {
				const items = rawItems.map(rawItem => {
					const [handle, name, description, icons, tooltip, strikeThrough, faded] = rawItem;
					const icon = icons[0];
					const iconDark = icons[1] || icon;
					const decorations = {
						icon: icon && URI.parse(icon),
						iconDark: iconDark && URI.parse(iconDark),
						tooltip,
						strikeThrough,
						faded
					};

					return new MainThreadChecklistItem(
						this.proxy,
						this.handle,
						groupHandle,
						handle,
						name,
						description,
						group,
						decorations
					);
				});

				group.itemCollection.splice(start, deleteCount, items);
			}
		}

		this._onDidChangeResources.fire();
	}

	$unregisterGroup(handle: number): void {
		const group = this._groupsByHandle[handle];

		if (!group) {
			return;
		}

		delete this._groupsByHandle[handle];
		this._groups.splice(this._groups.indexOf(group), 1);
	}

	toJSON(): any {
		return {
			$mid: 95,
			handle: this.handle
		};
	}

	dispose(): void {

	}
}

@extHostNamedCustomer(MainContext.MainThreadChecklist)
export class MainThreadChecklist implements MainThreadChecklistShape {

	private _proxy: ExtHostChecklistShape;
	private _providerDisposables: { [handle: number]: { provider: IChecklistProvider, disposable: IDisposable } } = Object.create(null);
	private _disposables: IDisposable[] = [];

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IChecklistService private checkService: IChecklistService,
		@ICommandService private commandService: ICommandService
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostChecklist);
	}

	dispose(): void {
		Object.keys(this._providerDisposables)
			.forEach(id => this._providerDisposables[id].disposable.dispose());
		this._providerDisposables = Object.create(null);

		this._disposables = dispose(this._disposables);
	}

	$registerChecklistProvider(handle: number, id: string, label: string): void {
		const provider = new MainThreadChecklistProvider(this._proxy, handle, id, label, this.checkService, this.commandService);
		const disposable = this.checkService.registerChecklistProvider(provider);
		this._providerDisposables[handle] = { provider, disposable };
	}

	$updateChecklistProvider(handle: number, features: ChecklistProviderFeatures): void {
		const entry = this._providerDisposables[handle];

		if (!entry) {
			return;
		}

		const provider = entry.provider as MainThreadChecklistProvider;
		provider.$updateProvider(features);
	}

	$unregisterChecklistProvider(handle: number): void {
		const entry = this._providerDisposables[handle];

		if (!entry) {
			return;
		}

		entry.disposable.dispose();
		delete this._providerDisposables[handle];
	}

	$registerGroup(sourceControlHandle: number, groupHandle: number, id: string, label: string): void {
		const entry = this._providerDisposables[sourceControlHandle];

		if (!entry) {
			return;
		}

		const provider = entry.provider as MainThreadChecklistProvider;
		provider.$registerGroup(groupHandle, id, label);
	}

	$updateGroup(sourceControlHandle: number, groupHandle: number, features: ChecklistItemGroupFeatures): void {
		const entry = this._providerDisposables[sourceControlHandle];

		if (!entry) {
			return;
		}

		const provider = entry.provider as MainThreadChecklistProvider;
		provider.$updateGroup(groupHandle, features);
	}

	$updateGroupLabel(sourceControlHandle: number, groupHandle: number, label: string): void {
		const entry = this._providerDisposables[sourceControlHandle];

		if (!entry) {
			return;
		}

		const provider = entry.provider as MainThreadChecklistProvider;
		provider.$updateGroupLabel(groupHandle, label);
	}

	$spliceItemStates(sourceControlHandle: number, splices: ChecklistRawItemSplices[]): void {
		const entry = this._providerDisposables[sourceControlHandle];

		if (!entry) {
			return;
		}

		const provider = entry.provider as MainThreadChecklistProvider;
		provider.$spliceGroupResourceStates(splices);
	}

	$unregisterGroup(sourceControlHandle: number, handle: number): void {
		const entry = this._providerDisposables[sourceControlHandle];

		if (!entry) {
			return;
		}

		const provider = entry.provider as MainThreadChecklistProvider;
		provider.$unregisterGroup(handle);
	}
}
