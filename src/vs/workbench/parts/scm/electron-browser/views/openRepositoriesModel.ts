/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event, { Emitter, any } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { memoize } from 'vs/base/common/decorators';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';

/**
 * Represents the state of open SCM repositories.
 */
export interface IOpenRepositoriesModel {
	/**
	 * All open SCM repositories.
	 */
	readonly repositories: ISCMRepository[];

	/**
	 * The current active repository, if any.
	 **/
	activeRepository: ISCMRepository | undefined;

	/**
	 * An event that is fired when an SCM repository is added.
	 */
	readonly onDidAddRepository: Event<ISCMRepository>;

	/**
	 * An event that is fired when an SCM repository is removed.
	 */
	readonly onDidRemoveRepository: Event<ISCMRepository>;

	/**
	 * An event that is fired when an SCM repository is changed.
	 */
	readonly onDidChangeRepository: Event<ISCMRepository>;

	/**
	 * An event that is fired when any one of onDid{Add,Remove,Change}Repository is fired.
	 */
	readonly onDidUpdateRepositories: Event<void>;

	/**
	 * An event that is fired when the active SCM repository changes.
	 */
	readonly onDidChangeActiveRepository: Event<ISCMRepository>;

	/**
	 * Returns the number of pending changes in all resource groups in the SCM repository.
	 */
	getPendingChangesCount(repository: ISCMRepository): number;
}

export class OpenRepositoriesModel implements IOpenRepositoriesModel, IDisposable {
	private _activeRepository: ISCMRepository | undefined;
	private disposables: IDisposable[] = [];

	private _onDidChangeActiveRepository = new Emitter<ISCMRepository>();
	public readonly onDidChangeActiveRepository = this._onDidChangeActiveRepository.event;

	constructor(
		@ISCMService private scmService: ISCMService,
	) {
		this.registerListeners();

		this._activeRepository = this.scmService.repositories[0];
	}

	private registerListeners(): void {
		// Always have an active repository.
		this.disposables.push(this.onDidAddRepository(repository => {
			if (!this.activeRepository) {
				this.activeRepository = repository;
			}
		}));

		this.disposables.push(this.onDidRemoveRepository(repository => {
			if (repository === this.activeRepository) {
				this.activeRepository = this.scmService.repositories[0];
			}
		}));
	}

	get activeRepository(): ISCMRepository | undefined {
		return this._activeRepository;
	}

	set activeRepository(repository: ISCMRepository | undefined) {
		if (repository !== this._activeRepository) {
			this._activeRepository = repository;
			this._onDidChangeActiveRepository.fire(repository);
		}
	}

	public get repositories(): ISCMRepository[] {
		return this.scmService.repositories;
	}

	public get onDidAddRepository(): Event<ISCMRepository> {
		return this.scmService.onDidAddRepository;
	}

	public get onDidRemoveRepository(): Event<ISCMRepository> {
		return this.scmService.onDidRemoveRepository;
	}

	public get onDidChangeRepository(): Event<ISCMRepository> {
		return this.scmService.onDidChangeRepository;
	}

	@memoize
	public get onDidUpdateRepositories(): Event<void> {
		return any<void>(
			this.scmService.onDidAddRepository as Event<any>,
			this.scmService.onDidChangeRepository as Event<any>,
			this.scmService.onDidRemoveRepository as Event<any>,
		);
	}

	public getPendingChangesCount(repository: ISCMRepository): number {
		if (typeof repository.provider.count === 'number') {
			return repository.provider.count;
		}
		return repository.provider.resources.reduce((r, g) => r + g.resources.length, 0);
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}