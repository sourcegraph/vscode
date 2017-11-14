/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { addDisposableListener, addClass } from 'vs/base/browser/dom';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWebBrowserModel } from 'vs/workbench/parts/webbrowser/common/webBrowser';
import { ipcRenderer as ipc } from 'electron';

export class WebBrowserModel implements IWebBrowserModel {

	public readonly webview: Electron.WebviewTag;

	private _onDispose = new Emitter<void>();
	get onDispose(): Event<void> { return this._onDispose.event; }

	private _ready: TPromise<this>;

	constructor(
		@IPartService private partService: IPartService,
	) {
		this.webview = document.createElement('webview');
		this.webview.setAttribute('partition', 'persist:external');

		// disable auxclick events (see https://developers.google.com/web/updates/2016/10/auxclick)
		this.webview.setAttribute('disableblinkfeatures', 'Auxclick');

		this.webview.setAttribute('disableguestresize', '');
		this.webview.setAttribute('webpreferences', 'contextIsolation=yes nodeIntegration=no');

		this.webview.style.position = 'absolute';
		this.webview.style.zIndex = '1';
		this.webview.style.outline = '0';

		this.webview.src = require.toUrl('./webview.html');

		this._ready = new TPromise<this>(resolve => {
			const subscription = addDisposableListener(this.webview, 'dom-ready', (event) => {
				const contents = this.webview.getWebContents();
				ipc.send('web-contents-allow-navigation', contents.id);

				addClass(this.webview, 'ready'); // can be found by debug command

				subscription.dispose();
				resolve(this);
			});
		});

		const subscription = addDisposableListener(this.webview, 'destroyed', (event) => {
			subscription.dispose();
			this.dispose();
		});

		// Use a separate DOM tree for the webviews so that we control their lifecycle. Otherwise
		// the webviews and all their state are destroyed when the user moves or hides editors.
		const workbenchElement = document.getElementById(this.partService.getWorkbenchElementId());
		let webviewParent = workbenchElement.querySelector('.webviews');
		if (!webviewParent) {
			webviewParent = document.createElement('div');
			webviewParent.className = 'webviews';
			workbenchElement.appendChild(webviewParent);
		}
		webviewParent.appendChild(this.webview);
	}

	public load(): TPromise<this> {
		return this._ready;
	}

	public dispose(): void {
		if (this.webview.parentElement) {
			this.webview.parentElement.removeChild(this.webview);
		}
		this._onDispose.fire(void 0);
	}
}
