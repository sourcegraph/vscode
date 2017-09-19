/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput } from 'vs/workbench/common/editor';
import { IReference } from 'vs/base/common/lifecycle';
import { IEditorModel } from 'vs/platform/editor/common/editor';

export interface ElectronWebviewTagLike {
	goBack(): void;
}

export interface IWebBrowserModel extends IEditorModel {
	readonly webview: ElectronWebviewTagLike;
	load(): TPromise<IWebBrowserModel>;
}

export class WebBrowserInput extends EditorInput {

	static get ID() { return 'workbench.webbrowser.input'; }

	protected modelReference: IReference<IWebBrowserModel>;

	constructor(protected _url: URI) {
		super();
	}

	public getTypeId(): string {
		return WebBrowserInput.ID;
	}

	public getName(): string {
		return localize('webBrowserInputName', "Web Browser: {0}", this._url.toString());
	}

	public matches(other: any): boolean {
		if (!(other instanceof WebBrowserInput)) {
			return false;
		}

		const otherWebBrowserInput = other as WebBrowserInput;
		return this._url.toString() === otherWebBrowserInput._url.toString();
	}

	public getResource(): URI {
		return this._url;
	}

	public resolve(refresh?: boolean): TPromise<IWebBrowserModel> {
		return TPromise.as(this.resolveSync());
	}

	public resolveSync(): IWebBrowserModel {
		throw new Error('unable to resolve');
	}

	private releaseModelReference(): void {
		if (this.modelReference) {
			this.modelReference.dispose();
			this.modelReference = null;
		}
	}

	public dispose(): void {
		this.releaseModelReference();
		super.dispose();
	}
}