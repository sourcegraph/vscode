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
import { ICodeCommentsService } from 'vs/editor/common/services/codeCommentsService';
import URI from 'vs/base/common/uri';
import * as date from 'date-fns';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { ScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { ScrollbarVisibility } from 'vs/base/common/scrollable';
import { IAction } from 'vs/base/common/actions';
import { basename } from 'vs/base/common/paths';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { TAB_ACTIVE_FOREGROUND, TAB_INACTIVE_FOREGROUND } from 'vs/workbench/common/theme';
import { listHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { renderComment } from 'vs/workbench/parts/codeComments/browser/renderComment';
import { CodeCommentsController } from 'vs/workbench/parts/codeComments/electron-browser/codeCommentsController';
import { Button } from 'vs/base/browser/ui/button/button';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';

/**
 * Renders code comments in a viewlet.
 * The idea design has comments rendered in a right panel, but that requires
 * a bit more integration work so for v1 we are implementing it as a viewlet.
 */
export class CodeCommentsViewlet extends Viewlet {

	/**
	 * These are disposed when the active editor changes.
	 */
	private activeEditorListeners: IDisposable[] = [];

	/**
	 * The main list of the viewlist that displays threads or comments in a thread.
	 */
	private list: HTMLElement;

	/**
	 * These are disposed on every render.
	 */
	private renderDisposables: IDisposable[] = [];

	private scrollbar: ScrollableElement;
	private scrollContainer: HTMLElement;
	private title: string;
	private actions: IAction[] = [];
	// Temporary to leave as true until we add auth in.
	private authed = true;

	/**
	 * True if the threads list is rendered.
	 * False if something else is rendered (e.g. create thread or thread view).
	 */
	private recentThreadsView = true;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super(Constants.VIEWLET_ID, telemetryService, themeService);
	}

	public dispose(): void {
		this.activeEditorListeners = dispose(this.activeEditorListeners);
		this.renderDisposables = dispose(this.renderDisposables);
		super.dispose();
	}

	public getTitle(): string {
		return this.title;
	}

	public getActions(): IAction[] {
		return this.actions;
	}

	public setVisible(visible: boolean): TPromise<void> {
		if (visible) {
			this.telemetryService.publicLog('codeComments.openViewlet');
		}
		return super.setVisible(visible);
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

		this._register(this.editorGroupService.onEditorsChanged(this.onEditorsChanged, this));
		this.onEditorsChanged();
		return TPromise.as(null);
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
		const modelUri = this.getModelUri(editor);
		if (modelUri) {
			const fileComments = this.codeCommentsService.getFileComments(modelUri);
			this.activeEditorListeners.push(fileComments.onDidChangeThreads(() => {
				if (this.recentThreadsView) {
					this.render(modelUri, {});
				}
			}));
		}
		this.render(modelUri, { refreshData: true });
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

	/**
	 * Renders the list of threads for a file.
	 * Will use cached thread data unless refreshData is true.
	 *
	 * TODO: refactor thread list view into separate class like CreateThreadView and ThreadView.
	 */
	private render(modelUri: URI | undefined, options: { refreshData?: boolean }): void {
		if (!this.authed) {
			this.renderAuthenticationView();
			return;
		}

		if (!modelUri) {
			this.renderCommentsNotAvailable();
			return;
		}
		this.renderRecentThreadsView(modelUri, options);
	}

	private renderAuthenticationView(): void {
		this.title = localize('comment', "Code Comments");
		this.actions = [];
		this.updateTitleArea();
		this.renderDisposables = dispose(this.renderDisposables);
		clearNode(this.list);
		let container = $('div').addClass('auth-view');
		container.appendTo(this.list);
		let titleDiv = $('div.section').appendTo(container);
		$('h4').text(localize('codeCommentsAuthentication', "Sign in to view comments")).appendTo(titleDiv);
		$('p').text(localize('authExplaination', "You must be signed into your Sourcegraph account to use code comments.")).appendTo(titleDiv);

		let section = $('div.section').appendTo(container);
		const signInButton = new Button(section);
		attachButtonStyler(signInButton, this.themeService);
		signInButton.label = localize('signInButtonLabel', 'Sign in');
		signInButton.addListener('click', () => {
			this.telemetryService.publicLog('codeComments.signupButtonClicked');
		});
	}

	private renderCommentsNotAvailable(): void {
		this.recentThreadsView = false;
		this.title = localize('comment', "Code Comments");
		this.actions = [];
		this.updateTitleArea();
		this.renderDisposables = dispose(this.renderDisposables);
		clearNode(this.list);
		$(this.list).div({ class: 'threads' }, div => {
			div.div({ class: 'empty' }, div => {
				div.div({}, div => {
					div.text(localize('openFileToSeeComments', "Open a file to see comments."));
				});
			});
		});
	}

	/**
	 * Renders threads for whole file ordered by most recent comment timestamp descending.
	 */
	private renderRecentThreadsView(modelUri: URI, options: { refreshData?: boolean }): void {
		this.recentThreadsView = true;
		this.title = localize('recentComments', "Recent conversations: {0}", basename(modelUri.fsPath));
		this.actions = [];
		this.updateTitleArea();
		this.renderDisposables = dispose(this.renderDisposables);

		const fileComments = this.codeCommentsService.getFileComments(modelUri);
		if (options.refreshData) {
			this.progressService.showWhile(fileComments.refreshThreads());
		} else {
			this.progressService.showWhile(fileComments.refreshing);
		}

		clearNode(this.list);
		$(this.list).div({ class: 'threads' }, div => {
			if (fileComments.threads.length === 0) {
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

			for (const thread of fileComments.threads) {
				const recentComment = thread.mostRecentComment;
				div.div({ class: 'thread' }, div => {
					div.on('click', () => {
						CodeCommentsController.get(this.getActiveCodeEditor()).showThreadWidget(thread, true);
					});
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
						const renderedComment = this.instantiationService.invokeFunction(renderComment, recentComment);
						div.getHTMLElement().appendChild(renderedComment);
					});
				});
			}
		});

		this.updateScrollbar();
	}

	private updateScrollbar(): void {
		const scrollContainer = this.scrollbar.getDomNode();
		this.scrollbar.setScrollDimensions({
			width: scrollContainer.clientWidth,
			scrollWidth: this.list.clientWidth,

			height: scrollContainer.clientHeight,
			scrollHeight: this.list.clientHeight,
		});
	}

	public layout(dimension: Dimension): void {
		this.updateScrollbar();
	}
}

registerThemingParticipant((theme, collector) => {
	const contentColor = theme.getColor(TAB_ACTIVE_FOREGROUND);
	if (contentColor) {
		collector.addRule(`.codeComments .thread .content { color: ${contentColor}; }`);
	}
	const headerColor = theme.getColor(TAB_INACTIVE_FOREGROUND);
	if (headerColor) {
		collector.addRule(`.codeComments .thread .leftRight { color: ${headerColor}; }`);
	}
	const listHoverColor = theme.getColor(listHoverBackground);
	if (listHoverColor) {
		collector.addRule(`.codeComments .thread { border-color: ${listHoverColor}; }`);
		collector.addRule(`.codeComments .thread:hover { background-color: ${listHoverColor}; }`);
	}
});