/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./dynamicOverlay';
import { $, Builder } from 'vs/base/browser/builder';
import * as dom from 'vs/base/browser/dom';
import { Registry } from 'vs/platform/platform';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

const OVERLAY_VISIBLE = new RawContextKey<boolean>('interfaceOverviewVisible', false);

let dynamicOverlay: DynamicOverlay;

export class DynamicOverlayAction extends Action {

	public static ID = 'workbench.action.showDynamicInterfaceOverview';
	public static LABEL = localize('dynamicOverlay', "User Interface Overview");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(event?: any, data?: any): TPromise<any> {
		if (!dynamicOverlay) {
			dynamicOverlay = this.instantiationService.createInstance(DynamicOverlay);
		}
		dynamicOverlay.show();
		return null;
	}
}

export class HideDynamicOverlayAction extends Action {

	public static ID = 'workbench.action.hideDynamicInterfaceOverview';
	public static LABEL = localize('hideWelcomeOverlay', "Hide Interface Overview");

	constructor(
		id: string,
		label: string
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		if (dynamicOverlay) {
			dynamicOverlay.hide();
		}
		return null;
	}
}

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

	public create(content: Builder): void {
		const container = this.partService.getContainer(Parts.EDITOR_PART);

		const offset = this.partService.getTitleBarOffset();
		this._overlay = $(container.parentElement)
			.div({ 'class': 'welcomeOverlay' })
			.style({ top: `${offset}px` })
			.style({ height: `calc(100% - ${offset}px)` })
			.display('none');

		this._overlay.on('click', () => this.hide(), this._toDispose);
		this.commandService.onWillExecuteCommand(() => this.hide());

		$(this._overlay).div({ 'class': 'commandPalettePlaceholder' });

		if (content) {
			console.log(`we have content sooooo yay!`);
			$(this._overlay).append(content);
		}
	}

	public show() {
		if (!this._overlay) {
			console.error('Create must be called before calling show() dynamicOverlay');
			return;
		}

		if (this._overlay.style('display') !== 'block') {
			this._overlay.display('block');
			const workbench = document.querySelector('.monaco-workbench') as HTMLElement;
			dom.addClass(workbench, 'blur-background');
			this._overlayVisible.set(true);
		}
	}

	public hide() {
		if (this._overlay.style('display') !== 'none') {
			this._overlay.display('none');
			const workbench = document.querySelector('.monaco-workbench') as HTMLElement;
			dom.removeClass(workbench, 'blur-background');
			this._overlayVisible.reset();
		}
	}

	dispose() {
		this._toDispose = dispose(this._toDispose);
	}
}

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(DynamicOverlayAction, DynamicOverlayAction.ID, DynamicOverlayAction.LABEL), 'Help: Show Interface Overview', localize('help', "Help"));

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(HideDynamicOverlayAction, HideDynamicOverlayAction.ID, HideDynamicOverlayAction.LABEL, { primary: KeyCode.Escape }, OVERLAY_VISIBLE), 'Help: Hide Interface Overview', localize('help', "Help"));
