/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { basename } from 'vs/base/common/paths';
import { format } from 'vs/base/common/strings';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { ISCMProvider, ISCMResourceGroup, ISCMRevision, ISCMResource, ISCMResourceDecorations } from 'vs/workbench/services/scm/common/scm';
import { Command } from 'vs/editor/common/modes';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

export enum Status {
	Unknown,
	Added,
	Copied,
	Deleted,
	Modified,
	Renamed,
}

export interface IResource {
	fromUri: URI;
	toUri: URI;
	from: ISCMRevision;
	to: ISCMRevision;
	status: Status;
}

CommandsRegistry.registerCommand('sg.scmOpen', function (accessor: ServicesAccessor, resource: URI) {
	const editorService = accessor.get(IWorkbenchEditorService);
	return editorService.openEditor({ resource, options: { preserveFocus: true } }).then(() => void 0);
});

class Resource implements ISCMResource {

	constructor(
		public resourceGroup: ISCMResourceGroup,
		private resource: IResource,
	) { }

	public get sourceUri(): URI {
		return this.resource.toUri;
	}

	public get command(): Command {
		switch (this.resource.status) {
			case Status.Added:
				return {
					id: 'sg.scmOpen',
					arguments: [this.resource.toUri],
					title: localize('open', 'Open'),
				};
			case Status.Deleted:
				return {
					id: 'sg.scmOpen',
					arguments: [this.resource.fromUri],
					title: localize('open', 'Open'),
				};
			case Status.Copied:
			case Status.Renamed:
			case Status.Modified:
			case Status.Unknown:
				return {
					id: 'vscode.diff',
					title: localize('openDiff', 'Open diff'),
					arguments: [this.resource.fromUri, this.resource.toUri, this.getTabName(), { preview: true }],
				};
		}
	}

	public get decorations(): ISCMResourceDecorations {
		const icon = this.getIconPath('light');
		const iconDark = this.getIconPath('dark');
		const strikeThrough = this.resource.status === Status.Deleted;
		return { icon, iconDark, strikeThrough, faded: false };
	}

	private getIconPath(theme: string): URI {
		return URI.parse(require.toUrl(`./resources/icons/${theme}/${this.getIconName()}.svg`));
	}

	private getIconName(): string {
		switch (this.resource.status) {
			case Status.Added:
				return 'status-added';
			case Status.Copied:
				return 'status-copied';
			case Status.Deleted:
				return 'status-deleted';
			case Status.Renamed:
				return 'status-renamed';
			case Status.Modified:
			case Status.Unknown:
				return 'status-modified';
		}
	}

	private getTabName(): string {
		const name = basename(this.resource.toUri.path);
		const was = basename(this.resource.fromUri.path);
		switch (this.resource.status) {
			case Status.Added:
				return format(localize('tabNameStatusAdded', '{0} (added)'), name);
			case Status.Copied:
				return format(localize('tabNameStatusCopied', '{0} (copied from {1})'), name, was);
			case Status.Deleted:
				return format(localize('tabNameStatusDeleted', '{0} (deleted)'), name);
			case Status.Renamed:
				return format(localize('tabNameStatusRenamed', '{0} (renamed from {1})'), name, was);
			case Status.Modified:
			case Status.Unknown:
				const from = this.resource.from.rawSpecifier === this.resource.from.id ?
					this.resource.from.id.slice(0, 6) :
					this.resource.from.rawSpecifier;
				return format(localize('tabNameStatusModified', '{0} (since {1})'), name, from);
		}
	}
}

/**
* A convenience base class for ISCMProvider implementations in the main thread. It is not
* necessary for implementations to extend this class.
*/
export abstract class AbstractSCMProvider implements ISCMProvider {
	private _onDidChange = new Emitter<void>();

	private _revision: ISCMRevision;
	protected revisionLastResolutionError: boolean;
	private _pendingUpdate?: TPromise<any>;
	private _resources: ISCMResourceGroup[] = [];
	private _diffBase: ISCMRevision;

	constructor(
		public readonly id: string,
		public readonly label: string,
	) { }

	get onDidChange(): Event<void> { return this._onDidChange.event; }

	dispose(): void { }

	get resources(): ISCMResourceGroup[] {
		return this._resources;
	}

	abstract executeCommand(args: string[]): TPromise<string>;

	abstract getOriginalResource(uri: URI): TPromise<URI>;

	get revision(): ISCMRevision { return this._revision; }

	abstract resolveRevision(input: ISCMRevision): TPromise<ISCMRevision>;

	private getResolvedRevision(input: ISCMRevision): TPromise<ISCMRevision> {
		if (input && input.id) {
			return TPromise.as(input);
		}
		return this.resolveRevision(input);
	}

	abstract getDiff(from: ISCMRevision, to: ISCMRevision): TPromise<IResource[]>;

	get diffBase(): ISCMRevision {
		return this._diffBase;
	}

	setDiffBase(input: ISCMRevision): TPromise<void> {
		if (this._diffBase && this._diffBase.rawSpecifier === input.rawSpecifier) {
			return TPromise.as(void 0);
		}
		this._diffBase = input;

		return this.ready()
			.then(() => this.getResolvedRevision(input))
			.then(from => this.getDiff(from, this.revision))
			.then(diff => {
				const resourceGroup: ISCMResourceGroup = {
					provider: this,
					label: localize('changes', 'Changes'),
					id: 'changes',
					resources: [],
				};

				for (const resource of diff) {
					resourceGroup.resources.push(new Resource(resourceGroup, resource));
				}

				this._resources = [resourceGroup];
				this._onDidChange.fire();
			});
	}


	setRevision(input: ISCMRevision): TPromise<ISCMRevision> {
		if (this._pendingUpdate) { return TPromise.wrapError(new Error('pending operation')); }

		const resolved = this.getResolvedRevision(input);
		this._pendingUpdate = resolved.then(revision => {
			const changed = !this._revision || (this._revision.rawSpecifier !== revision.rawSpecifier || this._revision.specifier !== revision.specifier || this._revision.id !== revision.id);
			this._revision = revision;
			this.revisionLastResolutionError = false;
			this._pendingUpdate = undefined;
			if (changed) {
				this._onDidChange.fire();
			}
			return revision;
		}, err => {
			this._pendingUpdate = undefined;
			this.revisionLastResolutionError = true;
			this._onDidChange.fire();
			return TPromise.wrapError(err);
		});
		return this._pendingUpdate;
	}

	ready(): TPromise<void> {
		if (this._pendingUpdate) {
			return this._pendingUpdate.then(() => this.ready());
		}
		return TPromise.as(void 0);
	}
}