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
import { distanceInWordsToNow } from 'date-fns';
import { matchesFuzzy } from 'vs/base/common/filters';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ICodeCommentsService, IThreads, IThreadComments } from 'vs/editor/common/services/codeCommentsService';
import { INavService } from 'vs/workbench/services/nav/common/nav';
import URI from 'vs/base/common/uri';

class CommentEntry extends QuickOpenEntry {

	constructor(
		public readonly threadComments: IThreadComments,
		@INavService private navService: INavService,
		@ICommandService private commandService: ICommandService,
	) {
		super();
	}

	public getId(): string {
		return this.threadComments.id.toString();
	}

	public getLabel(): string {
		return this.threadComments.title;
	}

	public getDescription(): string {
		return this.threadComments.file;
	}

	public getDetail(): string {
		const { createdAt, comments } = this.threadComments;
		const author = comments[0].author;
		return `${author.displayName} ${distanceInWordsToNow(createdAt, { addSuffix: true })}`;
	}

	public getAriaLabel(): string {
		return nls.localize('reviewItemAriaLabel', "{0}, review item", this.getLabel());
	}

	public getIconSrc(): string {
		return this.threadComments.comments[0].author.avatarUrl;
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode !== Mode.OPEN) {
			return false;
		}

		const thread = this.threadComments;
		const revision = thread.branch || thread.repoRevision;
		const query = `src:open?path=${thread.file}&revision=${revision}&thread=${thread.id}&vcs=git&repo=https://${thread.repo}`;
		this.navService.handle(URI.parse(query));
		return true;
	}
}

export class CodeCommentsQuickOpenHandler extends QuickOpenHandler {

	public static readonly ID = 'workbench.picker.comments';
	public static readonly PREFIX = 'comments ';

	private model?: QuickOpenModel;
	private threads: IThreads;

	constructor(
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super();
		this.threads = this.codeCommentsService.getThreads({});
	}

	public onOpen(): void {
		this.threads.refresh();
	}

	public onClose(): void {
		this.threads.dispose();
		this.model = undefined;
	}

	public getResults(searchTerm: string): TPromise<QuickOpenModel> {
		if (this.model) {
			for (const entry of this.model.entries) {
				const labelHighlights = matchesFuzzy(searchTerm, entry.getLabel());
				const descriptionHighlights = matchesFuzzy(searchTerm, entry.getDescription());
				const detailHighlights = matchesFuzzy(searchTerm, entry.getDetail());
				entry.setHidden(!labelHighlights && !descriptionHighlights && !detailHighlights);
				entry.setHighlights(labelHighlights || [], descriptionHighlights || [], detailHighlights || []);
			}
			return TPromise.as(this.model);
		}

		return this.threads.refresh().then(() => {
			const entries = this.threads.threads.filter(thread => !!thread.comments.length).map(thread => this.instantiationService.createInstance(CommentEntry, thread));
			this.model = new QuickOpenModel(entries);
			return TPromise.as(this.model);
		});
	}

	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue || !!context.quickNavigateConfiguration
		};
	}
}
