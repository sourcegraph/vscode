/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { WebBrowserInput } from 'vs/workbench/parts/webbrowser/electron-browser/webBrowserInput';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class BrowserOpenLocationAction extends Action {

	public static ID = 'workbench.action.webbrowser.openLocation';
	public static LABEL = nls.localize('openLocation', "Web Browser: Open URL");

	private static LAST_VALUE_STORAGE_KEY = 'webbrowser.openLocation.last';

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IStorageService private storageService: IStorageService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const lastValue = this.storageService.get(BrowserOpenLocationAction.LAST_VALUE_STORAGE_KEY, StorageScope.GLOBAL);

		return this.quickOpenService.input({
			prompt: nls.localize('openLocationPrompt', "Enter URL"),
			value: lastValue,
		})
			.then(value => {
				if (!value) {
					return undefined;
				}

				this.storageService.store(BrowserOpenLocationAction.LAST_VALUE_STORAGE_KEY, value, StorageScope.GLOBAL);

				const input = this.instantiationService.createInstance(WebBrowserInput, URI.parse(value));
				return this.editorService.openEditor(input);
			});
	}
}

export class BrowserBackAction extends Action {

	constructor(
		private webView: Electron.WebviewTag,
	) {
		super('webbrowser.back', nls.localize('back', "Back"));

		this.class = 'webbrowser-action back';
	}

	public run(): TPromise<any> {
		this.webView.goBack();
		return TPromise.as(void 0);
	}
}

export class BrowserForwardAction extends Action {

	constructor(
		private webView: Electron.WebviewTag,
	) {
		super('webbrowser.forward', nls.localize('forward', "Forward"));

		this.class = 'webbrowser-action forward';
	}

	public run(): TPromise<any> {
		this.webView.goForward();
		return TPromise.as(void 0);
	}
}

export class BrowserReloadAction extends Action {

	constructor(
		private webView: Electron.WebviewTag,
	) {
		super('webbrowser.reload', nls.localize('reload', "Reload"));

		this.class = 'webbrowser-action reload';
	}

	public run(): TPromise<any> {
		this.webView.reload();
		return TPromise.as(void 0);
	}
}

export class OpenInExternalBrowserAction extends Action {

	constructor(
		private webView: Electron.WebviewTag,
		@IOpenerService private openerService: IOpenerService,
	) {
		super('webbrowser.openInExternalBrowser', nls.localize('openInExternalBrowser', "Open in External Browser"));

		this.class = 'webbrowser-action open-in-external-browser';

		// TODO(sqs): update enablement
	}

	public run(): TPromise<any> {
		return this.openerService.open(URI.parse(this.webView.getURL()));
	}
}
