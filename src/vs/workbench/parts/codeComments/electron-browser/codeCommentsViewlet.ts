/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/codeComments';
import { localize } from 'vs/nls';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { clearNode } from 'vs/base/browser/dom';
import { Dimension, Builder, $ } from 'vs/base/browser/builder';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import * as Constants from 'vs/workbench/parts/codeComments/common/constants';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ICommonCodeEditor, isCommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ICodeCommentsService, Thread, CommentsDidChangeEvent } from 'vs/editor/common/services/codeCommentsService';
import URI from 'vs/base/common/uri';
import * as date from 'date-fns';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { Range } from 'vs/editor/common/core/range';
import { Action, IAction } from 'vs/base/common/actions';
import { basename } from 'vs/base/common/paths';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ThreadView } from 'vs/workbench/parts/codeComments/electron-browser/threadView';
import { CreateThreadView } from 'vs/workbench/parts/codeComments/browser/createThreadView';
import { ICodeCommentsViewlet } from 'vs/workbench/parts/codeComments/common/codeComments';
import { TAB_ACTIVE_FOREGROUND, TAB_INACTIVE_FOREGROUND } from 'vs/workbench/common/theme';
import { listHoverBackground } from 'vs/platform/theme/common/colorRegistry';

/**
 * Renders code comments in a viewlet.
 * The idea design has comments rendered in a right panel, but that requires
 * a bit more integration work so for v1 we are implementing it as a viewlet.
 */
export class CodeCommentsViewlet extends Viewlet implements ICodeCommentsViewlet {

	/**
	 * These are disposed when the active editor changes.
	 */
	private activeEditorListeners: IDisposable[] = [];

	/**
	 * The main list of the viewlist that displays threads or comments in a thread.
	 */
	private list: HTMLElement;

	/**
	 * The URI of the current model being rendered.
	 */
	private renderedModelUri: URI | undefined;

	/**
	 * Indentified the current render iteration.
	 * Rendering does async tasks, so if a task returns and the render
	 * is doesn't match any more, then the task knows it should discard the result.
	 *
	 * Incrementing the render id cancels all previous renders.
	 */
	private renderId = 0;

	/**
	 * These are disposed on every render.
	 */
	private renderDisposables: IDisposable[] = [];

	private scrollbar: ScrollableElement;
	private scrollContainer: HTMLElement;
	private title: string;
	private actions: IAction[] = [];
	private renderPromise: TPromise<void> | undefined;

	/**
	 * True if the threads list is rendered.
	 * False if something else is rendered (e.g. create thread or thread view).
	 */
	private recentThreadsView = true;

