/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import * as paths from 'vs/base/common/paths';
import types = require('vs/base/common/types');
import { Disposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { INavService } from 'vs/workbench/services/nav/common/nav';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEditorInput, IResourceInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService, IResourceInputType } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IResourceResolverService } from 'vs/platform/resourceResolver/common/resourceResolver';
// tslint:disable-next-line:import-patterns
import { IFoldersWorkbenchService } from 'vs/workbench/parts/workspace/common/workspace';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { toResource } from 'vs/workbench/common/editor';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import * as querystring from 'querystring';
import { parseSelection } from 'vs/base/common/urlRoutes';
import { isCommonCodeEditor } from 'vs/editor/common/editorCommon';

export class NavService extends Disposable implements INavService {

	public _serviceBrand: any;

	private location: URI | undefined;

	private _onDidNavigate = new Emitter<URI>();
	public get onDidNavigate(): Event<URI> { return this._onDidNavigate.event; }

	constructor(
		id: string,
		@IWindowService private windowService: IWindowService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IHistoryService private historyService: IHistoryService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ISCMService private scmService: ISCMService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IMessageService private messageService: IMessageService,
		@IExtensionService private extensionService: IExtensionService,
		@IResourceResolverService private resourceResolverService: IResourceResolverService,
		@IFoldersWorkbenchService private foldersWorkbenchService: IFoldersWorkbenchService,
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.historyService.onDidChange(this.onHistoryChange, this));
	}

	public handle(location: URI): TPromise<void> {
		return TPromise.wrap(this.doHandle(location));
	}

	private async doHandle(location: URI): Promise<void> {
		type HandledURI = {
			repo?: string;
			vcs?: 'git';
			revision?: string;
			path?: string;
			selection?: string | string[];
			thread?: string;
		};

		// Without this, a %2B in the querystring will be decoded into a
		// space. We want it to be decoded into a '+'.
		if (location.query && location.query.indexOf('+') !== -1) {
			location = location.with({ query: location.query.replace(/\+/g, '%2B') });
		}
		const query = querystring.parse<HandledURI>(location.query);
		if (!query.repo) {
			return Promise.resolve(void 0);
		}
		await this.extensionService.onReady(); // extensions register resource resolvers
		await TPromise.timeout(1000); // HACK(sqs): wait for git extension to register resource resolver
		const resource = URI.parse(`${query.vcs}+${query.repo}`);
		const root = await this.resourceResolverService.resolveResource(resource);
		if (root === resource) {
			return;
		}
		await this.foldersWorkbenchService.addFoldersAsWorkspaceRootFolders([root]);

		// TODO(sqs): handle revision, need to avoid clobbering git state if != current revision
		if (!query.path) {
			return;
		}

		// TODO(sqs): wait for IPartService.joinCreation?
		const input: IResourceInput = {
			resource: URI.file(paths.join(root.fsPath, query.path)),
			options: { pinned: true },
		};
		if (query.selection) {
			// TODO(sqs): handle multiple selections
			const selection = parseSelection(types.isArray(query.selection) ? query.selection[0] : query.selection);
			if (selection) {
				input.options.selection = {
					startLineNumber: selection.startLineNumber,
					startColumn: selection.startColumn,
					endLineNumber: selection.endLineNumber,
					endColumn: selection.endColumn,
				};
			}
		}

		const editor = await this.editorService.openEditor(input);

		const threadId = parseInt(query.thread, 10);
		// TODO(nick): the returned editor is a TextFileEditor so isCommonCodeEditor is always false.
		if (!isCommonCodeEditor(editor) || !threadId) {
			return;
		}
		// CodeCommentsController.get(editor).restoreViewState({ openThreadIds: [threadId] });
	}

	public getLocation(): URI {
		return this.location;
	}

	public getShareableLocation(): string {
		const { stack, index } = this.historyService.getStack();
		const entry = stack[index];

		// TODO(sqs): support diffs
		const input = this.editorService.createInput(entry.input as (IEditorInput & IResourceInputType));
		const resource = toResource(input, { filter: 'file', supportSideBySide: true });
		if (!resource) {
			throw new Error(nls.localize('noResource', "Unable to determine the file or resource."));
		}

		const repository = this.scmService.getRepositoryForResource(resource);
		if (!repository || !repository.provider.remoteResources || repository.provider.remoteResources.length === 0) {
			throw new Error(nls.localize('noRepository', "Unable to determine the repository, which is necessary to make a shareable URL."));
		}

		let selection: string | undefined = undefined;
		if (entry.selection) {
			selection = `${entry.selection.startLineNumber}:${entry.selection.startColumn}`;
			if (entry.selection.endLineNumber) {
				selection += `-${entry.selection.endLineNumber}:${entry.selection.endColumn}`;
			}
		}

		const query = [
			`repo=${encodeURIComponent(repository.provider.remoteResources[0].toString())}`,
			'vcs=git',
			repository.provider.revision ? `revision=${encodeURIComponent(repository.provider.revision.specifier)}` : undefined,
			`path=${encodeURIComponent(paths.relative(repository.provider.rootFolder.fsPath, resource.fsPath))}`,
			selection ? `selection=${selection}` : undefined,
		].filter(v => !!v);
		// const uri = URI.from({ scheme: product.urlProtocol, path: 'open', query })
		return 'https://about.sourcegraph.com/open-native#open?' + query.join('&');
	}

	private onHistoryChange(): void {
		const { stack, index } = this.historyService.getStack();
		const entry = stack[index];

		if (entry) {
			const input = this.editorService.createInput(entry.input as (IEditorInput & IResourceInputType));
			// TODO(sqs): support generating URLs to diff views, not just to their master resource
			this.location = toResource(input, { filter: 'file', supportSideBySide: true });
		}
	}
}
