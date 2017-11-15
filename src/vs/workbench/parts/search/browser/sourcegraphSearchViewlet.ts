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
import { Match } from 'vs/workbench/parts/search/common/searchModel';

/**
 * Contains Sourcegraph customizations to VS Code's search viewlet.
 */
export class SourcegraphSearchViewlet extends SearchViewlet {
	private _onQueryDidChange = new Emitter<void>();

	public getOptimalWidth(): number {
		return 350;
	}

	get onQueryDidChange(): Event<void> { return this._onQueryDidChange.event; }

	public onQueryChanged(rerunQuery: boolean, preserveFocus?: boolean, noFireEvent?: boolean): void {
		if (!noFireEvent) {
			this._onQueryDidChange.fire();
		}
		super.onQueryChanged(rerunQuery, preserveFocus);
	}

	protected onQueryChangedCreate(contentPattern: IPatternInfo, folderResources: URI[], options: IQueryOptions): void {
		this.telemetryService.publicLog('codeSearch.query', {
			folderCount: folderResources.length,
		});
	}

	protected onFocus(lineMatch: any, preserveFocus?: boolean, sideBySide?: boolean, pinned?: boolean): TPromise<any> {
		if (lineMatch instanceof Match) {
			this.telemetryService.publicLog('codeSearch.openResult', {
				codeSearch: {
					local: lineMatch.parent().resource().scheme === 'file',
					fileMatchCount: lineMatch.parent().count(),
					folderMatchCount: lineMatch.parent().parent().count(),
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