	private showRecentThreadsAction = new Action('workbench.codeCodeComments.action.showRecentThreads', 'Show recent threads', 'recentThreads', true, () => {
		this.render(this.getActiveModelUri(), {});
		return TPromise.as(null);
	});

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@ISCMService private scmService: ISCMService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super(Constants.VIEWLET_ID, telemetryService, themeService);
	}

	public getTitle(): string {
		return this.title;
	}

	public getActions(): IAction[] {
		return this.actions;
	}

	public create(parent: Builder): TPromise<void> {
		super.create(parent);

		this.list = $('div.list').getHTMLElement();

		this.scrollbar = this._register(new ScrollableElement(this.list, {
			horizontal: ScrollbarVisibility.Hidden,
			horizontalScrollbarSize: 0, // prevent space from being reserved
			useShadows: true,
		}));
		this._register(this.scrollbar.onScroll(e => {
			if (e.scrollTopChanged) {
				this.list.style.top = `-${e.scrollTop}px`;
			}
			if (e.scrollLeftChanged) {
				this.list.style.left = `-${e.scrollLeft}px`;
			}
		}));

		this.scrollContainer = this.scrollbar.getDomNode();
		$(this.scrollContainer).addClass('scrollContainer');

		parent.addClass('codeComments');
		parent.append(this.scrollContainer);

		this._register(this.codeCommentsService.onCommentsDidChange(this.onCommentsDidChange, this));
		this._register(this.editorGroupService.onEditorsChanged(this.onEditorsChanged, this));
		this._register(this.scmService.onDidRegisterProvider(this.onDidRegisterScmProvider, this));

		this.onEditorsChanged();
		return TPromise.as(null);
	}

	private onDidRegisterScmProvider(): void {
		this.render(this.getActiveModelUri(), {});
	}

	private onCommentsDidChange(e: CommentsDidChangeEvent) {
		const modelUri = this.getActiveModelUri();
		if (e.file === modelUri && this.recentThreadsView) {
			this.render(modelUri, {});
		}
	}

	private onEditorsChanged(): void {
		const editor = this.getActiveCodeEditor();
		if (!editor) {
			this.render(undefined, {});
			return;
		}
		this.activeEditorListeners = dispose(this.activeEditorListeners);
		this.activeEditorListeners.push(editor.onDidChangeModel(e => this.render(e.newModelUrl, { refreshData: true })));
		this.activeEditorListeners.push(editor.onDidChangeModelContent(e => {
			if (e.isFlush) {
				this.render(this.getModelUri(editor), { refreshData: true });
			}
		}));
		this.render(this.getModelUri(editor), { refreshData: true });
	}

	private getActiveCodeEditor(): ICommonCodeEditor | undefined {
		const editor = this.editorService.getActiveEditor();
		if (!editor) {
			return undefined;
		}
		const control = editor.getControl();
		if (!control) {
			return undefined;
		}
		if (!isCommonCodeEditor(control)) {
			return undefined;
		}
		return control;
	}

	private getModelUri(editor: ICommonCodeEditor): URI | undefined {
		const model = editor.getModel();
		if (!model) {
			return undefined;
		}
		return model.uri;
	}

	private getActiveModelUri(): URI | undefined {
		const activeEditor = this.getActiveCodeEditor();
		if (!activeEditor) {
			return undefined;
		}
		return this.getModelUri(activeEditor);
	}

	/**
	 * Renders the list of threads for a file.
	 * Will use cached thread data unless refreshData is true.
	 *
	 * TODO: refactor thread list view into separate class like CreateThreadView and ThreadView.
	 */
	private render(modelUri: URI | undefined, options: { refreshData?: boolean }): void {
		if (!modelUri) {
			this.renderCommentsNotAvailable();
			return;
		}

		// Increment the render id and then remember it.
		const renderId = ++this.renderId;

		this.recentThreadsView = true;
		this.title = localize('recentComments', "Recent conversations: {0}", basename(modelUri.fsPath));
		this.actions = [];
		this.updateTitleArea();
		this.renderDisposables = dispose(this.renderDisposables);
		clearNode(this.list);

		this.renderPromise = this.codeCommentsService.getThreads(modelUri, options.refreshData).then(threads => {
			if (renderId !== this.renderId) {
				// Another render has started so don't bother
				return;
			}
			this.renderRecentThreadsView(modelUri, threads);
			this.renderedModelUri = modelUri;
		}, error => {
			// Silently ignore errors if we weren't able to load comments for this file.
			// console.log(error);
		});
		this.progressService.showWhile(this.renderPromise);
	}

	private renderCommentsNotAvailable(): void {
		clearNode(this.list);
		$(this.list).div({ class: 'threads' }, div => {
			div.div({ class: 'empty' }, div => {
				div.div({}, div => {
					div.text(localize('commentsNotAvailable', "Comments are not available on this file."));
				});
			});
		});
	}

	/**
	 * Renders threads for whole file ordered by most recent comment timestamp descending.
	 */
	private renderRecentThreadsView(modelUri: URI, threads: Thread[]): void {
		clearNode(this.list);
		$(this.list).div({ class: 'threads' }, div => {
			if (threads.length === 0) {
				div.div({ class: 'empty' }, div => {
					div.div({}, div => {
						div.text(localize('toStartConversationOnThisFile', "To start a conversation on this file:"));
					});
					div.ol({}, ol => {
						ol.li({}, li => {
							li.text(localize('rightClickOnLineOrSelection', "Right click on a line or selection"));
						});
						ol.li({}, li => {
							li.text(localize('selectCreateCodeCommentAction', "Select '{0}'", Constants.CREATE_CODE_COMMENT_ACTION_LABEL));
						});
					});
				});
				return;
			}

			for (const thread of threads) {
				const recentComment = thread.mostRecentComment;
				div.div({ class: 'thread' }, div => {
					div.on('click', () => this.renderThreadView(modelUri, thread));
					div.div({ class: 'leftRight' }, div => {
						div.div({ class: 'left', title: recentComment.authorEmail }, div => {
							div.text(recentComment.authorName);
						});
						div.div({ class: 'right' }, div => {
							const time = localize('timeAgo', "{0} ago", date.distanceInWordsToNow(recentComment.createdAt));
							div.text(time);
						});
					});
					div.div({ class: 'content' }, div => {
						div.text(recentComment.contents);
					});
				});
			}
		});

		this.updateScrollbar();
	}

	/**
	 * Renders comments for a single thread.
	 */
	private renderThreadView(modelUri: URI, thread: Thread): void {
		this.recentThreadsView = false;
		this.renderDisposables = dispose(this.renderDisposables);

		this.renderTitleAndActionsForThreadRange(thread.range);

		const threadView = this.instantiationService.createInstance(ThreadView, this.list, modelUri, thread);
		this.renderDisposables.push(threadView);
		this.renderDisposables.push(threadView.onHeightChange(() => this.updateScrollbar()));

		this.updateScrollbar();
	}

	private renderTitleAndActionsForThreadRange(range: Range): void {
		if (Range.spansMultipleLines(range)) {
			this.title = localize('conversationOnLines', "Lines {0} {1}", range.startLineNumber, range.endLineNumber);
		} else {
			this.title = localize('conversationOnLine', "Line {0}", range.startLineNumber);
		}
		this.actions = [this.showRecentThreadsAction];
		this.updateTitleArea();

	}

	private updateScrollbar(): void {
		const scrollContainer = this.scrollbar.getDomNode();
		this.scrollbar.updateState({
			width: scrollContainer.clientWidth,
			scrollWidth: this.list.clientWidth,

			height: scrollContainer.clientHeight,
			scrollHeight: this.list.clientHeight,
		});
	}

	public layout(dimension: Dimension): void {
		this.updateScrollbar();
	}

	public createThread(file: URI, range: Range): void {
		if (this.getActiveModelUri() !== file) {
			// User switched contexts before we could show this UI.
			return;
		}
		// Invalidate previous renders.
		this.renderId++;
		if (this.renderPromise) {
			// Cancel the promise to hide the progress bar.
			this.renderPromise.cancel();
		}

		this.recentThreadsView = false;
		this.renderDisposables = dispose(this.renderDisposables);

		this.renderTitleAndActionsForThreadRange(range);

		const createThreadView = this.instantiationService.createInstance(CreateThreadView, this.list, file, range);
		this.renderDisposables.push(createThreadView);
		this.renderDisposables.push(createThreadView.onHeightChange(() => this.updateScrollbar()));
		this.renderDisposables.push(createThreadView.onCreateThread(thread => this.renderThreadView(file, thread)));
	}
}

registerThemingParticipant((theme, collector) => {
	const contentColor = theme.getColor(TAB_ACTIVE_FOREGROUND);
	const headerColor = theme.getColor(TAB_INACTIVE_FOREGROUND);
	const listHoverColor = theme.getColor(listHoverBackground);
	if (contentColor) {
		collector.addRule(`.codeComments .comment .content { color: ${contentColor}; }`);
		collector.addRule(`.codeComments .thread .content { color: ${contentColor}; }`);
		collector.addRule(`.codeComments .comment .leftRight { color: ${headerColor}; }`);
		collector.addRule(`.codeComments .thread .leftRight { color: ${headerColor}; }`);
		collector.addRule(`.codeComments .create .hint { color: ${headerColor}; }`);
		collector.addRule(`.codeComments .thread, .codeComments .comment, .codeComments .create { border-color: ${listHoverColor}; }`);
		collector.addRule(`.codeComments .thread:hover { background-color: ${listHoverColor}; }`);
	}
});