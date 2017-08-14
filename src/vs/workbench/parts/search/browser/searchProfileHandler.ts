/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import strings = require('vs/base/common/strings');
import scorer = require('vs/base/common/scorer');
import arrays = require('vs/base/common/arrays');
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntryGroup, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ISearchProfileService } from "vs/platform/search/common/search";
import { VIEWLET_ID as SEARCH_VIEWLET_ID } from 'vs/workbench/parts/search/common/constants';
import { SourcegraphSearchViewlet } from "vs/workbench/parts/search/browser/sourcegraphSearchViewlet";


export const PROFILE_PICKER_PREFIX = 'sp ';

class ProfileEntry extends QuickOpenEntryGroup {

	public icon: string = null;

	constructor(
		public label: string,
		private description: string,
		private category: string,
		private doRun: () => void,
	) {
		super();
	}

	public getLabel(): string {
		return this.label;
	}

	public getCategory(): string {
		return this.category;
	}

	public getDescription(): string {
		return this.description;
	}

	public getAriaLabel(): string {
		return nls.localize('profileEntryAriaLabel', "{0}, search profile", this.getLabel());
	}

	public getIcon(): string {
		return this.icon;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			this.doRun();
			return true;
		}

		return super.run(mode, context);
	}
}

export class ProfilePickerHandler extends QuickOpenHandler {

	constructor(
		@IViewletService private viewletService: IViewletService,
		@ISearchProfileService private searchProfileService: ISearchProfileService,
	) {
		super();
	}

	public getResults(searchValue: string): TPromise<QuickOpenModel> {
		searchValue = searchValue.trim();
		const normalizedSearchValueLowercase = strings.stripWildcards(searchValue).toLowerCase();

		const searchFilter = (e: QuickOpenEntry) => {
			if (!searchValue) {
				return true;
			}

			if (!scorer.matches(e.getLabel(), normalizedSearchValueLowercase)) {
				return false;
			}

			return true;
		};

		return this.viewletService.resolveViewlet(SEARCH_VIEWLET_ID).then((viewlet: SourcegraphSearchViewlet) => {
			const searchProfiles = this.searchProfileService.getSearchProfiles();
			const profileEntries = searchProfiles.map(profile => {
				const category = nls.localize('profiles', "Profiles");
				return new ProfileEntry(profile.name, profile.description, category, () => {
					viewlet.inputRepoSelector.selected = profile.name;
				});
			}).filter(searchFilter);

			let workspaces = arrays.flatten(searchProfiles.map(profile => profile.workspaces));
			workspaces = arrays.distinct(workspaces, s => s);
			const workspaceEntries = workspaces.map(name => {
				const category = nls.localize('workspaces', "Workspaces");
				return new ProfileEntry(name, '', category, () => {
					viewlet.inputRepoSelector.workspaces = viewlet.inputRepoSelector.workspaces.concat([name]);
				});
			}).filter(searchFilter);
			// Now that we have filtered, clean up the label for presentation
			workspaceEntries.forEach(p => {
				p.label = p.label
					.replace(/^.*:\/\//, '') // humans prefer reading paths not uris
					.replace(/^github.com\//, '') // github.com is so common just leave it off
					.replace(/\//g, '／'); // Use a wider slash character, looks nice
				p.icon = 'octicon octicon-repo';
			});

			let workspaceActionEntries: ProfileEntry[] = [];
			if (workspaceEntries.length > 1 && searchValue) {
				const category = nls.localize('workspaceActions', "Workspace Actions");
				workspaceActionEntries = [
					new ProfileEntry(
						nls.localize('workspaceAddAll', "Add All"),
						nls.localize('workspaceAddAllDescription', "Also search {0} matching workspaces", workspaceEntries.length),
						category,
						() => {
							viewlet.inputRepoSelector.workspaces = viewlet.inputRepoSelector.workspaces.concat(workspaceEntries.map(e => e.getLabel()));
						},
					),
					new ProfileEntry(
						nls.localize('workspaceReplaceAll', "Replace All"),
						nls.localize('workspaceReplaceAllDescription', "Only search {0} matching workspaces", workspaceEntries.length),
						category, () => {
							viewlet.inputRepoSelector.workspaces = workspaceEntries.map(e => e.getLabel());
						},
					),
				];
			}

			const entries = profileEntries.concat(workspaceActionEntries).concat(workspaceEntries).map(e => {
				if (searchValue) {
					const { labelHighlights, descriptionHighlights } = QuickOpenEntry.highlight(e, searchValue);
					e.setHighlights(labelHighlights, descriptionHighlights);
				}
				return e;
			});

			let lastCategory: string;
			entries.forEach((e, index) => {
				if (lastCategory !== e.getCategory()) {
					lastCategory = e.getCategory();

					e.setShowBorder(index > 0);
					e.setGroupLabel(lastCategory);
				} else {
					e.setShowBorder(false);
					e.setGroupLabel(void 0);
				}
			});

			return new QuickOpenModel(entries);
		});
	}

	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue || !!context.quickNavigateConfiguration
		};
	}
}
