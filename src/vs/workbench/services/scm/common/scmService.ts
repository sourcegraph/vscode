/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { TrieMap } from 'vs/base/common/map';
import { ISCMService, ISCMProvider, ISCMInput, ISCMRepository } from './scm';

class SCMInput implements ISCMInput {

	private _value = '';

	get value(): string {
		return this._value;
	}

	set value(value: string) {
		this._value = value;
		this._onDidChange.fire(value);
	}

	private _onDidChange = new Emitter<string>();
	get onDidChange(): Event<string> { return this._onDidChange.event; }
}

class SCMRepository implements ISCMRepository {

	private _onDidFocus = new Emitter<void>();
	readonly onDidFocus: Event<void> = this._onDidFocus.event;

	readonly input: ISCMInput = new SCMInput();

	constructor(
		public readonly provider: ISCMProvider,
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

export class SCMService implements ISCMService {

	_serviceBrand;

	private _providerIds = new Set<string>();
	private _repositories: ISCMRepository[] = [];
	get repositories(): ISCMRepository[] { return [...this._repositories]; }

	private _onDidAddProvider = new Emitter<ISCMRepository>();
	get onDidAddRepository(): Event<ISCMRepository> { return this._onDidAddProvider.event; }

	private _onDidRemoveProvider = new Emitter<ISCMRepository>();
	get onDidRemoveRepository(): Event<ISCMRepository> { return this._onDidRemoveProvider.event; }

	private _onDidChangeProvider = new Emitter<ISCMRepository>();
	get onDidChangeRepository(): Event<ISCMRepository> { return this._onDidChangeProvider.event; }

	/**
	 * Map of SCM root folders to the SCM provider that is used to provide SCM information
	 * about resources inside the folder.
	 */
	private _folderProvidersMap: TrieMap<ISCMProvider>;

	constructor() {
		this.updateFolderProvidersMap();
	}

	registerSCMProvider(provider: ISCMProvider): ISCMRepository {
		if (this._providerIds.has(provider.id)) {
			throw new Error(`SCM Provider ${provider.id} already exists.`);
		}

		this._providerIds.add(provider.id);

		const disposable = toDisposable(() => {
			const index = this._repositories.indexOf(repository);

			if (index < 0) {
				return;
			}

			this._providerIds.delete(provider.id);
			this._repositories.splice(index, 1);
			this._onDidRemoveProvider.fire(repository);
			this.updateFolderProvidersMap();
		});

		const repository = new SCMRepository(provider, disposable);
		this._repositories.push(repository);
		this._onDidAddProvider.fire(repository);

		if (provider.rootFolder) {
			this.updateFolderProvidersMap();
		}

		return repository;
	}

	getProviderForResource(resource: URI): ISCMProvider | undefined {
		return this._folderProvidersMap.findSubstr(resource.toString());
	}

	private updateFolderProvidersMap(): void {
		this._folderProvidersMap = new TrieMap<ISCMProvider>(TrieMap.PathSplitter);
		for (const repository of this._repositories) {
			if (repository.provider.rootFolder) {
				this._folderProvidersMap.insert(repository.provider.rootFolder.toString(), repository.provider);
			}
		}
	}
}