/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { ISearchProfileService } from 'vs/platform/search/common/search';
import { IReviewService, IReviewItem } from 'vs/workbench/services/review/common/review';
import { distanceInWordsToNow } from 'date-fns';
import { matchesFuzzy } from 'vs/base/common/filters';

class ReviewEntry extends QuickOpenEntry {

	constructor(
		public readonly reviewItem: IReviewItem
	) {
		super();
	}

	public getId(): string {
		return this.reviewItem.provider.id;
	}

	public getLabel(): string {
		return this.reviewItem.provider.label;
	}

	public getDescription(): string {
		return this.reviewItem.provider.description;
	}

	public getDetail(): string {
		const { date, author } = this.reviewItem.provider;
		return `${author || ''} ${date ? distanceInWordsToNow(date, { addSuffix: true }) : ''}`;
	}

	public getAriaLabel(): string {
		return nls.localize('reviewItemAriaLabel', "{0}, review item", this.getLabel());
	}

	public getIcon(): string {
		return this.reviewItem.provider.icon;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			this.reviewItem.focus();
			return true;
		}
		return false;
	}
}

export class ReviewQuickOpenHandler extends QuickOpenHandler {

	public static readonly ID = 'workbench.picker.review';
	public static readonly PREFIX = 'review ';

	private model?: QuickOpenModel;

	constructor(
		@IReviewService private reviewService: IReviewService,
		@ISearchProfileService private searchProfileService: ISearchProfileService,
	) {
		super();
	}

	public onOpen(): void {
		const entries = this.reviewService.reviewItems.map(reviewItem => new ReviewEntry(reviewItem));
		// Newest to the top
		entries.sort((a, b) => {
			const aDate = a.reviewItem.provider.date;
			const bDate = b.reviewItem.provider.date;
			// If timestamps are the same or both not given sort alphanumerically by ID
			if (aDate === bDate) {
				return b.reviewItem.provider.id < a.reviewItem.provider.id ? -1 : 1;
			}
			// If one of them is not given move that one down
			if (!aDate) {
				return 1;
			}
			if (!bDate) {
				return -1;
			}
			return bDate - aDate;
		});
		this.model = new QuickOpenModel(entries);
	}

	public onClose(): void {
		this.model = undefined;
	}

	public getResults(searchTerm: string): TPromise<QuickOpenModel> {
		searchTerm = searchTerm.trim().toLowerCase();

		for (const entry of this.model.entries) {
			const labelHighlights = matchesFuzzy(searchTerm, entry.getLabel());
			const descriptionHighlights = matchesFuzzy(searchTerm, entry.getDescription());
			const detailHighlights = matchesFuzzy(searchTerm, entry.getDetail());
			entry.setHidden(!labelHighlights && !descriptionHighlights && !detailHighlights);
			entry.setHighlights(labelHighlights || [], descriptionHighlights || [], detailHighlights || []);
		}

		return TPromise.as(this.model);
	}

	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue || !!context.quickNavigateConfiguration
		};
	}
}
