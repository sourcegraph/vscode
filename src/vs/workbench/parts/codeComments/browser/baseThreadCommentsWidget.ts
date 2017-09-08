/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import 'vs/css!./media/threadCommentsWidget';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerThemingParticipant, ITheme, IThemeService } from 'vs/platform/theme/common/themeService';
import { $ } from 'vs/base/browser/builder';
import { ZoneWidget } from 'vs/editor/contrib/zoneWidget/browser/zoneWidget';
import { getTotalHeight } from 'vs/base/browser/dom';
import { peekViewBorder, peekViewResultsBackground } from 'vs/editor/contrib/referenceSearch/browser/referencesWidget';
import { Color } from 'vs/base/common/color';

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
		this._register(themeService.onThemeChange(this.applyTheme, this));
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
		$(containerElement).div({ class: 'thread-comments' }, div => {
			this.threadCommentsElement = div.getContainer();
		});
	}

	protected layout() {
		const lineHeight = this.editor.getConfiguration().lineHeight;
		const totalHeight = getTotalHeight(this.threadCommentsElement) + this._decoratingElementsHeight();
		const heightInLines = Math.ceil(totalHeight / lineHeight);
		this._relayout(heightInLines);
	}

	protected _onWidth(widthInPixel: number): void {
		this.layout();
	}

	protected _doLayout(heightInPixel: number, widthInPixel: number): void {
		this.layout();
	}
}

registerThemingParticipant((theme, collector) => {
	const borderColor = theme.getColor(peekViewBorder);
	if (borderColor) {
		collector.addRule(`.thread-comments .border { border-color: ${borderColor}; }`);
	}
	const codeBackgroundColor = theme.getColor(peekViewResultsBackground);
	if (codeBackgroundColor) {
		collector.addRule(`.thread-comments .content .code { background-color: ${codeBackgroundColor}; }`);
	}
});