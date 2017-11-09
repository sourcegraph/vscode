/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { WebBrowserInput as BaseWebBrowserInput } from 'vs/workbench/parts/webbrowser/common/webBrowser';
import { WebBrowserModel } from 'vs/workbench/parts/webbrowser/electron-browser/webBrowserModel';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

export class WebBrowserInput extends BaseWebBrowserInput {

	constructor(
		url: URI,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super(url);
	}

	public resolveSync(): WebBrowserModel {
		if (!this.modelReference) {
			const model = this.instantiationService.createInstance(WebBrowserModel);
			this.modelReference = {
				object: model,
				dispose: () => model.dispose(),
			};
		}

		return this.modelReference.object as WebBrowserModel;
	}
}
