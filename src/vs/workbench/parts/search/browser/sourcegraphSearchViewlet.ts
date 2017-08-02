/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import * as dom from 'vs/base/browser/dom';
import Event, { Emitter } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';
import { IQueryOptions, IPatternInfo } from 'vs/platform/search/common/search';
import { findInFolderResourcesCommand } from 'vs/workbench/parts/search/browser/searchActions';
import { Builder, $ } from 'vs/base/browser/builder';
import { SearchProfilePickerWidget } from 'vs/workbench/parts/search/browser/searchProfilePickerWidget';
import { Match } from 'vs/workbench/parts/search/common/searchModel';

/**
 * Contains Sourcegraph customizations to VS Code's search viewlet.
 */
export class SourcegraphSearchViewlet extends SearchViewlet {
	private _onQueryDidChange = new Emitter<void>();

	public getOptimalWidth(): number {
		return 350;
	}

	/**
	 * The "[other] repositories to include" input field.
	 */
	public inputRepoSelector: SearchProfilePickerWidget;

	public create(parent: Builder): TPromise<void> {
		const selected: string = this.viewletSettings['query.profile'] || '';
		this.inputRepoSelector = this._register(this.instantiationService.createInstance(SearchProfilePickerWidget, selected));
		this._register(this.inputRepoSelector.onWorkspacesDidChange(() => this.onQueryChanged(true)));

		return super.create(parent).then(() => {
			$(this.searchWidget.domNode).append(
				$('div', { 'class': 'folder-container file-types' }, builder => {
					this.inputRepoSelector.create(builder);
				})
			);
		});
	}

	get onQueryDidChange(): Event<void> { return this._onQueryDidChange.event; }

	public onQueryChanged(rerunQuery: boolean, preserveFocus?: boolean, noFireEvent?: boolean): void {
		if (!noFireEvent) {
			this._onQueryDidChange.fire();
		}
		super.onQueryChanged(rerunQuery, preserveFocus);
	}

	public shutdown(): void {
		if (this.inputRepoSelector) {
			this.viewletSettings['query.profile'] = this.inputRepoSelector.selected;
		}
		super.shutdown();
	}

	protected onQueryChangedCreate(contentPattern: IPatternInfo, folderResources: URI[], options: IQueryOptions): void {
		const folderResourcesComparable = folderResources.map(resource => resource.toString());
		this.inputRepoSelector.workspaces.forEach(resource => {
			if (folderResourcesComparable.indexOf(resource) === -1) {
				folderResources.push(URI.parse(resource));
			}
		});
	}

	/**
	 * Sets the value of the folder resources (i.e., the workspaces/repos list).
	 */
	public searchInFolderResources(folderResources: string[]): void {
		this.inputRepoSelector.workspaces = folderResources;
	}

	protected onFocus(lineMatch: any, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		if (lineMatch instanceof Match) {
			const fileUri = lineMatch.parent().resource();
			const external = fileUri.scheme === 'repo+version';
			const filePath = fileUri.with({ scheme: '', authority: '', path: fileUri.authority + fileUri.path }).toString();
			this.telemetryService.publicLog('codeSearch.openResult', {
				codeSearch: {
					filePath,
					external,
				},
			});
		}
		return super.onFocus(lineMatch, preserveFocus, sideBySide, pinned);
	}

	protected searchWithoutFolderMessage(div: Builder): void {
		const container = $(div).p({ text: nls.localize('searchWithoutFolderResourcesInEmptyWorkspace', "You have not specified any repositories to include - ") })
			.asContainer();

		container.a({
			'class': ['pointer', 'prominent'],
			'tabindex': '0',
			text: nls.localize('trySampleSearch', "Try Sample Search"),
		}).on(dom.EventType.CLICK, (e: MouseEvent) => {
			dom.EventHelper.stop(e, false);

			this.instantiationService.invokeFunction(
				findInFolderResourcesCommand,
				['github.com/dgrijalva/jwt-go', 'github.com/apollographql/apollo-client'],
				'from\\w+\\(',
				true,
			);
		});
	}
}
