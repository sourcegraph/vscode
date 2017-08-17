/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IDisposable, toDisposable, empty as EmptyDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { memoize } from 'vs/base/common/decorators';
import URI from 'vs/base/common/uri';
import { TrieMap } from 'vs/base/common/map';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStatusbarService, StatusbarAlignment as MainThreadStatusBarAlignment } from 'vs/platform/statusbar/common/statusbar';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ISCMService, ISCMProvider, ISCMInput, DefaultSCMProviderIdStorageKey } from './scm';

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

export class SCMService implements ISCMService {

	_serviceBrand;

	private activeProviderDisposable: IDisposable = EmptyDisposable;
	private statusBarDisposable: IDisposable = EmptyDisposable;

	private _activeProvider: ISCMProvider | undefined;

	/**
	 * Map of SCM root folders to the SCM provider that is used to provide SCM information
	 * about resources inside the folder.
	 */
	private _folderProvidersMap: TrieMap<ISCMProvider>;

	get activeProvider(): ISCMProvider | undefined {
		return this._activeProvider;
	}

	set activeProvider(provider: ISCMProvider | undefined) {
		this.setActiveSCMProvider(provider);
		this.storageService.store(DefaultSCMProviderIdStorageKey, provider.id, StorageScope.WORKSPACE);
	}

	private _providers: ISCMProvider[] = [];
	get providers(): ISCMProvider[] { return [...this._providers]; }

	private _onDidChangeProviders = new Emitter<void>();
	get onDidChangeProviders(): Event<void> { return this._onDidChangeProviders.event; }

	private _onDidChangeProvider = new Emitter<ISCMProvider>();
	get onDidChangeProvider(): Event<ISCMProvider> { return this._onDidChangeProvider.event; }

	@memoize
	get input(): ISCMInput { return new SCMInput(); }

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IStorageService private storageService: IStorageService,
		@IStatusbarService private statusbarService: IStatusbarService
	) {
		this.updateFolderProvidersMap();
	}

	private setActiveSCMProvider(provider: ISCMProvider): void {
		this.activeProviderDisposable.dispose();

		if (!provider) {
			throw new Error('invalid provider');
		}

		if (provider && this._providers.indexOf(provider) === -1) {
			throw new Error('Provider not registered');
		}

		this._activeProvider = provider;

		this.activeProviderDisposable = provider.onDidChange(() => this.onDidProviderChange(provider));
		this.onDidProviderChange(provider);

		this._onDidChangeProvider.fire(provider);
	}

	registerSCMProvider(provider: ISCMProvider): IDisposable {
		this._providers.push(provider);

		const defaultProviderId = this.storageService.get(DefaultSCMProviderIdStorageKey, StorageScope.WORKSPACE);

		if (this._providers.length === 1 || defaultProviderId === provider.id) {
			this.setActiveSCMProvider(provider);
		}

		if (provider.rootFolder) {
			this.updateFolderProvidersMap();
		}

		const unregister = provider.onDidChange(() => this.onDidProviderChange(provider));
		this._onDidChangeProviders.fire();

		return toDisposable(() => {
			unregister.dispose();

			const index = this._providers.indexOf(provider);

			if (index < 0) {
				return;
			}

			this._providers.splice(index, 1);
			this.updateFolderProvidersMap();

			if (this.activeProvider === provider) {
				this.activeProvider = this._providers[0];
			}
		});
	}

	getProviderForResource(resource: URI): ISCMProvider | undefined {
		return this._folderProvidersMap.findSubstr(resource.toString());
	}

	private updateFolderProvidersMap(): void {
		this._folderProvidersMap = new TrieMap<ISCMProvider>(TrieMap.PathSplitter);
		for (const provider of this._providers) {
			if (provider.rootFolder) {
				this._folderProvidersMap.insert(provider.rootFolder.toString(), provider);
			}
		}
	}

	private onDidProviderChange(provider: ISCMProvider): void {
		this.statusBarDisposable.dispose();

		const commands = provider.statusBarCommands || [];
		const disposables = commands.map(c => this.statusbarService.addEntry({
			text: c.title,
			tooltip: c.tooltip,
			command: c.id
		}, MainThreadStatusBarAlignment.LEFT, 10000));

		this.statusBarDisposable = combinedDisposable(disposables);
	}
}