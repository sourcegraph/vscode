/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { IDisposable, dispose, empty as EmptyDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { filterEvent, anyEvent } from 'vs/base/common/event';
import { VIEWLET_ID } from 'vs/workbench/parts/review/common/review';
import { IReviewService, IReviewItem } from 'vs/workbench/services/review/common/review';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IStatusbarService } from 'vs/platform/statusbar/common/statusbar';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { getCodeEditor as getEditorWidget } from 'vs/editor/common/services/codeEditorService';
import { IEditor } from 'vs/platform/editor/common/editor';

export class StatusUpdater implements IWorkbenchContribution {

	private static ID = 'vs.review.statusUpdater';

	private badgeDisposable: IDisposable = EmptyDisposable;
	private disposables: IDisposable[] = [];

	constructor(
		@IReviewService private reviewService: IReviewService,
		@IActivityService private activityService: IActivityService,
	) {
		this.reviewService.onDidAddReviewItem(this.onDidAddReviewitem, this, this.disposables);
		this.render();
	}

	private onDidAddReviewitem(reviewItem: IReviewItem): void {
		const provider = reviewItem.provider;
		const onDidChange = anyEvent(provider.onDidChange, provider.onDidChangeResources);
		const changeDisposable = onDidChange(() => this.render());

		const onDidRemove = filterEvent(this.reviewService.onDidRemoveReviewItem, e => e === reviewItem);
		const removeDisposable = onDidRemove(() => {
			disposable.dispose();
			this.disposables = this.disposables.filter(d => d !== removeDisposable);
			this.render();
		});

		const disposable = combinedDisposable([changeDisposable, removeDisposable]);
		this.disposables.push(disposable);
	}

	getId(): string {
		return StatusUpdater.ID;
	}

	private render(): void {
		this.badgeDisposable.dispose();

		const count = this.reviewService.reviewItems.reduce((r, reviewItem) => {
			// if (typeof reviewItem.provider.count === 'number') {
			// 	return r + reviewItem.provider.count;
			// } else {
			return r + reviewItem.provider.resources.reduce<number>((r, g) => r + g.resourceCollection.resources.length, 0);
			// }
		}, 0);

		if (count > 0) {
			const badge = new NumberBadge(count, num => localize('reviewPendingChangesBadge', '{0} pending changes', num));
			this.badgeDisposable = this.activityService.showActivity(VIEWLET_ID, badge, 'review-viewlet-label');
		} else {
			this.badgeDisposable = EmptyDisposable;
		}
	}

	dispose(): void {
		this.badgeDisposable.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class StatusBarController implements IWorkbenchContribution {

	private static ID = 'vs.review.statusBarController';

	private statusBarDisposable: IDisposable = EmptyDisposable;
	private focusDisposable: IDisposable = EmptyDisposable;
	private focusedReviewItem: IReviewItem | undefined = undefined;
	private focusedProviderContextKey: IContextKey<string | undefined>;
	private activeEditorListeners: IDisposable[] = [];
	private disposables: IDisposable[] = [];

	constructor(
		@IReviewService private reviewService: IReviewService,
		@IStatusbarService private statusbarService: IStatusbarService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		this.focusedProviderContextKey = contextKeyService.createKey<string | undefined>('reviewProvider', void 0);
		this.reviewService.onDidAddReviewItem(this.onDidAddReviewItem, this, this.disposables);

		this.editorGroupService.onEditorsChanged(this.onEditorsChanged, this, this.disposables);

		const renderedForEditor = this.onDidChangeOrFocusActiveEditor();
		if (!renderedForEditor && this.reviewService.reviewItems.length > 0) {
			this.onDidFocusReviewItem(this.reviewService.reviewItems[0]);
		}
	}

	getId(): string {
		return StatusBarController.ID;
	}

	private onDidAddReviewItem(repository: IReviewItem): void {
		const changeDisposable = repository.onDidFocus(() => this.onDidFocusReviewItem(repository));
		const onDidRemove = filterEvent(this.reviewService.onDidRemoveReviewItem, e => e === repository);
		const removeDisposable = onDidRemove(() => {
			disposable.dispose();
			this.disposables = this.disposables.filter(d => d !== removeDisposable);

			if (this.reviewService.reviewItems.length === 0) {
				this.focusedProviderContextKey.set(undefined);
			} else if (this.focusedReviewItem === repository) {
				this.reviewService.reviewItems[0].focus();
			}
		});

		const disposable = combinedDisposable([changeDisposable, removeDisposable]);
		this.disposables.push(disposable);

		const renderedForEditor = this.onDidChangeOrFocusActiveEditor();
		if (!renderedForEditor && this.reviewService.reviewItems.length === 1) {
			this.onDidFocusReviewItem(repository);
		}
	}

	private onDidFocusReviewItem(reviewItem: IReviewItem): void {
		if (this.focusedReviewItem !== reviewItem) {
			this.focusedReviewItem = reviewItem;
			this.focusedProviderContextKey.set(reviewItem.provider.id);
		}

		this.focusDisposable.dispose();
		this.focusDisposable = reviewItem.provider.onDidChange(() => this.render(reviewItem));
		this.render(reviewItem);
	}

	private onEditorsChanged(): void {
		const activeEditor = this.editorService.getActiveEditor();

		// Also handle when the user clicks back into the editor from somewhere else (e.g.,
		// the Review viewlet) that could've changed the focused repository.
		const control = getEditorWidget(activeEditor);

		// Dispose old active editor listeners
		dispose(this.activeEditorListeners);

		// Attach new listeners to active editor
		if (control) {
			this.activeEditorListeners.push(control.onDidFocusEditor(() => this.onDidChangeOrFocusActiveEditor()));
		}
	}

	private onDidChangeOrFocusActiveEditor(activeEditor: IEditor = this.editorService.getActiveEditor()): boolean {
		const activeResource = activeEditor ? toResource(activeEditor.input, { supportSideBySide: true, filter: 'file' }) : void 0;
		if (activeResource) {
			// const repository = this.reviewService.getRepositoryForResource(activeResource);
			// if (repository) {
			// 	this.onDidFocusReviewItem(repository);
			// 	return true;
			// }
		} else {
			// Keep last-viewed repository's status bar items.
		}

		return false;
	}

	private render(reviewItem: IReviewItem): void {
		this.statusBarDisposable.dispose();

		// const commands = reviewItem.provider.statusBarCommands || [];
		// const label = reviewItem.provider.label;

		// const disposables = commands.map(c => this.statusbarService.addEntry({
		// 	text: c.title,
		// 	tooltip: `${label} - ${c.tooltip}`,
		// 	command: c.id,
		// 	arguments: c.arguments
		// }, MainThreadStatusBarAlignment.LEFT, 10000));

		// this.statusBarDisposable = combinedDisposable(disposables);
	}

	dispose(): void {
		this.focusDisposable.dispose();
		this.statusBarDisposable.dispose();
		this.activeEditorListeners = dispose(this.activeEditorListeners);
		this.disposables = dispose(this.disposables);
	}
}