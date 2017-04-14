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
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError } from 'vs/base/common/errors';
import { localize } from 'vs/nls';
import { Schemas, xhr } from 'vs/base/common/network';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { FindInput } from 'vs/base/browser/ui/findinput/findInput';
import { QueryType, ISearchQuery, IFileMatch, ILineMatch } from 'vs/platform/search/common/search';
import { ISearchWorkbenchService } from 'vs/workbench/parts/search/common/searchModel';
import { FileMatchView } from 'vs/workbench/parts/search/page/browser/fileMatchView';
import { Action } from 'vs/base/common/actions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { RepoSelector, IFilteredChecklist, LangSelector } from 'vs/workbench/parts/search/page/browser/searchFilters';

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

export interface SearchResult {
	hasNextPage: boolean;
	results: {
		resource: string;
		lineMatches: ILineMatch[];
	}[];
}

export interface IRepoFilter {
	onChange(cb: (repos: string[]) => void): void;
}

export class SearchPage {

	disposables: IDisposable[] = [];
	findInput: FindInput;
	resultContainer: Builder;
	repoFilter: IFilteredChecklist;
	reposToSearch: string[];

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ISearchWorkbenchService private searchService: ISearchWorkbenchService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@IPartService private partService: IPartService,

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

	render(parent: HTMLElement): void {
		$(parent).div({}, container => {
			this.findInput = new FindInput(container.getHTMLElement(), null, { width: 798, label: '' });
			this.findInput.onDidOptionChange(this.startSearch);
			this.findInput.onKeyDown(this.keyDown);
			this.renderResultContainer(container);
		});
	}

	renderResultContainer(parent: Builder): void {
		parent.div({
			style: {
				display: 'flex',
				justifyContent: 'space-between',
				overflow: 'scroll'
			}
		}, results => {
			results.div({
				style: {
					width: '600px'
				}
			}, c => {
				this.resultContainer = c;
			});
			results.div({
				style: {
					width: '200px'
				}
			}, refine => {
				refine.safeInnerHtml('Refine your search:');
				refine.div({}, filter => {
					const repoFilter = new RepoSelector(filter);
					repoFilter.selectionChanged(this.reposChanged);
				});
				refine.div({}, filter => {
					const langFilter = new LangSelector(filter);
					langFilter.selectionChanged(this.langsChanged);
				});
			});
		});
	}

	langsChanged = (langsToSearch: string[]) => {
	}

	reposChanged = (reposToSearch: string[]) => {
		this.reposToSearch = reposToSearch;
		this.startSearch();
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
		this.renderLoading();
		this.search(query);
	}

	searchComplete(data: SearchResult): void {
		this.renderResults(data.results.map(fm => {
			return {
				resource: URI.parse(fm.resource),
				lineMatches: fm.lineMatches,
			};
		}));
	}

	renderResults(fileMatches: IFileMatch[]): void {
		dom.clearNode(this.resultContainer.getHTMLElement());
		this.resultContainer.div({}, parent => {
			fileMatches.forEach(fileMatch => {
				parent.div({}, div => {
					this.instantiationService.createInstance(FileMatchView, div, fileMatch);
				});
			});
		});
		this.layout();
	}

	layout(): void {
		this.partService.layout();
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

	search(query: ISearchQuery): void {
		const body = this.getQueryBody(query);
		xhr({
			url: 'https://sourcegraph.com/.api/graphql',
			type: 'POST',
			data: JSON.stringify(body),
			responseType: 'json',
		}).then(resp => {
			const data = resp.response.data.root.searchRepos;
			this.searchComplete(data);
		}, (err) => {
			console.error(err);
		});
	}

	getQueryBody(query: ISearchQuery): any {
		return {
			query: `query SearchText(
				$pattern: String!,
				$maxResults: Int!,
				$isRegExp: Boolean!,
				$isWordMatch: Boolean!,
				$repositories: [String!]!,
				$isCaseSensitive: Boolean!,
			) {
				root {
					searchRepos(
						repositories: $repositories,
						query: {
							pattern: $pattern,
							isRegExp: $isRegExp,
							maxResults: $maxResults,
							isWordMatch: $isWordMatch,
							isCaseSensitive: $isCaseSensitive,
					}) {
						hasNextPage
						results {
							resource
							lineMatches {
								preview
								lineNumber
								offsetAndLengths
							}
						}
					}
				}
			}`,
			variables: {
				...query.contentPattern,
				isMultiline: false,
				repositories: ['github.com/kubernetes/kubernetes'],
				maxResults: 500,
			},
			operationName: 'SearchText',
		};
	}
}
