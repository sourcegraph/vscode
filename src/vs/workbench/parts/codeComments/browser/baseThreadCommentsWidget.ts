/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import 'vs/css!./media/threadCommentsWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerThemingParticipant, ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { $ } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { peekViewBorder, peekViewResultsBackground } from 'vs/editor/contrib/referenceSearch/browser/referencesWidget';
import { Color } from 'vs/base/common/color';
import Event, { Emitter } from 'vs/base/common/event';
import { textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { KeyCode } from 'vs/base/common/keyCodes';

/**
 * Base class for thead widgets.
 */
export class BaseThreadCommentsWidget extends ZoneWidget {

	protected threadCommentsElement: HTMLElement;

	constructor(
		editor: ICodeEditor,
		@IThemeService themeService: IThemeService,
	) {
		super(editor, { isResizeable: false });
		this._disposables.push(themeService.onThemeChange(this.applyTheme, this));
		this.applyTheme(themeService.getTheme());
	}

	private applyTheme(theme: ITheme): void {
		const borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
		});
	}

	protected _fillContainer(containerElement: HTMLElement): void {
		// Set tabindex so it can handle focus.
		$(containerElement).div({ class: 'thread-comments', tabindex: -1 }, div => {
			this.threadCommentsElement = div.getContainer();
		});

		this._disposables.push(dom.addStandardDisposableListener(containerElement, 'keydown', (e: IKeyboardEvent) => {
			if (e.keyCode === KeyCode.Escape) {
				this.dispose();
			}
		}));
	}

	protected layout() {
		const lineHeight = this.editor.getConfiguration().lineHeight;
		const totalHeight = dom.getTotalHeight(this.threadCommentsElement) + this._decoratingElementsHeight();
		const heightInLines = Math.ceil(totalHeight / lineHeight);
		this._relayout(heightInLines);
	}

	protected _onWidth(widthInPixel: number): void {
		this.layout();
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		this.layout();
	}

	private willDispose = new Emitter<void>();
	public onWillDispose: Event<void> = this.willDispose.event;

	public dispose() {
		this.willDispose.fire();
		super.dispose();
	}
}

registerThemingParticipant((theme, collector) => {
	const linkColor = theme.getColor(textLinkForeground);
	if (linkColor) {
		collector.addRule(`.thread-comments .comment .content a { color: ${linkColor}; }`);
	}
	const activeLinkColor = theme.getColor(textLinkActiveForeground);
	if (activeLinkColor) {
		collector.addRule(`.thread-comments .comment .content a:hover { color: ${activeLinkColor}; }`);
		collector.addRule(`.thread-comments .comment .content a:active { color: ${activeLinkColor}; }`);
	}
	const borderColor = theme.getColor(peekViewBorder);
	if (borderColor) {
		collector.addRule(`.thread-comments .border { border-color: ${borderColor}; }`);
	}
	const codeBackgroundColor = theme.getColor(peekViewResultsBackground);
	if (codeBackgroundColor) {
		collector.addRule(`.thread-comments .content .code { background-color: ${codeBackgroundColor}; }`);
	}
});