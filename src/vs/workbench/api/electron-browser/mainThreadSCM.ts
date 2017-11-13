/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { join as joinPath } from 'path';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import Event, { Emitter } from 'vs/base/common/event';
import { assign } from 'vs/base/common/objects';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ISCMService, ISCMRepository, ISCMRevision, ICommandOptions, ISCMProvider, ISCMResource, ISCMResourceGroup, ISCMResourceDecorations, ISCMResourceCollection, ISCMResourceSplice } from 'vs/workbench/services/scm/common/scm';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ExtHostContext, MainThreadSCMShape, ExtHostSCMShape, SCMProviderFeatures, SCMRawResourceSplices, SCMGroupFeatures, MainContext, IExtHostContext } from '../node/extHost.protocol';
import { Command } from 'vs/editor/common/modes';
import { extHostNamedCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { EDITOR_CONTRIBUTION_ID as CODE_COMMENTS_CONTRIBUTION_ID, ICodeCommentsService, IThreads } from 'vs/editor/browser/services/codeCommentsService';
import { rtrim } from 'vs/base/common/strings';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { VIEWLET_ID as SCM_VIEWLET_ID } from 'vs/workbench/parts/scm/common/scm';
import { SCMViewlet } from 'vs/workbench/parts/scm/electron-browser/scmViewlet';
import { ICodeEditorService, getCodeEditor } from 'vs/editor/browser/services/codeEditorService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

class MainThreadSCMResourceCollection implements ISCMResourceCollection {

	readonly resources: ISCMResource[] = [];

	private _onDidSplice = new Emitter<ISCMResourceSplice>();
	readonly onDidSplice = this._onDidSplice.event;

	splice(start: number, deleteCount: number, resources: ISCMResource[]) {
		this.resources.splice(start, deleteCount, ...resources);
		this._onDidSplice.fire({ start, deleteCount, resources });
	}
}

class MainThreadSCMResourceGroup implements ISCMResourceGroup {

	readonly resourceCollection = new MainThreadSCMResourceCollection();
	get hideWhenEmpty(): boolean { return this.features.hideWhenEmpty; }

	constructor(
		private sourceControlHandle: number,
		private handle: number,
		public provider: ISCMProvider,
		public features: SCMGroupFeatures,
		public label: string,
		public id: string
	) { }

	toJSON(): any {
		return {
			$mid: 4,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.handle
		};
	}
}

class MainThreadSCMResource implements ISCMResource {

	constructor(
		private proxy: ExtHostSCMShape,
		private sourceControlHandle: number,
		private groupHandle: number,
		private handle: number,
		public sourceUri: URI,
		public resourceGroup: ISCMResourceGroup,
		public decorations: ISCMResourceDecorations
	) { }

	open(): TPromise<void> {
		return this.proxy.$executeResourceCommand(this.sourceControlHandle, this.groupHandle, this.handle);
	}

	toJSON(): any {
		return {
			$mid: 3,
			sourceControlHandle: this.sourceControlHandle,
			groupHandle: this.groupHandle,
			handle: this.handle
		};
	}
}

class MainThreadSCMProvider implements ISCMProvider {

	private static ID_HANDLE = 0;
	private _id = `scm${MainThreadSCMProvider.ID_HANDLE++}`;
	get id(): string { return this._id; }

	private _groups: MainThreadSCMResourceGroup[] = [];
	private _groupsByHandle: { [handle: number]: MainThreadSCMResourceGroup; } = Object.create(null);

	protected get groups(): MainThreadSCMResourceGroup[] {
		return this._groups;
	}

	get resources(): ISCMResourceGroup[] {
		return this._groups
			.filter(g => g.resourceCollection.resources.length > 0 || !g.features.hideWhenEmpty);
	}

	private _onDidChangeResources = new Emitter<void>();
	get onDidChangeResources(): Event<void> { return this._onDidChangeResources.event; }

	private features: SCMProviderFeatures = {};

	get handle(): number { return this._handle; }
	get label(): string { return this._label; }
	get rootUri(): URI | undefined { return this._rootUri; }
	get contextValue(): string { return this._contextValue; }
	get revision(): ISCMRevision | undefined { return this.features.revision; }

	get commitTemplate(): string | undefined { return this.features.commitTemplate; }
	get acceptInputCommand(): Command | undefined { return this.features.acceptInputCommand; }
	get acceptSpecifierCommand(): Command | undefined { return this.features.acceptSpecifierCommand; }
	get statusBarCommands(): Command[] | undefined { return this.features.statusBarCommands; }
	get count(): number | undefined { return this.features.count; }
	get setRevisionCommand(): Command | undefined { return this.features.setRevisionCommand; }
	get remoteResources(): URI[] | undefined { return this.features.remoteResources; }

	private _onDidChangeCommitTemplate = new Emitter<string>();
	get onDidChangeCommitTemplate(): Event<string> { return this._onDidChangeCommitTemplate.event; }

	private _onDidChange = new Emitter<void>();
	get onDidChange(): Event<void> { return this._onDidChange.event; }

	constructor(
		private proxy: ExtHostSCMShape,
		private _handle: number,
		private _contextValue: string,
		private _label: string,
		private _rootUri: URI | undefined,
		@ISCMService scmService: ISCMService
	) { }

	$updateSourceControl(features: SCMProviderFeatures): void {
		this.features = assign(this.features, features);
		this._onDidChange.fire();

		if (typeof features.commitTemplate !== 'undefined') {
			this._onDidChangeCommitTemplate.fire(this.commitTemplate);
		}
	}

	$registerGroup(handle: number, id: string, label: string): void {
		const group = new MainThreadSCMResourceGroup(
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

	$updateGroup(handle: number, features: SCMGroupFeatures): void {
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
				console.warn(`SCM group ${groupHandle} not found in provider ${this.label}`);
				continue;
			}

			// reverse the splices sequence in order to apply them correctly
			groupSlices.reverse();

			for (const [start, deleteCount, rawResources] of groupSlices) {
				const resources = rawResources.map(rawResource => {
					const [handle, sourceUri, icons, tooltip, strikeThrough, faded, source, letter, color] = rawResource;
					const icon = icons[0];
					const iconDark = icons[1] || icon;
					const decorations = {
						icon: icon && URI.parse(icon),
						iconDark: iconDark && URI.parse(iconDark),
						tooltip,
						strikeThrough,
						faded,
						source,
						letter,
						color: color && color.id
					};

					return new MainThreadSCMResource(
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

	getOriginalResource(uri: URI): TPromise<URI> {
		if (!this.features.hasQuickDiffProvider) {
			return TPromise.as(null);
		}

		return this.proxy.$provideOriginalResource(this.handle, uri);
	}

	executeCommand(args: string[], options?: ICommandOptions): TPromise<string> {
		return this.proxy.$executeCommand(this.handle, args, options);
	};

	toJSON(): any {
		return {
			$mid: 5,
			handle: this.handle
		};
	}

	dispose(): void {

	}
}

/**
 * This magic constant serves three purposes:
 *   1. Prevent the comparison source control from actually being associated with any files.
 *   2. Allow the main thread to strip this suffix to find out the "real" directory that this
 *      compare control is associated with (this is necessary to inject comments as a group).
 *   3. Achieve not terrible formatting for the name in the source control list.
 *
 * The same constant is also defined and used in the Git extension.
 */
export const MAGIC_COMPARISON_ROOT_SUFFIX = '  ';

/**
 * This SCM provider injects comment threads as a group
 * for comparison SCM providers.
 */
class CommentsSCMProvider extends MainThreadSCMProvider {

	private commentsGroup: MainThreadSCMResourceGroup | undefined;
	private trimmedRootUri: URI;
	private branch: string | undefined;

	constructor(
		proxy: ExtHostSCMShape,
		_handle: number,
		_contextValue: string,
		_label: string,
		_rootUri: URI | undefined,
		@ISCMService scmService: ISCMService,
		@ICodeCommentsService private commentsService: ICodeCommentsService,
		@IEditorService private editorService: IEditorService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
	) {
		super(proxy, _handle, _contextValue, _label, _rootUri, scmService);
		if (_contextValue === 'gitcomparison') {
			this.trimmedRootUri = this.rootUri.with({ path: rtrim(this.rootUri.path, MAGIC_COMPARISON_ROOT_SUFFIX) });
			this.commentsGroup = new MainThreadSCMResourceGroup(
				this.handle,
				-999, // something that will never be used by a real extension
				this,
				{ hideWhenEmpty: true },
				localize('discussions', "Discussions"),
				'discussions',
			);
			this.groups.push(this.commentsGroup);
		}
	}

	$updateSourceControl(features: SCMProviderFeatures): void {
		super.$updateSourceControl(features);
		if (!this.commentsGroup) {
			return;
		}
		const branch = this.revision && this.revision.specifier;
		if (this.branch !== branch) {
			this.branch = branch;
			this.onDidChangeBranch();
		}
	}

	$registerGroup(handle: number, id: string, label: string): void {
		super.$registerGroup(handle, id, label);
		if (!this.commentsGroup) {
			return;
		}
		// Make sure comments group is always last.
		const idx = this.groups.indexOf(this.commentsGroup);
		this.groups.splice(idx, 1);
		this.groups.push(this.commentsGroup);
	}

	private branchComments: IThreads;

	private onDidChangeBranch(): void {
		this.branchComments = dispose(this.branchComments);
		if (!this.branch) {
			return;
		}
		this.branchComments = this.commentsService.getThreads({ resource: this.trimmedRootUri, branch: this.branch });
		this.refreshBranchComments();
		this.branchComments.onDidChangeThreads(this.onDidChangeThreads, this);
		this.onDidChangeThreads();
	}

	public focus(): void {
		this.refreshBranchComments();
	}

	private refreshBranchComments(): void {
		if (this.branchComments) {
			this.branchComments.refresh();
		}
	}

	private onDidChangeThreads(): void {
		const resources: ISCMResource[] = this.branchComments.threads
			.filter(thread => thread.comments.length > 0) // Filter out share links
			.map(thread => {
				// This is a nasty hack to get thread titles to not break if they have slashes in them.
				// We are shoving the thread titles through the path of a URI, so a slash
				// breaks formatting. Instead, we replace slashes with a "DIVISION SLASH"
				// which looks like a slash and we add a trailing space for formatting purposes.
				// The real solution is to modify the SCM api to allow us to specify label/sublabel directly
				// instead of just passing through a URI.
				const path = joinPath(thread.file, thread.title.replace('/', '\u2215 '));
				const sourceUri = URI.from({ scheme: 'thread', path });
				return {
					resourceGroup: this.commentsGroup,
					sourceUri,
					decorations: {
						strikeThrough: thread.archived,
						faded: false,
						tooltip: '',
					},
					open: async (): TPromise<void> => {
						const resource = this.trimmedRootUri.with({ path: this.trimmedRootUri.path + thread.file });
						const editor = await this.openEditor(resource);
						const codeCommentsContribution = editor.getContribution(CODE_COMMENTS_CONTRIBUTION_ID);
						codeCommentsContribution.restoreViewState({ openThreadIds: [thread.id], revealThreadId: thread.id });
					}
				};
			});
		const collection = this.commentsGroup.resourceCollection;
		collection.splice(0, collection.resources.length, resources);

		// This is just to get our superclass to fire the appropriate event.
		super.$spliceGroupResourceStates([]);
	}

	private async openEditor(resource: URI): TPromise<ICodeEditor> {
		const resourceString = resource.toString();
		// First try to find and open the relevant diff editor.
		for (const group of this.groups) {
			if (group === this.commentsGroup) {
				// No point in searching through our comments group.
				continue;
			}
			for (const scmResource of group.resourceCollection.resources) {
				if (scmResource.sourceUri.toString() === resourceString) {
					await scmResource.open();
					// Unfortunately the diff editor doesn't yet have focus and the open command
					// doesn't return anything useful. We have to loop over all diff editors to
					// find the one we just opened.
					const diffEditors = this.codeEditorService.listDiffEditors();
					for (const diffEditor of diffEditors) {
						const model = diffEditor.getModifiedEditor().getModel();
						if (model && resourceString === model.uri.toString()) {
							return diffEditor.getModifiedEditor();
						}
					}
				}
			}
		}
		// This is a thread on a file that doesn't currently have a diff.
		// Just open a normal editor for it.
		const editor = await this.editorService.openEditor({ resource });
		return getCodeEditor(editor);
	}

	public dispose(): void {
		this.branchComments = dispose(this.branchComments);
		super.dispose();
	}
}

@extHostNamedCustomer(MainContext.MainThreadSCM)
export class MainThreadSCM implements MainThreadSCMShape {

	private _proxy: ExtHostSCMShape;
	private _repositories: { [handle: number]: ISCMRepository; } = Object.create(null);
	private _inputDisposables: { [handle: number]: IDisposable; } = Object.create(null);
	private _disposables: IDisposable[] = [];

	constructor(
		extHostContext: IExtHostContext,
		@IViewletService private viewletService: IViewletService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ISCMService private scmService: ISCMService,
	) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostSCM);
	}

	dispose(): void {
		Object.keys(this._repositories)
			.forEach(id => this._repositories[id].dispose());
		this._repositories = Object.create(null);

		Object.keys(this._inputDisposables)
			.forEach(id => this._inputDisposables[id].dispose());
		this._inputDisposables = Object.create(null);

		this._disposables = dispose(this._disposables);
	}

	$registerSourceControl(handle: number, id: string, label: string, rootUri: string | undefined): void {
		const provider = this.instantiationService.createInstance(CommentsSCMProvider, this._proxy, handle, id, label, rootUri && URI.parse(rootUri));
		const repository = this.scmService.registerSCMProvider(provider);
		this._repositories[handle] = repository;

		const inputDisposable = repository.input.onDidChange(value => this._proxy.$onInputBoxValueChange(handle, value));
		this._inputDisposables[handle] = inputDisposable;
	}

	$updateSourceControl(handle: number, features: SCMProviderFeatures): void {
		const repository = this._repositories[handle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateSourceControl(features);
	}

	$unregisterSourceControl(handle: number): void {
		const repository = this._repositories[handle];

		if (!repository) {
			return;
		}

		this._inputDisposables[handle].dispose();
		delete this._inputDisposables[handle];

		repository.dispose();
		delete this._repositories[handle];
	}

	$registerGroup(sourceControlHandle: number, groupHandle: number, id: string, label: string): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$registerGroup(groupHandle, id, label);
	}

	$updateGroup(sourceControlHandle: number, groupHandle: number, features: SCMGroupFeatures): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateGroup(groupHandle, features);
	}

	$updateGroupLabel(sourceControlHandle: number, groupHandle: number, label: string): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$updateGroupLabel(groupHandle, label);
	}

	$spliceResourceStates(sourceControlHandle: number, splices: SCMRawResourceSplices[]): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$spliceGroupResourceStates(splices);
	}

	$unregisterGroup(sourceControlHandle: number, handle: number): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const provider = repository.provider as MainThreadSCMProvider;
		provider.$unregisterGroup(handle);
	}

	$setInputBoxValue(sourceControlHandle: number, value: string): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		repository.input.value = value;
	}

	$setInputBoxPlaceholder(sourceControlHandle: number, placeholder: string): void {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		repository.input.placeholder = placeholder;
	}

	async $select(sourceControlHandle: number): Promise<void> {
		const repository = this._repositories[sourceControlHandle];

		if (!repository) {
			return;
		}

		const scmViewlet = await this.viewletService.resolveViewlet(SCM_VIEWLET_ID) as SCMViewlet;
		scmViewlet.select(repository);
	}
}
