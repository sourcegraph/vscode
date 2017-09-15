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
import product from 'vs/platform/node/product';
import Event, { Emitter } from 'vs/base/common/event';
import { INavService } from 'vs/workbench/services/nav/common/nav';
import { IEditorInput, IResourceInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService, IResourceInputType } from 'vs/workbench/services/editor/common/editorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IResourceResolverService } from 'vs/platform/resourceResolver/common/resourceResolver';
import { IFoldersWorkbenchService } from 'vs/workbench/services/folders/common/folders';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { toResource } from 'vs/workbench/common/editor';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import * as querystring from 'querystring';
import { parseSelection, formatSelection } from 'vs/base/common/urlRoutes';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { ISelection } from 'vs/editor/common/core/selection';
import { EDITOR_CONTRIBUTION_ID as CODE_COMMENTS_CONTRIBUTION_ID } from 'vs/editor/common/services/codeCommentsService';

export class NavService extends Disposable implements INavService {

	public _serviceBrand: any;

	private location: URI | undefined;

	private _onDidNavigate = new Emitter<URI | undefined>();
	public get onDidNavigate(): Event<URI | undefined> { return this._onDidNavigate.event; }

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IHistoryService private historyService: IHistoryService,
		@ISCMService private scmService: ISCMService,
		@ITelemetryService private telemetryService: ITelemetryService,
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
		// TODO(sqs): telemetry
		return TPromise.wrap(this.doHandle(location));
	}

	private async doHandle(location: URI): Promise<void> {
		// Extract the non-shareable URI from a shareable about.sourcegraph.com URL.
		if (location.scheme === 'https' && location.authority === 'about.sourcegraph.com' && location.path.indexOf('/open-native') === 0) {
			location = URI.parse(`${product.urlProtocol}:${decodeURIComponent(location.fragment)}`);
		}

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

		if (!query.vcs) {
			query.vcs = 'git';
		}

		// Wait for all extensions to register resource resolvers.
		//
		// TODO(sqs): add resource resolver-specific activation events for extensions so that they
		// don't all need to be always (eagerly) activated (i.e., '*')
		await this.extensionService.onReady(); // extensions register resource resolvers
		await this.extensionService.activateByEvent('*');

		const resource = URI.parse(`${query.vcs}+${query.repo}`);
		const [root] = await this.foldersWorkbenchService.addFoldersAsWorkspaceRootFolders([resource]);

		// TODO(sqs): handle revision, need to avoid clobbering git state if != current revision
		if (!query.path) {
			return;
		}

		// TODO(sqs): wait for IPartService.joinCreation?
		const input: IResourceInput = {
			resource: URI.file(paths.join(root.fsPath, query.path)),
			options: {
				pinned: true,
				revealIfVisible: true,
				revealInCenterIfOutsideViewport: true,
			},
		};

		let selections: ISelection[] = [];
		if (query.selection) {
			let selectionStrings: string[];
			if (types.isArray(query.selection)) {
				selectionStrings = query.selection;
			} else {
				selectionStrings = query.selection.split(',');
			}

			const ranges = selectionStrings.filter(s => !!s).map(parseSelection);
			if (ranges.length) {
				// Immediately open the first selection (after openEditor resolves, we'll
				// set the other selections if there's more than 1).
				input.options.selection = {
					startLineNumber: ranges[0].startLineNumber,
					startColumn: ranges[0].startColumn,
					endLineNumber: ranges[0].endLineNumber,
					endColumn: ranges[0].endColumn,
				};
			}

			selections = ranges.map(sel => ({
				selectionStartLineNumber: sel.startLineNumber,
				selectionStartColumn: sel.startColumn,
				positionLineNumber: sel.endLineNumber,
				positionColumn: sel.endColumn,
			} as ISelection));
		}

		const editor = await this.editorService.openEditor(input);
		const control = getCodeEditor(editor);
		if (!control) {
			return;
		}

		if (selections.length > 1) {
			control.setSelections(selections);
		}

		const threadId = parseInt(query.thread, 10);
		if (threadId) {
			const codeCommentsContribution = control.getContribution(CODE_COMMENTS_CONTRIBUTION_ID);
			codeCommentsContribution.restoreViewState({ openThreadIds: [threadId], revealThreadId: threadId });
		}
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

		// Get the selection directly from the editor because the history service only records
		// positions, not selections.
		let selection: string | undefined = undefined;
		const control = getCodeEditor(this.editorService.getActiveEditor());
		if (control) {
			selection = control.getSelections().map(formatSelection).filter(s => !!s).join(',');
		}
		const query = [
			`repo=${encodeURIComponent(repository.provider.remoteResources[0].toString())}`,
			'vcs=git',
			repository.provider.revision ? `revision=${encodeURIComponent(repository.provider.revision.specifier)}` : undefined,
			`path=${encodeURIComponent(paths.relative(repository.provider.rootUri.fsPath, resource.fsPath))}`,
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
		} else {
			this.location = undefined;
		}

		this._onDidNavigate.fire(this.location);
	}
}
