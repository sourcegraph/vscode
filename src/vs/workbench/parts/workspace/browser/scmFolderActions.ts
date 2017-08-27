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
import { ISCMService, ISCMProvider, ISCMRevision, setSCMProviderRevision } from 'vs/workbench/services/scm/common/scm';
import { ICommandService } from 'vs/platform/commands/common/commands';

export abstract class FolderSCMRevisionAction extends Action {

	private resolvedClass: string;
	private resolvingClass: string;

	private disposables: IDisposable[] = [];
	private _folder: URI;
	set folderResource(folder: URI) {
		if (this._folder !== folder) {
			this._folder = folder;
			this.updateSCMProvider();
			this.update();
		}
	}
	set folder(folder: IFolder) {
		this.folderResource = folder ? folder.uri : undefined;
	}

	protected scmProvider?: ISCMProvider;
	private scmProviderDisposable?: IDisposable;

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
			this.updateSCMProvider();
			this.update();
		}));
		this.updateSCMProvider();
		this.update();
	}

	private updateSCMProvider(): void {
		let provider: ISCMProvider | undefined;
		if (this._folder) {
			provider = this.scmService.getProviderForResource(this._folder);
		}

		if (this.scmProvider === provider) {
			return;
		}

		// Clear old provider.
		this.scmProvider = undefined;
		if (this.scmProviderDisposable) {
			this.scmProviderDisposable.dispose();
		}
		this.scmProviderDisposable = undefined;

		if (provider) {
			this.scmProvider = provider;
			this.scmProviderDisposable = this.scmProvider.onDidChange(() => this.update());
		}
	}

	protected update(): void {
		console.log('SCM revision label update', this._folder && this._folder.toString(), this.scmProvider && this.scmProvider.revision);

		if (!this._folder) {
			this.enabled = false;
			this.class = this.resolvedClass;
			this.label = '';
			return;
		}

		if (!this.scmProvider || !this.scmProvider.revision) {
			this.enabled = false;
			this.class = this.resolvedClass;
			this.label = '';
			return;
		}

		const revision = this.scmProvider.revision;
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
		return setSCMProviderRevision(this.commandService, this.scmProvider);
	}

	dispose(): void {
		super.dispose();

		if (this.scmProviderDisposable) {
			this.scmProviderDisposable.dispose();
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

		this.label = this.revisionLabel(this.scmProvider.revision);
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
