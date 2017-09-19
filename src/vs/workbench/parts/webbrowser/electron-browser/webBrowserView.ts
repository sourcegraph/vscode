/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { addDisposableListener } from 'vs/base/browser/dom';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction } from 'vs/base/common/actions';
import { editorBackground, editorForeground } from 'vs/platform/theme/common/colorRegistry';
import { ITheme, LIGHT, DARK } from 'vs/platform/theme/common/themeService';
import { WebviewFindWidget } from 'vs/workbench/parts/html/browser/webviewFindWidget';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { WebviewOptions, FoundInPageResults, WebviewElementFindInPageOptions } from 'vs/workbench/parts/html/browser/webview';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { BrowserBackAction, BrowserForwardAction, BrowserReloadAction, OpenInExternalBrowserAction } from 'vs/workbench/parts/webbrowser/electron-browser/webBrowserActions';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { WebBrowserModel } from 'vs/workbench/parts/webbrowser/electron-browser/webBrowserModel';

type ApiThemeClassName = 'vscode-light' | 'vscode-dark' | 'vscode-high-contrast';

interface URLEvent extends Electron.Event {
	url: string;
}

export class WebBrowserView {
	private _disposables: IDisposable[] = [];
	private _onDidClickLink = new Emitter<URI>();

	private backAction: BrowserBackAction;
	private forwardAction: BrowserForwardAction;
	private reloadAction: BrowserReloadAction;
	private openInExternalAction: OpenInExternalBrowserAction;

	private _onDidScroll = new Emitter<{ scrollYPercentage: number }>();
	private _onFoundInPageResults = new Emitter<FoundInPageResults>();

	private _webviewFindWidget: WebviewFindWidget;
	private _findStarted: boolean = false;

	constructor(
		private parent: HTMLElement,
		private model: WebBrowserModel | undefined,
		private _styleElement: Element,
		private _contextKey: IContextKey<boolean>,
		private _findInputContextKey: IContextKey<boolean>,
		private _options: WebviewOptions = {},
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IContextViewService private contextViewService: IContextViewService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IPartService private partService: IPartService,
		@IOpenerService private openerService: IOpenerService,
	) {
		if (this.model) {
			this.registerListeners();
			this.initActions(instantiationService);

			if (parent) {
				parent.appendChild(this._webviewFindWidget.getDomNode());
			}

			this.layout();
		}
	}

	private registerListeners(): void {
		this._disposables.push(
			addDisposableListener(this.model.webview, 'dom-ready', () => {
				this.layout();
			}),
			addDisposableListener(this.model.webview, 'focus', () => {
				if (this._contextKey) {
					this._contextKey.set(true);
				}
			}),
			addDisposableListener(this.model.webview, 'blur', () => {
				if (this._contextKey) {
					this._contextKey.reset();
				}
			}),
			addDisposableListener(this.model.webview, 'new-window', (event: URLEvent) => {
				// Open in OS default browser.
				this.openerService.open(URI.parse(event.url));
				event.preventDefault();
			}),
			addDisposableListener(this.model.webview, 'found-in-page', (event) => {
				this._onFoundInPageResults.fire(event.result);
			}),
			addDisposableListener(this.model.webview, 'contextmenu', (event: PointerEvent) => {
				this.contextMenuService.showContextMenu({
					getAnchor: () => event,
					getActions: () => TPromise.as(this.getContextMenuActions()),
					getKeyBinding: (action) => this.getKeybinding(action),
				});
			}),
		);

		this._webviewFindWidget = new WebviewFindWidget(this.contextViewService, this as any);
		this._disposables.push(this._webviewFindWidget);
	}

	private initActions(services: IInstantiationService): void {
		this.backAction = services.createInstance(BrowserBackAction, this.model.webview);
		this.forwardAction = services.createInstance(BrowserForwardAction, this.model.webview);
		this.reloadAction = services.createInstance(BrowserReloadAction, this.model.webview);
		this.openInExternalAction = services.createInstance(OpenInExternalBrowserAction, this.model.webview);
	}

	public get modelElement(): HTMLElement | undefined {
		if (!this.model) {
			return undefined;
		}
		return this.model.webview;
	}

	private getKeybinding(action: IAction): ResolvedKeybinding {
		return this.keybindingService.lookupKeybinding(action.id);
	}

	private getContextMenuActions(): IAction[] {
		// Enablement
		this.backAction.enabled = this.model.webview.canGoBack();
		this.forwardAction.enabled = this.model.webview.canGoForward();
		this.reloadAction.enabled = true;

		// Actions
		const actions: IAction[] = [
			this.backAction,
			this.forwardAction,
			this.reloadAction,
			new Separator(),
			this.openInExternalAction,
		];

		return actions;
	}

	public notifyFindWidgetFocusChanged(isFocused: boolean) {
		this._contextKey.set(isFocused || document.activeElement === this.model.webview);
	}

	public notifyFindWidgetInputFocusChanged(isFocused: boolean) {
		this._findInputContextKey.set(isFocused);
	}

	dispose(): void {
		this._onDidClickLink.dispose();
		this._disposables = dispose(this._disposables);

		if (this._webviewFindWidget) {
			const findWidgetDomNode = this._webviewFindWidget.getDomNode();
			findWidgetDomNode.parentElement.removeChild(findWidgetDomNode);
		}
	}

	get onDidClickLink(): Event<URI> {
		return this._onDidClickLink.event;
	}

	get onDidScroll(): Event<{ scrollYPercentage: number }> {
		return this._onDidScroll.event;
	}

