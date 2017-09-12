/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ContextWidget } from 'vs/editor/contrib/context/browser/contextWidgets';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';

export class WorkbenchContextWidget extends ContextWidget {
	constructor(
		container: HTMLElement,
		editor: ICodeEditor,
		@IPartService private partService: IPartService,
	) {
		super(container, editor);

		this._register(partService.onEditorLayout(() => this.updateMaxHeight()));
	}

	public layout(): void {
		this.updateMaxHeight();
	}

	private updateMaxHeight(): void {
		const height = Math.max(window.innerHeight / 4, 350);
		this._domNode.style.maxHeight = `${height}px`;
	}
}