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
import { ICodeCommentsService, Thread } from 'vs/editor/common/services/codeCommentsService';
import URI from 'vs/base/common/uri';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { CommentInput } from 'vs/workbench/parts/codeComments/browser/commentInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { MessageType } from 'vs/base/browser/ui/inputbox/inputBox';
import Event, { Emitter } from 'vs/base/common/event';
import { Range } from 'vs/editor/common/core/range';

/**
 * Renders a view to add a new comment to a file (i.e. creating a new thread).
 */
export class CreateThreadView extends Disposable {

	private disposed = false;

	private onHeightChangeEmitter = this._register(new Emitter<void>());
	public readonly onHeightChange: Event<void> = this.onHeightChangeEmitter.event;

	private onCreateThreadEmitter = this._register(new Emitter<Thread>());
	public readonly onCreateThread: Event<Thread> = this.onCreateThreadEmitter.event;

	private input: CommentInput;

	constructor(
		private parent: HTMLElement,
		private file: URI,
		private range: Range,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super();
		this.render();
	}

	private render(): void {
		clearNode(this.parent);
		$(this.parent).div({ class: 'comments' }, div => {
			this.input = this.instantiationService.createInstance(CommentInput, div.getContainer(), localize('leaveComment', "Leave a comment..."));
			this._register(this.input);
			this._register(this.input.onDidHeightChange(() => this.onHeightChangeEmitter.fire()));
			this._register(this.input.onSubmitEvent(e => this.createThread(e.content)));
		});
		this.input.focus();
	}

	private createThread(content: string): void {
		this.input.setEnabled(false);
		const promise = this.codeCommentsService.createThread(this.file, this.range, content).then(thread => {
			if (this.disposed) {
				return;
			}
			this.onCreateThreadEmitter.fire(thread);
		}, error => {
			if (this.disposed) {
				return;
			}
			this.input.setEnabled(true);
			this.input.showMessage({
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