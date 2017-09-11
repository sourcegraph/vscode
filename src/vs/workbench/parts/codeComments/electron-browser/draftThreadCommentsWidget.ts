/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { IDraftThreadComments } from 'vs/editor/common/services/codeCommentsService';
import { CommentInput } from 'vs/workbench/parts/codeComments/browser/commentInput';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { getCommentTelemetryData } from 'vs/workbench/parts/codeComments/common/codeComments';
import { BaseThreadCommentsWidget } from 'vs/workbench/parts/codeComments/browser/baseThreadCommentsWidget';

/**
 * Widget to create a new comment thread.
 */
export class DraftThreadCommentsWidget extends BaseThreadCommentsWidget {

	private commentInput: CommentInput;
	constructor(
		editor: ICodeEditor,
		private draftThread: IDraftThreadComments,
		@IThemeService themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		super(editor, themeService);
		this.create();
		telemetryService.publicLog('codeComments.openCreateThreadView');
	}

	protected _fillContainer(containerElement: HTMLElement): void {
		super._fillContainer(containerElement);

		this.commentInput = this.instantiationService.createInstance(
			CommentInput,
			this.threadCommentsElement,
			localize('leaveComment', "Leave a comment..."),
			this.draftThread.content,
			localize('cancelDraft', "Cancel"),
		);
		this._register(this.commentInput);
		this._register(this.commentInput.onDidChangeContent(content => this.draftThread.content = content));
		this._register(this.commentInput.onDidChangeHeight(() => this.layout()));
		this._register(this.commentInput.onDidClickSubmitButton(() => this.createThread()));
		this._register(this.commentInput.onDidClickSecondaryButton(() => {
			const content = this.draftThread.content;
			this.telemetryService.publicLog('codeComments.cancelCreateThread', getCommentTelemetryData({ content, error: false }));
			this.draftThread.dispose();
		}));

		this._register(this.draftThread.onDidChangeContent(() => this.commentInput.value = this.draftThread.content));
		this._register(this.draftThread.onDidChangeSubmitting(() => {
			this.commentInput.setEnabled(!this.draftThread.submitting);
		}));
	}

	private createThread(): void {
		const content = this.draftThread.content;
		this.draftThread.submit().then(thread => {
			this.telemetryService.publicLog('codeComments.createThread', getCommentTelemetryData({ thread, content, error: false }));
		}, error => {
			this.telemetryService.publicLog('codeComments.createThread', getCommentTelemetryData({ content, error: true }));
			this.commentInput.showError(error);
		});
		// TODO(nick): progress bar
		// this.progressService.showWhile(promise);
	}

	public expand(reveal: boolean): void {
		// Render once so we can then measure actual height and then render again.
		super.show(this.draftThread.displayRange, 0, reveal);
		if (reveal) {
			this.commentInput.focus();
		}
	}
}