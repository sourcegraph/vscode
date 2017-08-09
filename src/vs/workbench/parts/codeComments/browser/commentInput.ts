/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import Event, { Emitter, chain } from 'vs/base/common/event';
import { $ } from 'vs/base/browser/builder';
import { InputBox, IMessage } from 'vs/base/browser/ui/inputbox/inputBox';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { attachInputBoxStyler, attachButtonStyler } from 'vs/platform/theme/common/styler';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { domEvent } from 'vs/base/browser/event';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { Button } from 'vs/base/browser/ui/button/button';
import { isMacintosh } from 'vs/base/common/platform';

export interface SubmitEvent {
	content: string;
}

/**
 * Input field for a code comment.
 */
export class CommentInput extends Disposable {

	private onDidHeightChangeEmitter = new Emitter<void>();
	public readonly onDidHeightChange = this.onDidHeightChangeEmitter.event;

	private onSubmitEmitter = new Emitter<SubmitEvent>();
	public readonly onSubmitEvent: Event<SubmitEvent> = this.onSubmitEmitter.event;

	private inputBox: InputBox;
	private submitButton: Button;

	constructor(
		parent: HTMLElement,
		placeholder: string,
		@IContextViewService private contextViewService: IContextViewService,
		@IThemeService private themeService: IThemeService,
	) {
		super();

		$(parent).div({ class: 'create' }, div => {
			div.div({ class: 'inputContainer' }, div => {
				this.inputBox = new InputBox(div.getHTMLElement(), this.contextViewService, {
					placeholder,
					flexibleHeight: true
				});
				this._register(attachInputBoxStyler(this.inputBox, this.themeService));
				this._register(this.inputBox);
				this._register(this.inputBox.onDidHeightChange(() => this.onDidHeightChangeEmitter.fire()));

				this._register(chain(domEvent(this.inputBox.inputElement, 'keydown'))
					.map(e => new StandardKeyboardEvent(e))
					.filter(e => e.equals(KeyMod.CtrlCmd | KeyCode.Enter) || e.equals(KeyMod.CtrlCmd | KeyCode.KEY_S))
					.on(() => this.onSubmit()));
			});


			div.div({ class: 'submit' }, div => {
				this.submitButton = new Button(div);
				this.submitButton.label = localize('commitMessage', "Submit ({0})", isMacintosh ? 'Cmd+Enter' : 'Ctrl+Enter');
				attachButtonStyler(this.submitButton, this.themeService);
				this._register(this.submitButton);
				this._register(this.submitButton.addListener('click', () => this.onSubmit()));
			});
		});
	}

	public setEnabled(enabled: boolean) {
		this.submitButton.enabled = enabled;
		this.inputBox.setEnabled(enabled);
	}

	public showMessage(message: IMessage, force?: boolean): void {
		this.inputBox.showMessage(message, force);
	}

	private onSubmit(): void {
		this.onSubmitEmitter.fire({ content: this.inputBox.value });
	}

	public focus(): void {
		this.inputBox.focus();
	}
}