	get onFindResults(): Event<FoundInPageResults> {
		return this._onFoundInPageResults.event;
	}

	set options(value: WebviewOptions) {
		this._options = value;
	}

	focus(): void {
		if (this.model) {
			this.model.webview.focus();
		} else {
			this.parent.focus();
		}
	}

	style(theme: ITheme): void {
		const { fontFamily, fontWeight, fontSize } = window.getComputedStyle(this._styleElement); // TODO@theme avoid styleElement

		let value = `
		:root {
			--background-color: ${theme.getColor(editorBackground)};
			--color: ${theme.getColor(editorForeground)};
			--font-family: ${fontFamily};
			--font-weight: ${fontWeight};
			--font-size: ${fontSize};
		}
		body {
			background-color: var(--background-color);
			color: var(--color);
			font-family: var(--font-family);
			font-weight: var(--font-weight);
			font-size: var(--font-size);
			margin: 0;
			padding: 0 20px;
		}

		img {
			max-width: 100%;
			max-height: 100%;
		}
		a:focus,
		input:focus,
		select:focus,
		textarea:focus {
			outline: 1px solid -webkit-focus-ring-color;
			outline-offset: -1px;
		}
		::-webkit-scrollbar {
			width: 10px;
			height: 10px;
		}`;

		let activeTheme: ApiThemeClassName;

		if (theme.type === LIGHT) {
			value += `
			::-webkit-scrollbar-thumb {
				background-color: rgba(100, 100, 100, 0.4);
			}
			::-webkit-scrollbar-thumb:hover {
				background-color: rgba(100, 100, 100, 0.7);
			}
			::-webkit-scrollbar-thumb:active {
				background-color: rgba(0, 0, 0, 0.6);
			}`;

			activeTheme = 'vscode-light';

		} else if (theme.type === DARK) {
			value += `
			::-webkit-scrollbar-thumb {
				background-color: rgba(121, 121, 121, 0.4);
			}
			::-webkit-scrollbar-thumb:hover {
				background-color: rgba(100, 100, 100, 0.7);
			}
			::-webkit-scrollbar-thumb:active {
				background-color: rgba(85, 85, 85, 0.8);
			}`;

			activeTheme = 'vscode-dark';

		} else {
			value += `
			::-webkit-scrollbar-thumb {
				background-color: rgba(111, 195, 223, 0.3);
			}
			::-webkit-scrollbar-thumb:hover {
				background-color: rgba(111, 195, 223, 0.8);
			}
			::-webkit-scrollbar-thumb:active {
				background-color: rgba(111, 195, 223, 0.8);
			}`;

			activeTheme = 'vscode-high-contrast';
		}

		activeTheme = 'vscode-light';

		if (this._webviewFindWidget) {
			this._webviewFindWidget.updateTheme(theme);
		}
	}

	public setVisible(visible: boolean): void {
		if (!this.model) {
			return;
		}

		if (visible) {
			this.model.webview.style.visibility = 'visible';
			this.layout();
		} else {
			this.model.webview.style.visibility = 'hidden';
		}
	}

	public layout(): void {
		if (!this.model) {
			return;
		}

		const parentRect = this.parent.getBoundingClientRect();
		this.model.webview.style.top = `${parentRect.top}px`;
		this.model.webview.style.left = `${parentRect.left}px`;
		this.model.webview.style.width = this.parent.style.width;
		this.model.webview.style.height = this.parent.style.height;

		const contents = this.model.webview.getWebContents();
		if (!contents || contents.isDestroyed()) {
			return;
		}

		contents.getZoomFactor(factor => {
			if (contents.isDestroyed()) {
				return;
			}

			contents.setZoomFactor(factor);

			const width = this.parent.clientWidth;
			const height = this.parent.clientHeight;
			contents.setSize({
				normal: {
					width: Math.floor(width * factor),
					height: Math.floor(height * factor)
				}
			});
		});
	}

	public startFind(value: string, options?: WebviewElementFindInPageOptions) {
		if (!value) {
			return;
		}

		// ensure options is defined without modifying the original
		options = options || {};

		// FindNext must be false for a first request
		const findOptions: WebviewElementFindInPageOptions = {
			forward: options.forward,
			findNext: false,
			matchCase: options.matchCase,
			medialCapitalAsWordStart: options.medialCapitalAsWordStart
		};

		this._findStarted = true;
		this.model.webview.findInPage(value, findOptions);
		return;
	}

	/**
	 * Webviews expose a stateful find API.
	 * Successive calls to find will move forward or backward through onFindResults
	 * depending on the supplied options.
	 *
	 * @param {string} value The string to search for. Empty strings are ignored.
	 * @param {WebviewElementFindInPageOptions} [options]
	 *
	 * @memberOf Webview
	 */
	public find(value: string, options?: WebviewElementFindInPageOptions): void {
		// Searching with an empty value will throw an exception
		if (!value) {
			return;
		}

		if (!this._findStarted) {
			this.startFind(value, options);
			return;
		}

		this.model.webview.findInPage(value, options);
	}

	public stopFind(keepSelection?: boolean): void {
		this._findStarted = false;
		this.model.webview.stopFindInPage(keepSelection ? 'keepSelection' : 'clearSelection');
	}

	public showFind() {
		this._webviewFindWidget.reveal();
	}

	public hideFind() {
		this._webviewFindWidget.hide();
	}

	public showNextFindTerm() {
		this._webviewFindWidget.showNextFindTerm();
	}

	public showPreviousFindTerm() {
		this._webviewFindWidget.showPreviousFindTerm();
	}
}
