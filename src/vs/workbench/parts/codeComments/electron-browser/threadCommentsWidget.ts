/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { $ } from 'vs/base/browser/builder';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { renderComment } from 'vs/workbench/parts/codeComments/browser/renderComment';
import { addDisposableListener, clearNode } from 'vs/base/browser/dom';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IThreadComments } from 'vs/editor/common/services/codeCommentsService';
import * as date from 'date-fns';
import { CommentInput } from 'vs/workbench/parts/codeComments/browser/commentInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { getCommentTelemetryData } from 'vs/workbench/parts/codeComments/common/codeComments';
import { once } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { BaseThreadCommentsWidget } from 'vs/workbench/parts/codeComments/browser/baseThreadCommentsWidget';

/**
 * Displays a comment thread inline in the editor.
 */
export class ThreadCommentsWidget extends BaseThreadCommentsWidget {

	private commentsElement: HTMLElement;
	private commentInput: CommentInput;

	constructor(
		editor: ICodeEditor,
		private threadComments: IThreadComments,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		super(editor, themeService);
	}

	protected _fillContainer(containerElement: HTMLElement): void {
		super._fillContainer(containerElement);

		$(this.threadCommentsElement).div({ class: 'comments' }, div => {
			this.commentsElement = div.getContainer();
			this.renderComments();
		});

		this.commentInput = this.instantiationService.createInstance(
			CommentInput,
			this.threadCommentsElement,
			localize('reply', "Reply..."),
			this.threadComments.draftReply,
			this.getSecondaryButtonLabel(),
		);
		this._disposables.push(this.commentInput);
		this._disposables.push(this.commentInput.onDidChangeContent(content => {
			this.threadComments.draftReply = content;
			this.commentInput.secondaryButtonLabel = this.getSecondaryButtonLabel();
		}));
		this._disposables.push(this.commentInput.onDidChangeHeight(() => {
			this.layout();
		}));
		this._disposables.push(this.commentInput.onDidClickSubmitButton(e => this.submitReply()));
		this._disposables.push(this.commentInput.onDidClickSecondaryButton(() => {
			const comment = this.canArchiveAndComment() ? this.submitReply() : TPromise.wrap(undefined);
			comment.then(() => {
				this.threadComments.setArchived(!this.threadComments.archived);
			});
		}));

		this._disposables.push(this.threadComments.onDidChangeComments(() => {
			this.renderComments();
			this.layout();
		}));
		this._disposables.push(this.threadComments.onDidChangeDraftReply(() => {
			this.commentInput.value = this.threadComments.draftReply;
		}));
		this._disposables.push(this.threadComments.onDidChangePendingOperation(() => {
			this.commentInput.setEnabled(!this.threadComments.pendingOperation);
		}));
		this._disposables.push(this.threadComments.onDidChangeArchived(() => {
			if (!this.threadComments.archived) {
				this.commentInput.secondaryButtonLabel = this.getSecondaryButtonLabel();
			}
		}));
	}

	public canArchiveAndComment(): boolean {
		return !this.threadComments.archived && this.threadComments.draftReply.trim().length > 0;
	}

	private getSecondaryButtonLabel(): string {
		if (this.threadComments.archived) {
			return localize('unarchiveCommentThread', "Unarchive");
		}
		return this.canArchiveAndComment() ?
			localize('archiveAndComment', "Archive and comment") :
			localize('archive', "Archive");
	}

	private toDisposeOnRender: IDisposable[] = [];
	private renderComments(): void {
		clearNode(this.commentsElement);
		this.toDisposeOnRender = dispose(this.toDisposeOnRender);

		const div = $(this.commentsElement);
		for (const comment of this.threadComments.comments) {
			div.div({ class: 'comment' }, div => {
				div.div({ class: 'header' }, div => {
					div.div({ class: 'author', title: comment.author.email }, div => {
						div.text(comment.author.displayName);
					});
					div.div({ class: 'timeAgo' }, div => {
						const time = localize('timeAgo', "{0} ago", date.distanceInWordsToNow(comment.createdAt));
						div.text(time);
					});
				});
				div.div({ class: 'content' }, div => {
					const renderedComment = this.instantiationService.invokeFunction(renderComment, comment);
					div.getContainer().appendChild(renderedComment);
					this.toDisposeOnRender.push(addDisposableListener(div.getContainer(), 'contextmenu', (e: MouseEvent) => {
						this.contextMenuService.showContextMenu({
							getAnchor: () => e,
							getActions: () => TPromise.as([
								new Action('editor.action.clipboardCopyAction', localize('copy', "Copy"), null, true, () => TPromise.as(document.execCommand('copy'))),
							]),
						});
					}));
				});
			});
			div.div({ class: 'border' });
		}
	}

	private submitReply(): TPromise<void> {
		const content = this.threadComments.draftReply;
		return this.threadComments.submitDraftReply().then(() => {
			this.telemetryService.publicLog('codeComments.replyToThread', getCommentTelemetryData({ thread: this.threadComments, content, error: false }));
		}, error => {
			this.telemetryService.publicLog('codeComments.replyToThread', getCommentTelemetryData({ thread: this.threadComments, content, error: true }));
			this.commentInput.showError(error);
		});
		// TODO(nick): progress bar
		// this.progressService.showWhile(promise);
	}

	public expand(reveal: boolean): void {
		if (!this.threadComments.displayRange) {
			this._disposables.push(once(this.threadComments.onDidChangeDisplayRange)(() => {
				this.expand(reveal);
			}));
			return;
		}
		if (!this.container) {
			// Lazily initialize so we don't prematurely listen to events.
			this.create();
		}
		// Render once so we can then measure actual height and then render again.
		super.show(this.threadComments.displayRange.getEndPosition(), 0, reveal);
		if (reveal) {
			this.commentInput.focus();
		}
	}

	public dispose() {
		this.toDisposeOnRender = dispose(this.toDisposeOnRender);
		super.dispose();
	}
}