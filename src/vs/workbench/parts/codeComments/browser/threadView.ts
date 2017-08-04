/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/codecomments';
import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { clearNode } from 'vs/base/browser/dom';
import { $ } from 'vs/base/browser/builder';
import { ICodeCommentsService, Thread, CommentsDidChangeEvent } from 'vs/editor/common/services/codeCommentsService';
import URI from 'vs/base/common/uri';
// import { distanceInWordsToNow } from 'date-fns';
// import { distanceInWordsToNow } from 'date-fns/distance_in_words_to_now';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { CommentInput } from 'vs/workbench/parts/codeComments/browser/commentInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import Event, { Emitter } from 'vs/base/common/event';

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
	) {
		super();
		this._register(this.codeCommentsService.onCommentsDidChange(e => this.onCommentsDidChange(e)));
		this.render();
	}

	private onCommentsDidChange(e: CommentsDidChangeEvent): void {
		for (let thread of e.threads) {
			if (thread.id === this.thread.id) {
				this.thread = thread;
				this.render();
				return;
			}
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
							// div.text(distanceInWordsToNow(comment.createdAt));
							div.text(comment.createdAt.toLocaleString());
						});
					});
					div.div({ class: 'content' }, div => {
						div.text(comment.contents);
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
		const progress = this.progressService.show(true);
		this.codeCommentsService.replyToThread(modelUri, thread, content).then(() => {
			// CommentsDidChange event has already been handled so we don't need to re-enable input or clear its content.
			progress.done();
		}, error => {
			progress.done();
			if (this.disposed) {
				return;
			}
			input.setEnabled(true);
			input.showMessage({
				content: error.toString(),
				type: MessageType.ERROR,
			});
		});
	}

	public dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}