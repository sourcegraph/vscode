/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose, empty as EmptyDisposable } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { EditorOptions } from 'vs/workbench/common/editor';
import { WebBrowserView } from 'vs/workbench/parts/webbrowser/electron-browser/webBrowserView';
import { WebBrowserModel } from 'vs/workbench/parts/webbrowser/electron-browser/webBrowserModel';
import { WebBrowserInput } from 'vs/workbench/parts/webbrowser/electron-browser/webBrowserInput';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED, KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS } from 'vs/workbench/parts/html/browser/webviewEditor';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { KEYBINDING_CONTEXT_ATTR } from 'vs/platform/contextkey/browser/contextKeyService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Position } from 'vs/platform/editor/common/editor';

export class WebBrowserEditor extends BaseEditor {

	static ID: string = 'workbench.editor.webbrowser';

	protected webviewFocusContextKey: IContextKey<boolean>;
	protected _view: WebBrowserView;

	protected contextKey: IContextKey<boolean>;
	protected findInputFocusContextKey: IContextKey<boolean>;

	private content: HTMLElement;

	private viewDisposables: IDisposable[];
	private themeChangeSubscription = EmptyDisposable;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IThemeService protected themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super(WebBrowserEditor.ID, telemetryService, themeService);

		if (contextKeyService) {
			this.contextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS.bindTo(contextKeyService);
			this.findInputFocusContextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED.bindTo(contextKeyService);
		}
	}

	dispose(): void {
		this.viewDisposables = dispose(this.viewDisposables);
		this.themeChangeSubscription.dispose();
		super.dispose();
	}

	protected createEditor(parent: Builder): void {
		this.content = document.createElement('div');
		this.content.classList.add('webbrowser-editor');
		parent.getHTMLElement().appendChild(this.content);
	}

	private get view(): WebBrowserView {
		if (!this._view) {
			let model: WebBrowserModel;
			if (this.input && this.input instanceof WebBrowserInput) {
				model = this.input.resolveSync();
			}

			this._view = this.instantiationService.createInstance(WebBrowserView,
				this.content, model,
				this.contextKey, this.findInputFocusContextKey, {});

			this.onThemeChange(this.themeService.getTheme());
			this.viewDisposables = [
				this._view,
			];
		}
		return this._view;
	}

	public changePosition(position: Position): void {
		this.setWebviewKeybindingContext();
		super.changePosition(position);
	}

	protected setEditorVisible(visible: boolean, position?: Position): void {
		this.doSetEditorVisible(visible);
		super.setEditorVisible(visible, position);
	}

	/**
	 * Update the data-keybinding-context attribute of the webview to match that of
	 * the editor group, so that keybindings are correctly resolved for editor keybindings
	 * triggered via keydown when the webview is focused.
	 *
	 * @param position the position of this editor
	 */
	private setWebviewKeybindingContext(): void {
		if (!this._view || !this._view.modelElement) {
			return;
		}

		let target: HTMLElement = this.content;
		while (target) {
			const value = target.getAttribute(KEYBINDING_CONTEXT_ATTR);
			if (value) {
				this.view.modelElement.setAttribute(KEYBINDING_CONTEXT_ATTR, value);
				return;
			}

			target = target.parentElement;
		}

		this.view.modelElement.removeAttribute(KEYBINDING_CONTEXT_ATTR);
	}

	private doSetEditorVisible(visible: boolean): void {
		this.view.setVisible(visible);
		if (visible) {
			this.themeChangeSubscription = this.themeService.onThemeChange(this.onThemeChange.bind(this));
			this.setWebviewKeybindingContext();
		} else {
			this.themeChangeSubscription.dispose();
			this.viewDisposables = dispose(this.viewDisposables);
			this._view = undefined;
		}
	}

	public layout(dimension: Dimension): void {
		const { width, height } = dimension;
		this.content.style.width = `${width}px`;
		this.content.style.height = `${height}px`;

		if (this.view) {
			this.view.layout();
		}
	}

	focus(): void {
		if (!this.view) {
			return;
		}

		this.view.focus();
	}

	public setInput(input: WebBrowserInput, options?: EditorOptions): TPromise<void> {
		if (this.input && this.input.matches(input) && this.input instanceof WebBrowserInput && input instanceof WebBrowserInput) {
			return TPromise.as(void 0);
		}

		if (!(input instanceof WebBrowserInput)) {
			return TPromise.wrapError<void>(new Error('Invalid input'));
		}

		this.doSetEditorVisible(false);

		return super.setInput(input, options).then(() => {
			const resourceUri = input.getResource();
			const model = input.resolveSync();
			this.doSetEditorVisible(true);
			model.load().then(() => {
				model.webview.loadURL(resourceUri.toString());
			});

			return undefined;
		});
	}

	public showFind() {
		if (this.view) {
			this.view.showFind();
		}
	}

	public hideFind() {
		if (this.view) {
			this.view.hideFind();
		}
	}

	public showNextFindTerm() {
		if (this.view) {
			this.view.showNextFindTerm();
		}
	}

	public showPreviousFindTerm() {
		if (this.view) {
			this.view.showPreviousFindTerm();
		}
	}

	/**
	 * Used by vs/workbench/parts/html/browser/webviewEditor for find-in-page commands.
	 */
	public get isWebviewEditor() {
		return true;
	}

	public updateStyles() {
		super.updateStyles();
		if (this.view) {
			this.view.style(this.themeService.getTheme());
		}
	}
}
