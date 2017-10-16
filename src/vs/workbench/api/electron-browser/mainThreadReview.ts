/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IReviewService, IReviewItem, IReviewProvider, IReviewResource, IReviewResourceGroup, IReviewResourceDecorations, IReviewResourceCollection, IReviewResourceSplice } from 'vs/workbench/services/review/common/review';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ExtHostContext, MainThreadReviewShape, ExtHostReviewShape, ReviewProviderFeatures, SCMRawResourceSplices, ReviewGroupFeatures, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { Command } from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';

class MainThreadReviewResourceCollection implements IReviewResourceCollection {

	readonly resources: IReviewResource[] = [];

	private _onDidSplice = new Emitter<IReviewResourceSplice>();
	readonly onDidSplice = this._onDidSplice.event;

	splice(start: number, deleteCount: number, resources: IReviewResource[]) {
		this.resources.splice(start, deleteCount, ...resources);
		this._onDidSplice.fire({ start, deleteCount, resources });
	}
}

class MainThreadReviewResourceGroup implements IReviewResourceGroup {

	readonly resourceCollection = new MainThreadReviewResourceCollection();
	get hideWhenEmpty(): boolean { return this.features.hideWhenEmpty; }

	constructor(
		private reviewControlHandle: number,
		private handle: number,
		public provider: IReviewProvider,
		public features: ReviewGroupFeatures,
		public label: string,
		public id: string
	) { }

	toJSON(): any {
		return {
			$mid: 1004,
			reviewControlHandle: this.reviewControlHandle,
			groupHandle: this.handle
		};
	}
}

class MainThreadReviewResource implements IReviewResource {

	constructor(
		private proxy: ExtHostReviewShape,
		private reviewControlHandle: number,
		private groupHandle: number,
		private handle: number,
		public sourceUri: URI,
		public resourceGroup: IReviewResourceGroup,
		public decorations: IReviewResourceDecorations
	) { }

	open(): TPromise<void> {
		return this.proxy.$executeResourceCommand(this.reviewControlHandle, this.groupHandle, this.handle);
	}

	toJSON(): any {
		return {
			$mid: 1003,
			reviewControlHandle: this.reviewControlHandle,
			groupHandle: this.groupHandle,
			handle: this.handle
		};
	}
}

class MainThreadReviewProvider implements IReviewProvider {

	private static ID_HANDLE = 0;
	private _id = `code-review-${MainThreadReviewProvider.ID_HANDLE++}`;
	get id(): string { return this._id; }

	private _groups: MainThreadReviewResourceGroup[] = [];
	private _groupsByHandle: { [handle: number]: MainThreadReviewResourceGroup; } = Object.create(null);

	get resources(): IReviewResourceGroup[] {
		return this._groups
			.filter(g => g.resourceCollection.resources.length > 0 || !g.features.hideWhenEmpty);
	}

	private _onDidChangeResources = new Emitter<void>();
	get onDidChangeResources(): Event<void> { return this._onDidChangeResources.event; }

	private features: ReviewProviderFeatures = {};

	get handle(): number { return this._handle; }
	get label(): string { return this._label; }
	get rootUri(): URI { return this._rootUri; }
	get description(): string { return this._description; }
	get icon(): string { return this._icon; }
	get contextValue(): string { return this._contextValue; }

	private _active = false;
	public get active(): boolean { return this._active; }
	public set active(active: boolean) {
		if (this._active !== active) {
			this._active = active;
			this.proxy.$setActive(this.handle, active);
		}
	}

	get reviewCommands(): Command[] | undefined { return this.features.reviewCommands; }
	get date(): number | undefined { return this.features.date; }
	get author(): string | undefined { return this.features.author; }

	private _onDidChange = new Emitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	constructor(
		private proxy: ExtHostReviewShape,
		private _handle: number,
		private _contextValue: string,
		private _label: string,
		private _description: string,
		private _icon: string,
		private _rootUri: URI,
		@IReviewService reviewService: IReviewService,
		@ICommandService private commandService: ICommandService
	) { }

	$updateReviewControl(features: ReviewProviderFeatures): void {
		this.features = assign(this.features, features);
		this._onDidChange.fire();
	}

	$registerGroup(handle: number, id: string, label: string): void {
		const group = new MainThreadReviewResourceGroup(
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

	$updateGroup(handle: number, features: ReviewGroupFeatures): void {
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

	$spliceGroupResourceStates(splices: SCMRawResourceSplices[]): void {
		for (const [groupHandle, groupSlices] of splices) {
			const group = this._groupsByHandle[groupHandle];

			if (!group) {
				return;
			}

			// reverse the splices sequence in order to apply them correctly
			groupSlices.reverse();

			for (const [start, deleteCount, rawResources] of groupSlices) {
				const resources = rawResources.map(rawResource => {
					const [handle, sourceUri, icons, tooltip, strikeThrough, faded] = rawResource;
					const icon = icons[0];
					const iconDark = icons[1] || icon;
					const decorations = {
						icon: icon && URI.parse(icon),
						iconDark: iconDark && URI.parse(iconDark),
						tooltip,
						strikeThrough,
						faded
					};

					return new MainThreadReviewResource(
						this.proxy,
						this.handle,
						groupHandle,
						handle,
						URI.parse(sourceUri),
						group,
						decorations
					);
				});

				group.resourceCollection.splice(start, deleteCount, resources);
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
		@IInstantiationService private instantiationService: IInstantiationService,
		@IReviewService private reviewService: IReviewService,
		@ICommandService private commandService: ICommandService
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
		const provider = new MainThreadReviewProvider(this._proxy, handle, id, label, description, icon, URI.parse(rootUri), this.reviewService, this.commandService);
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

	$registerGroup(reviewControlHandle: number, groupHandle: number, id: string, label: string): void {
		const reviewItem = this._reviewItems[reviewControlHandle];

		if (!reviewItem) {
			return;
		}

		const provider = reviewItem.provider as MainThreadReviewProvider;
		provider.$registerGroup(groupHandle, id, label);
	}

	$updateGroup(reviewControlHandle: number, groupHandle: number, features: ReviewGroupFeatures): void {
		const reviewItem = this._reviewItems[reviewControlHandle];

		if (!reviewItem) {
			return;
		}

		const provider = reviewItem.provider as MainThreadReviewProvider;
		provider.$updateGroup(groupHandle, features);
	}

	$updateGroupLabel(reviewControlHandle: number, groupHandle: number, label: string): void {
		const reviewItem = this._reviewItems[reviewControlHandle];

		if (!reviewItem) {
			return;
		}

		const provider = reviewItem.provider as MainThreadReviewProvider;
		provider.$updateGroupLabel(groupHandle, label);
	}

	$spliceResourceStates(reviewControlHandle: number, splices: SCMRawResourceSplices[]): void {
		const reviewItem = this._reviewItems[reviewControlHandle];

		if (!reviewItem) {
			return;
		}

		const provider = reviewItem.provider as MainThreadReviewProvider;
		provider.$spliceGroupResourceStates(splices);
	}

	$unregisterGroup(reviewControlHandle: number, handle: number): void {
		const reviewItem = this._reviewItems[reviewControlHandle];

		if (!reviewItem) {
			return;
		}

		const provider = reviewItem.provider as MainThreadReviewProvider;
		provider.$unregisterGroup(handle);
	}
}
