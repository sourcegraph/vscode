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
import { ICodeCommentsService, IDraftThreadComments } from 'vs/editor/common/services/codeCommentsService';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { CommentInput } from 'vs/workbench/parts/codeComments/browser/commentInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import Event, { Emitter } from 'vs/base/common/event';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { getCommentTelemetryData } from 'vs/workbench/parts/codeComments/common/codeComments';

/**
 * Renders a view to add a new comment to a file (i.e. creating a new thread).
 */
export class CreateThreadView extends Disposable {

	private disposed = false;

	private onHeightChangeEmitter = this._register(new Emitter<void>());
	public readonly onHeightChange: Event<void> = this.onHeightChangeEmitter.event;

	private input: CommentInput;

	constructor(
		private parent: HTMLElement,
		private draftThread: IDraftThreadComments,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		super();
		this.telemetryService.publicLog('codeComments.openCreateThreadView');
		this.render();
	}

	private render(): void {
		clearNode(this.parent);
		$(this.parent).div({ class: 'comments' }, div => {
			this.input = this.instantiationService.createInstance(CommentInput, div.getContainer(), localize('leaveComment', "Leave a comment..."));
			this._register(this.input);
			this._register(this.input.onDidChange(value => this.draftThread.content = value));
			this._register(this.input.onDidHeightChange(() => this.onHeightChangeEmitter.fire()));
			this._register(this.input.onSubmit(e => this.createThread(e.content)));
		});
		this.input.focus();
	}

	private createThread(content: string): void {
		this.input.setEnabled(false);
		const promise = this.draftThread.submit().then(thread => {
			this.telemetryService.publicLog('codeComments.createThread', getCommentTelemetryData({ thread, content, error: false }));
			if (this.disposed) {
				return;
			}
		}, error => {
			this.telemetryService.publicLog('codeComments.createThread', getCommentTelemetryData({ content, error: true }));
			if (this.disposed) {
				return;
			}
			this.input.setEnabled(true);
			this.input.showError(error);
		});
		this.progressService.showWhile(promise);
	}

	public dispose(): void {
		this.disposed = true;
		super.dispose();
	}
}