/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./dynamicOverlay';
import { $, Builder } from 'vs/base/browser/builder';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

const OVERLAY_VISIBLE = new RawContextKey<boolean>('interfaceOverviewVisible', false);

export class DynamicOverlay {

	private _toDispose: IDisposable[] = [];
	private _overlayVisible: IContextKey<boolean>;
	private _overlay: Builder;

	constructor(
		@IPartService private partService: IPartService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ICommandService private commandService: ICommandService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		this._overlayVisible = OVERLAY_VISIBLE.bindTo(this._contextKeyService);
	}

	public create(content?: Builder, overlayStyles?: any): void {
		const container = this.partService.getContainer(Parts.EDITOR_PART);

		const isStatusbarHidden = !this.partService.isVisible(Parts.STATUSBAR_PART);
		const offset = isStatusbarHidden ? 0 : 32;
		this._overlay = $(container.parentElement)
			.div({ 'class': 'dynamicOverlay' })
			.style(overlayStyles ? overlayStyles : { height: `calc(100% - ${offset}px)`, backgroundColor: 'white' })
			.display('none');
		this._toDispose.push(this._overlay);

		if (content) {
			$(this._overlay).append(content);
		}
	}

	public show() {
		if (!this._overlay) {
			console.error('Create must be called before calling show() dynamicOverlay');
			return;
		}
		if (this._overlay.style('display') !== 'flex') {
			this._overlay.display('flex');
			this._overlayVisible.set(true);
		}
	}

	public hide() {
		this._overlay.display('none');
		this._overlayVisible.reset();
	}

	public destory() {
		this.hide();
		this._overlay.destroy();
	}

	dispose() {
		this._toDispose = dispose(this._toDispose);
	}
}
