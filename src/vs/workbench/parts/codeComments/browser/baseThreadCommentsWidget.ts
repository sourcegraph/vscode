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
import { Color } from 'vs/base/common/color';
import { textLinkActiveForeground, textLinkForeground } from 'vs/platform/theme/common/colorRegistry';
import { Range } from 'vs/editor/common/core/range';
import { PeekViewWidget } from 'vs/editor/contrib/referenceSearch/peekViewWidget';
import { peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground, peekViewResultsBackground } from 'vs/editor/contrib/referenceSearch/referencesWidget';

/**
 * Base class for thead widgets.
 */
export abstract class BaseThreadCommentsWidget extends PeekViewWidget {

	protected threadCommentsElement: HTMLElement;

	constructor(
		editor: ICodeEditor,
		@IThemeService themeService: IThemeService,
	) {
		super(editor, { showFrame: false, isResizeable: false });
		this._disposables.push(themeService.onThemeChange(this.applyTheme, this));
		this.applyTheme(themeService.getTheme());
	}

	private applyTheme(theme: ITheme): void {
		const borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground)
		});
	}

	protected _fillBody(containerElement: HTMLElement): void {
		this.setCssClass('thread-comments-zone-widget');

		// Set tabindex so it can handle focus.
		$(containerElement).div({ class: 'thread-comments', tabindex: -1 }, div => {
			this.threadCommentsElement = div.getContainer();
		});
	}

	protected layout() {
		const lineHeight = this.editor.getConfiguration().lineHeight;
		const totalHeight = dom.getTotalHeight(this.threadCommentsElement) + this._decoratingElementsHeight() + this.headHeight;
		const heightInLines = Math.ceil(totalHeight / lineHeight);
		this._relayout(heightInLines);
	}

	protected _onWidth(widthInPixel: number): void {
		super._onWidth(widthInPixel);
		this.layout();
	}

	public _doLayout(heightInPixel: number, widthInPixel: number): void {
		super._doLayout(heightInPixel, widthInPixel);
		this.layout();
	}

	private headHeight: number = 0;
	protected _doLayoutHead(heightInPixel: number, widthInPixel: number): void {
		super._doLayoutHead(heightInPixel, widthInPixel);
		this.headHeight = heightInPixel;
	}

	/**
	 * True if this widget should be revealed after it is expanded.
	 */
	private reveal = false;

	/**
	 * Expands the widget. If reveal is true, then the widget is also scrolled into view after it is expanded.
	 */
	public expand(reveal: boolean): void {
		// super.show() eventually calls this.revealLine().
		// We save the reveal parameter here and read it in this.revealLine()
		// instead of creating an upstream diff to pass a reveal parameter through super.show().
		this.reveal = reveal;

		// Render once with zero lines revealed so we can then measure actual height and then relayout with the correct height.
		super.show(this.getRange().getEndPosition(), 0);
	}

	protected revealLine(lineNumber: number) {
		if (this.reveal) {
			this.editor.revealLine(this.getRange().startLineNumber);
			super.revealLine(lineNumber);
		}
	}

	protected abstract getRange(): Range;
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
