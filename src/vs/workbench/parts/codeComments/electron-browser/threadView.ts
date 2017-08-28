/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/codeComments';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { clearNode, addDisposableListener } from 'vs/base/browser/dom';
import { $ } from 'vs/base/browser/builder';
import { ICodeCommentsService, Thread, CommentsDidChangeEvent } from 'vs/editor/common/services/codeCommentsService';
import URI from 'vs/base/common/uri';
import * as date from 'date-fns';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { CommentInput } from 'vs/workbench/parts/codeComments/browser/commentInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import Event, { Emitter } from 'vs/base/common/event';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { Action } from 'vs/base/common/actions';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { editorActiveLinkForeground, editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { renderComment } from 'vs/workbench/parts/codeComments/browser/renderComment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { getCommentTelemetryData } from 'vs/workbench/parts/codeComments/common/codeComments';

/**
 * Renders the list of comments in a single thread.
 */
export class ThreadView extends Disposable {

	private disposed = false;

	private onHeightChangeEmitter = new Emitter<void>();
	public readonly onHeightChange: Event<void> = this.onHeightChangeEmitter.event;

	constructor(
		private parent: HTMLElement,
		private modelUri: URI,
		private thread: Thread,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IOpenerService private openerService: IOpenerService,
		@IModeService private modeService: IModeService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		super();
		this.telemetryService.publicLog('codeComments.viewThread', { codeComments: { commentCount: thread.comments.length } });
		this._register(this.codeCommentsService.onCommentsDidChange(e => this.onCommentsDidChange(e)));
		this.render();
	}

	private onCommentsDidChange(e: CommentsDidChangeEvent): void {
		const thread = this.codeCommentsService.getThread(this.modelUri, this.thread.id);
		if (thread) {
			this.thread = thread;
			this.render();
		}
	}

	private render(): void {
		clearNode(this.parent);
		$(this.parent).div({ class: 'comments' }, div => {
			for (const comment of this.thread.comments) {
				div.div({ class: 'comment' }, div => {
					div.div({ class: 'leftRight' }, div => {
						div.div({ class: 'left', title: comment.authorEmail }, div => {
							div.text(comment.authorName);
						});
						div.div({ class: 'right' }, div => {
							const time = localize('timeAgo', "{0} ago", date.distanceInWordsToNow(comment.createdAt));
							div.text(time);
						});
					});
					div.div({ class: 'content' }, div => {
						const renderedComment = this.instantiationService.invokeFunction(renderComment, comment);
						div.getHTMLElement().appendChild(renderedComment);
						this._register(addDisposableListener(div.getHTMLElement(), 'contextmenu', (e: MouseEvent) => {
							this.contextMenuService.showContextMenu({
								getAnchor: () => e,
								getActions: () => TPromise.as([
									new Action('editor.action.clipboardCopyAction', localize('copy', "Copy"), null, true, () => document.execCommand('copy') && TPromise.as(true)),
								]),
							});
						}));
					});
				});
			}
			const commentInput = this.instantiationService.createInstance(CommentInput, div.getContainer(), localize('reply', "Reply..."));
			this._register(commentInput);
			this._register(commentInput.onDidHeightChange(() => this.onHeightChangeEmitter.fire()));
			this._register(commentInput.onSubmitEvent(e => this.submitReply(commentInput, this.modelUri, this.thread, e.content)));
		});
	}

	private submitReply(input: CommentInput, modelUri: URI, thread: Thread, content: string): void {
		input.setEnabled(false);
		const promise = this.codeCommentsService.replyToThread(modelUri, thread, content).then(() => {
			// CommentsDidChange event has already been handled so we don't need to re-enable input or clear its content.
			this.telemetryService.publicLog('codeComments.replyToThread', getCommentTelemetryData({ range: thread.range, thread, content, error: false }));
		}, error => {
			this.telemetryService.publicLog('codeComments.replyToThread', getCommentTelemetryData({ range: thread.range, thread, content, error: true }));
			if (this.disposed) {
				return;
			}
			input.setEnabled(true);
			input.showMessage({
				content: error.toString(),
				type: MessageType.ERROR,
			});
		});
		this.progressService.showWhile(promise);
	}

	public dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}

registerThemingParticipant((theme, collector) => {
	const linkColor = theme.getColor(editorActiveLinkForeground);
	if (linkColor) {
		collector.addRule(`.codeComments .comment .content a { color: ${linkColor}; }`);
		collector.addRule(`.codeComments .thread .content a { color: ${linkColor}; }`);
	}
	const editorBackgroundColor = theme.getColor(editorBackground);
	if (editorBackgroundColor) {
		collector.addRule(`.codeComments .comment .content .code { background-color: ${editorBackgroundColor}; }`);
		collector.addRule(`.codeComments .thread .content .code { background-color: ${editorBackgroundColor}; }`);
	}
});