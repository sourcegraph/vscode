/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/folderActions';
import URI from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { any } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IFolder } from 'vs/workbench/parts/workspace/common/workspace';
import { ISCMService, ISCMRepository, ISCMRevision, setSCMProviderRevision } from 'vs/workbench/services/scm/common/scm';
import { ICommandService } from 'vs/platform/commands/common/commands';

export abstract class FolderSCMRevisionAction extends Action {

	private resolvedClass: string;
	private resolvingClass: string;

	private disposables: IDisposable[] = [];
	private _folder: URI;
	set folderResource(folder: URI) {
		if (this._folder !== folder) {
			this._folder = folder;
			this.updateRepository();
			this.update();
		}
	}
	set folder(folder: IFolder) {
		this.folderResource = folder ? folder.resource : undefined;
	}

	protected repository?: ISCMRepository;
	private repositoryDisposable?: IDisposable;

	constructor(
		id: string,
		cssClass: string,
		@ISCMService private scmService: ISCMService,
		@ICommandService private commandService: ICommandService,
	) {
		super(id, undefined, `${cssClass} scm-revision`, false);

		this.resolvedClass = this.class;
		this.resolvingClass = `${this.class} resolving`;

		const onDidChangeSCM = any(this.scmService.onDidChangeRepository, this.scmService.onDidAddRepository, this.scmService.onDidRemoveRepository);
		this.disposables.push(onDidChangeSCM(() => {
			this.updateRepository();
			this.update();
		}));
		this.updateRepository();
		this.update();
	}

	private updateRepository(): void {
		let repository: ISCMRepository | undefined;
		if (this._folder) {
			repository = this.scmService.getRepositoryForResource(this._folder);
		}

		// Disable for resources underneath the repository root.
		if (repository && repository.provider.rootFolder && repository.provider.rootFolder.toString() !== this._folder.toString()) {
			repository = undefined;
		}

		if (this.repository === repository) {
			return;
		}

		// Clear old provider.
		this.repository = undefined;
		if (this.repositoryDisposable) {
			this.repositoryDisposable.dispose();
		}
		this.repositoryDisposable = undefined;

		if (repository) {
			this.repository = repository;
			this.repositoryDisposable = this.repository.provider.onDidChange(() => this.update());
		}
	}

	protected update(): void {
		if (!this._folder) {
			this.enabled = false;
			this.class = this.resolvedClass;
			this.label = '';
			return;
		}

		if (!this.repository || !this.repository.provider.revision) {
			this.enabled = false;
			this.class = this.resolvedClass;
			this.label = '';
			return;
		}

		const revision = this.repository.provider.revision;
		if (!revision.id) {
			// Not yet resolved.
			//
			// TODO(sqs): handle case where the raw revision specifier failed to resolve.
			this.enabled = false;
			this.class = this.resolvingClass;
			this.label = '';
			return;
		}

		this.enabled = true;
		this.class = this.resolvedClass;
		this.label = '';
	}

	run(): TPromise<any> {
		return setSCMProviderRevision(this.commandService, this.repository.provider);
	}

	dispose(): void {
		super.dispose();

		if (this.repositoryDisposable) {
			this.repositoryDisposable.dispose();
		}

		this.disposables = dispose(this.disposables);
	}
}

export class FolderSCMSwitchRevisionAction extends FolderSCMRevisionAction {

	constructor(
		@ISCMService scmService: ISCMService,
		@ICommandService commandService: ICommandService,
	) {
		super('workspace.folder.scm.switchRevision', 'folder-action', scmService, commandService);
	}

	protected update(): void {
		super.update();

		this.label = localize('switchFolderSCMRevision', "Switch SCM Revision");
	}
}

export class FolderSCMRevisionLabelAction extends FolderSCMRevisionAction {

	constructor(
		@ISCMService scmService: ISCMService,
		@ICommandService commandService: ICommandService,
	) {
		super('workspace.folder.scm.revisionLabel', 'folder-label tag', scmService, commandService);

		this.tooltip = localize('folderSCMRevisionLabel.tooltip', "Switch SCM Revision...");
	}

	protected update(): void {
		super.update();

		if (!this.enabled) {
			return;
		}

		this.label = this.revisionLabel(this.repository.provider.revision);
	}

	private revisionLabel(revision: ISCMRevision): string {
		// TODO(sqs): this is git-specific
		const GIT_OID_LENGTH = 40;
		const GIT_OID_ABBREV_LENGTH = 6;

		const isSHA = (!revision.specifier || revision.specifier === revision.id) && revision.id.length === GIT_OID_LENGTH;
		let label: string;
		if (isSHA) {
			label = revision.id.slice(0, GIT_OID_ABBREV_LENGTH);
		} else if (revision.specifier) {
			label = revision.specifier.replace(/^refs\/(heads|tags)\//, '');
		} else {
			label = '';
		}
		return label;
	}
}
