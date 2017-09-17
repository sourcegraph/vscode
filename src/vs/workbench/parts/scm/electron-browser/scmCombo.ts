/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter, any } from 'vs/base/common/event';
import { IDisposable, combinedDisposable, empty as EmptyDisposable } from 'vs/base/common/lifecycle';
import * as arrays from 'vs/base/common/arrays';
import { TrieMap } from 'vs/base/common/map';
import { ISCMRepository, ISCMProvider, ISCMResource, ISCMResourceSplice, ISCMResourceGroup, ISCMResourceCollection, ICommandOptions } from 'vs/workbench/services/scm/common/scm';
import { SCMRepository } from 'vs/workbench/services/scm/common/scmService';

export class CombinedSCMRepository extends SCMRepository {

	public provider: CombinedSCMProvider;

	constructor(
		id: string,
		label: string,
		initialRepositories: ISCMRepository[],
	) {
		const provider = new CombinedSCMProvider(id, label, initialRepositories.map(repository => repository.provider));

		super(provider, EmptyDisposable);
	}

	get onDidFocus(): Event<void> { return Event.None; }

	public addRepository(repository: ISCMRepository): void {
		this.provider.addProvider(repository.provider);
	}

	public removeRepository(repository: ISCMRepository): void {
		this.provider.removeProvider(repository.provider);
	}
}

interface ICombinedSCMResourceGroup extends ISCMResourceGroup {
	resourceCollection: CombinedSCMResourceCollection;
}

export class CombinedSCMProvider implements ISCMProvider {

	private _providerData: { provider: ISCMProvider, disposable: IDisposable }[] = [];
	get providers(): ISCMProvider[] {
		return this._providerData.map(({ provider }) => provider);
	}

	private _resources: ISCMResourceGroup[] = [];
	public get resources(): ISCMResourceGroup[] { return this._resources; }

	private _onDidChangeResources = new Emitter<void>();
	public get onDidChangeResources(): Event<void> { return this._onDidChangeResources.event; }

	public get contextValue(): string { return this.id; } // TODO(sqs): is this correct?

	public get count(): number { return this._count; }
	private _count: number;

	private _onDidChange = new Emitter<void>();
	public get onDidChange(): Event<void> { return this._onDidChange.event; }

	private _rootUriMap: TrieMap<ISCMProvider>;

	constructor(
		public readonly id: string,
		public readonly label: string,
		initialProviders: ISCMProvider[],
	) {

		if (initialProviders && initialProviders.length) {
			for (const provider of initialProviders) {
				this.doAddProvider(provider);
			}
			this.onProvidersUpdated();
		}
	}

	public addProvider(provider: ISCMProvider): void {
		const hasProvider = this._providerData.some(data => data.provider === provider);
		if (!hasProvider) {
			this.doAddProvider(provider);
			this.update();
		}
	}

	private doAddProvider(provider: ISCMProvider): void {
		this._providerData.push({
			provider,
			disposable: combinedDisposable([
				provider.onDidChangeResources(() => {
					this.update();
					this._onDidChangeResources.fire();
				}),
				provider.onDidChange(() => {
					this.update();
					this._onDidChange.fire();
				}),
			]),
		});
	}

	public removeProvider(provider: ISCMProvider): void {
		for (let i = 0; i < this._providerData.length; i++) {
			if (this._providerData[i].provider === provider) {
				this._providerData[i].disposable.dispose();
				this._providerData.splice(i, 1);
				this.onProvidersUpdated();
				return;
			}
		}
	}

	private onProvidersUpdated(): void {
		this.updateRootUriMap();
		this.update();
	}

	private updateRootUriMap(): void {
		this._rootUriMap = new TrieMap<ISCMProvider>(TrieMap.PathSplitter);
		for (const { provider } of this._providerData) {
			if (provider.rootUri) {
				this._rootUriMap.insert(provider.rootUri.toString(), provider);
			}
		}
	}

	private update(): void {
		this._resources = this.combineResourceGroups();
		this._count = this.computeCount();
	}

	private combineResourceGroups(): ISCMResourceGroup[] {
		const allGroups: ISCMResourceGroup[] = arrays.flatten(this._providerData.map(({ provider }) => provider.resources));

		const combinedGroups: ICombinedSCMResourceGroup[] = [];
		for (const group of allGroups) {
			let combinedGroup = combinedGroups.filter(g => g.id === group.id)[0];
			if (!combinedGroup) {
				combinedGroup = {
					provider: this,
					label: group.label,
					id: group.id,
					resourceCollection: new CombinedSCMResourceCollection(),
					hideWhenEmpty: group.hideWhenEmpty,
				};
				combinedGroups.push(combinedGroup);
			}

			combinedGroup.resourceCollection.merge(group.resourceCollection);
		}

		return combinedGroups;
	}

	private computeCount(): number {
		return this._providerData.reduce((c, { provider }) => {
			if (typeof provider.count === 'number') {
				return c + provider.count;
			} else {
				return c + provider.resources.reduce<number>((r, g) => r + g.resourceCollection.resources.length, 0);
			}
		}, 0);
	}

	public getOriginalResource(uri: URI): TPromise<URI> {
		const provider = this._rootUriMap.findSubstr(uri.toString());
		if (provider) {
			return provider.getOriginalResource(uri);
		}
		return TPromise.as(null);
	}

	public executeCommand(args: string[], options?: ICommandOptions): TPromise<string> {
		return TPromise.wrapError(new Error('executeCommand: not safe to implement for combined SCM provider'));
		//return TPromise.join(this.providers.map(provider => provider.executeCommand(args, options)))
		//.map(results => results.join(''))
	}

	public dispose(): void {
		this._providerData.forEach(({ provider }) => provider.dispose());
	}
}

export class CombinedSCMResourceCollection implements ISCMResourceCollection {

	private _collections: ISCMResourceCollection[] = [];

	public readonly resources: ISCMResource[] = [];

	private _onDidSplice: Event<ISCMResourceSplice> = Event.None;
	get onDidSplice(): Event<ISCMResourceSplice> { return this._onDidSplice; }

	public merge(other: ISCMResourceCollection): void {
		this._collections.push(other);

		this.resources.push(...other.resources);
		this._onDidSplice = any(...this._collections.map(collection => collection.onDidSplice));
	}
}