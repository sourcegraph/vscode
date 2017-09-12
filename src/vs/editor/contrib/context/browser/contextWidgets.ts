/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./context';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Widget } from 'vs/base/browser/ui/widget';
import * as dom from 'vs/base/browser/dom';
import { DomScrollableElement } from 'vs/base/browser/ui/scrollbar/scrollableElement';
import { toDisposable } from 'vs/base/common/lifecycle';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';

export abstract class ContextWidget extends Widget {

	private _containerDomNode: HTMLElement;
	protected _domNode: HTMLElement;
	private scrollbar: DomScrollableElement;

	constructor(
		container: HTMLElement,
		private editor: ICodeEditor,
	) {
		super();

		this._containerDomNode = document.createElement('div');
		this._containerDomNode.className = 'monaco-editor-context hidden';
		this._register(toDisposable(() => this._containerDomNode.remove()));
		container.appendChild(this._containerDomNode);

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-editor-context-content';

		this.scrollbar = new DomScrollableElement(this._domNode, {});
		this._register(this.scrollbar);
		this._containerDomNode.appendChild(this.scrollbar.getDomNode());

		this._register(this.editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.fontInfo) {
				this.updateFont();
				this.updateFontFromEditorConfig();
			}
		}));

		this.layout();
	}

	public updateContents(node: Node): void {
		this._domNode.textContent = '';
		this._domNode.appendChild(node);
		this.updateFont();

		this.scrollbar.scanDomNode();
	}

	public show(): void {
		dom.removeClass(this._containerDomNode, 'hidden');
	}

	private updateFont(): void {
		const codeTags: HTMLElement[] = Array.prototype.slice.call(this._domNode.getElementsByTagName('code'));
		const codeClasses: HTMLElement[] = Array.prototype.slice.call(this._domNode.getElementsByClassName('code'));
		[...codeTags, ...codeClasses].forEach(node => this.editor.applyFontInfo(node));
	}

	private updateFontFromEditorConfig(): void {
		const { fontSize, lineHeight } = this.editor.getConfiguration().fontInfo;
		this._domNode.style.fontSize = `${fontSize}px`;
		this._domNode.style.lineHeight = `${lineHeight}px`;
	}

	public abstract layout(): void;
}