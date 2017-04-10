/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nico T. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// There's actually nothing in here that depends on Node.
import { WalkThroughInput } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughInput'; //tslint:disable-line

import 'vs/css!./searchPage';
import URI from 'vs/base/common/uri';
import { $, Builder } from 'vs/base/browser/builder';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError } from 'vs/base/common/errors';
import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { QueryType, ISearchQuery } from 'vs/platform/search/common/search';
import { ISearchWorkbenchService, FileMatch } from 'vs/workbench/parts/search/common/searchModel';
import { FileMatchView } from 'vs/workbench/parts/search/page/browser/fileMatchView';
import { Action } from 'vs/base/common/actions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class SearchPageContribution implements IWorkbenchContribution {

	constructor(
		@IPartService partService: IPartService,
		@IInstantiationService instantiationService: IInstantiationService,
		@ICommandService commandService: ICommandService,
	) {
		commandService.executeCommand(SearchPageAction.ID);
	}

	public getId() {
		return 'sg.contrib.showSearchPage';
	}

}

export class SearchPageAction extends Action {

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	static ID = 'sg.showSearchPage';

	static LABEL = 'Search';

	run(): TPromise<void> {
		this.instantiationService.createInstance(SearchPage);
		return TPromise.wrap<void>(void 0);
	};
}

class SearchPage {

	private disposables: IDisposable[] = [];
	private findInput: FindInput;
	private fileMatches: FileMatch[];
	private resultContainer: Builder;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ISearchWorkbenchService private searchService: ISearchWorkbenchService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
	) {
		this.disposables.push(lifecycleService.onShutdown(() => this.dispose()));
		this.create();
	}

	create() {
		const uri = URI.parse(require.toUrl('./sg_search'))
			.with({
				scheme: Schemas.walkThrough,
				query: JSON.stringify({ moduleId: 'vs/workbench/parts/search/page/browser/sg_search' })
			});
		const input = this.instantiationService.createInstance(WalkThroughInput, localize('search.title', "Search"), '', uri, null, container => this.render(container));
		this.editorService.openEditor(input, { pinned: true }, Position.ONE)
			.then(null, onUnexpectedError);
	}

	render(container: HTMLElement): void {
		$(container).div({ style: { textAlign: 'center', marginBottom: '50px' } }, tip => {
			tip.innerHtml('Tip: Continue typing terms separated by spaces to refine your search');
		});
		this.findInput = new FindInput(container, null, { width: 798, label: '' });
		this.findInput.onDidOptionChange(this.startSearch);
		this.findInput.onKeyDown(this.keyDown);
		$(container).div({}, c => {
			this.resultContainer = c;
		});
	}

	keyDown = (e: IKeyboardEvent) => {
		if (e.keyCode === KeyCode.Enter) {
			this.startSearch();
		}
	}

	startSearch(): void {
		const query: ISearchQuery = {
			folderResources: [this.contextService.getWorkspace().resource],
			type: QueryType.Text,
			contentPattern: {
				pattern: this.findInput.getValue(),
				isRegExp: this.findInput.getRegex(),
				isWordMatch: this.findInput.getWholeWords(),
				isCaseSensitive: this.findInput.getCaseSensitive(),
			}
		};
		if (query.contentPattern.pattern.length === 0) {
			this.renderEmpty();
			return;
		}
		this.search(query);
	}

	search(query: ISearchQuery): void {
		this.searchService.searchModel.cancelSearch();
		this.renderLoading();
		this.searchService.searchModel.search(query)
			.done(this.onComplete, this.onError);
	}

	onComplete = () => {
		this.fileMatches = this.searchService.searchModel.searchResult.matches();
		this.renderResults();
	}

	renderResults(): void {
		dom.clearNode(this.resultContainer.getHTMLElement());
		this.resultContainer.div({}, parent => {
			this.fileMatches.forEach(fileMatch => {
				parent.div({}, div => {
					this.instantiationService.createInstance(FileMatchView, div, fileMatch);
				});
			});
		});
	}

	renderLoading(): void {
		dom.clearNode(this.resultContainer.getHTMLElement());
		this.resultContainer.div({}, div => {
			div.innerHtml('loading');
		});
	}

	renderEmpty(): void {
		dom.clearNode(this.resultContainer.getHTMLElement());
	}

	onError = (e) => {
		console.error(e);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
