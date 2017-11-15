/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import Webview from 'vs/workbench/parts/html/browser/webview';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS, KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED } from 'vs/workbench/parts/html/browser/webviewEditor';
import { IThemeService, ITheme } from 'vs/platform/theme/common/themeService';
import { toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { Color } from 'vs/base/common/color';
import { IViewZoneEvent } from 'vs/workbench/api/node/extHost.protocol';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { addDisposableListener } from 'vs/base/browser/dom';
import Event, { Emitter } from 'vs/base/common/event';
import { isUndefined } from 'vs/base/common/types';
import { ThrottledDelayer } from 'vs/base/common/async';
import { MenuId, IMenuService, IMenu, MenuItemAction } from 'vs/platform/actions/common/actions';
import { ActionsOrientation, IActionBarOptions } from 'vs/base/browser/ui/actionbar/actionbar';
import { IAction, ActionRunner, IActionItem } from 'vs/base/common/actions';
import { fillInActions, MenuItemActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { Severity, IMessageService } from 'vs/platform/message/common/message';
import { TPromise } from 'vs/base/common/winjs.base';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import * as vscode from 'vscode';
import { PeekViewWidget } from 'vs/editor/contrib/referenceSearch/peekViewWidget';
import { peekViewBorder, peekViewTitleBackground, peekViewTitleForeground, peekViewTitleInfoForeground } from 'vs/editor/contrib/referenceSearch/referencesWidget';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ICommandHandler } from 'vs/platform/commands/common/commands';
import { WebviewTag } from 'electron';

// TODO(sqs): allow creating ZoneWidgets (not PeekViewWidgets), for extensions that don't need
// to render a header.

// TODO@Joao
// Need to subclass MenuItemActionItem in order to respect
// the action context coming from any action bar, without breaking
// existing users
class ViewZoneMenuItemActionItem extends MenuItemActionItem {

	onClick(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();

		this.actionRunner.run(this._commandAction, this._context)
			.done(undefined, err => this._messageService.show(Severity.Error, err));
	}
}

class ViewZoneActionRunner extends ActionRunner {

	runAction(action: IAction, context: any): TPromise<any> {
		if (action instanceof MenuItemAction) {
			return action.run(...context);
		}

		return super.runAction(action, context);
	}
}

const viewZoneVisibleContextKey = new RawContextKey<boolean>('viewZoneVisible', false);

export class MainThreadViewZone extends PeekViewWidget {

	private webview: Webview;
	private webviewLayoutThrottledDelayer = new ThrottledDelayer<void>(100);
	protected focusContextKey: IContextKey<boolean>;
	protected findInputFocusContextKey: IContextKey<boolean>;

	private contextKeyService: IContextKeyService;
	private menu: IMenu;

	private _onMessage = new Emitter<string>();
	public get onMessage(): Event<string> { return this._onMessage.event; }

	private controller: TextEditorViewZoneController;

	constructor(
		editor: ICodeEditor,
		id: string,
		private contents: vscode.ViewZoneContents,
		private _toJSON: any,
		@IPartService private partService: IPartService,
		@IContextViewService private contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IThemeService private themeService: IThemeService,
		@IOpenerService private openerService: IOpenerService,
		@IMenuService private menuService: IMenuService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IMessageService private messageService: IMessageService,
	) {
		super(editor, {
			showFrame: true,
			showArrow: true,
			isAccessible: true,
			isResizeable: false,
		});

		this.focusContextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS.bindTo(contextKeyService);
		this.findInputFocusContextKey = KEYBINDING_CONTEXT_WEBVIEWEDITOR_FIND_WIDGET_INPUT_FOCUSED.bindTo(contextKeyService);

		this.contextKeyService = contextKeyService.createScoped();
		this.contextKeyService.createKey('viewZone', id);
		this.menu = this.menuService.createMenu(MenuId.ViewZoneTitle, this.contextKeyService);

		this.controller = TextEditorViewZoneController.get(editor);
		this.controller.register(this);
		this._disposables.push(toDisposable(() => this.controller.unregister(this)));

		this.create();
	}

	public get focused(): boolean {
		return this.focusContextKey.get();
	}

	public get webviewTag(): WebviewTag {
		return this.webview.domNode as WebviewTag;
	}

	/**
	 * Handles an event from the extension host.
	 */
	public handleEvent(event: IViewZoneEvent): void {
		if (!isUndefined(event.message)) {
			this.postMessage(event.message);
		}

		if (event.show) {
			if (isUndefined(this.heightInLines)) {
				// TODO(sqs): There should be a way to compute height before showing the webview. That seems
				// to be necessary to avoid this the visual jitter upon initial load.
				//
				// console.warn('Perf warning: calling TextEditorViewZone#show before the view zone\'s height is known will cause visual jitter when it is resized to the correct height.');
			}
			this.show(event.show.positionOrRange, this.heightInLines || 2 /* just enough to show the title */);
		}

		if (event.hide) {
			this.hide();
		}

		if (event.header) {
			this.setTitle(event.header.primaryHeading, event.header.secondaryHeading);
			this.setMetaTitle(event.header.metaHeading);
		}
	}

	/**
	 * Sends a message to the webview's contents iframe.
	 */
	private postMessage(message: string): void {
		this.webview.sendMessage(message);
	}

	public get isVisible(): boolean { return this._isShowing; }

	protected _fillHead(container: HTMLElement): void {
		super._fillHead(container);

		const actions: IAction[] = [];
		fillInActions(this.menu, { shouldForwardArgs: true }, actions);
		this._actionbarWidget.push(actions, { label: false, icon: true });
	}

	protected _getActionBarOptions(): IActionBarOptions {
		return {
			actionRunner: new ViewZoneActionRunner(),
			actionItemProvider: action => this.getActionItem(action),
			orientation: ActionsOrientation.HORIZONTAL_REVERSE,
			context: [this],
		};
	}

	getActionItem(action: IAction): IActionItem {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ViewZoneMenuItemActionItem(action, this.keybindingService, this.messageService);
	}

	protected _fillBody(container: HTMLElement): void {
		this.webview = new Webview(
			container,
			this.partService.getContainer(Parts.EDITOR_PART),
			this.contextViewService,
			this.focusContextKey,
			this.findInputFocusContextKey,
			{
				allowScripts: true,
				allowSvgs: true,

				// Because the view zone manages its own height, we must prevent scrollbars from appearing.
				// If they appear, then it can get into an infinite resize cycle where it alternates between
				// requesting height X with scrollbars present (which reduce the width slightly) and
				// height X-Y without scrollbars.
				insertCss: 'body { overflow: hidden; }',
			},
		);
		this.webview.ready.then(w => w.focus());

		// Set initial width to eliminate a height computation roundtrip.
		this.webview.domNode.style.width = this._getWidth() + 'px';

		this._applyTheme(this.themeService.getTheme());
		this.webview.contents = [this.contents.value];

		this.themeService.onThemeChange(theme => this._applyTheme(theme), null, this._disposables);
		this.webview.onDidClickLink(uri => this.openerService.open(uri), null, this._disposables);
		this._disposables.push(this.webview);
		this._disposables.push(toDisposable(() => this.webview = null));

		this._disposables.push(addDisposableListener(this.webview.domNode, 'ipc-message', event => {
			if (event.channel === 'extension-view-message') {
				const message: string = event.args[0];
				this._onMessage.fire(message);
			}
			if (event.channel === 'extension-view-request-layout') {
				const height: number | undefined = event.args[0];
				this.relayoutBody(height);
			}
		}));
	}

	private _applyTheme(theme: ITheme) {
		let borderColor = theme.getColor(peekViewBorder) || Color.transparent;
		this.style({
			arrowColor: borderColor,
			frameColor: borderColor,
			headerBackgroundColor: theme.getColor(peekViewTitleBackground) || Color.transparent,
			primaryHeadingColor: theme.getColor(peekViewTitleForeground),
			secondaryHeadingColor: theme.getColor(peekViewTitleInfoForeground),
		});
	}

	protected _applyStyles(): void {
		super._applyStyles();

		if (this.webview) {
			this.webview.style(this.themeService.getTheme());
		}
	}

	public _doLayout(heightInPixel: number, widthInPixel: number): void {
		super._doLayout(heightInPixel, widthInPixel);
		this.layoutWebview();
	}

	private headHeight: number = 0;
	protected _doLayoutHead(heightInPixel: number, widthInPixel: number): void {
		super._doLayoutHead(heightInPixel, widthInPixel);
		this.headHeight = heightInPixel;
	}

	protected _onWidth(widthInPixel: number): void {
		super._onWidth(widthInPixel);
		this.layoutWebview();
	}

	private webviewNeedsInitialLayout: boolean = true;
	private layoutWebview(): void {
		let delay = this.webviewLayoutThrottledDelayer.defaultDelay;
		if (this.webviewNeedsInitialLayout) {
			this.webviewNeedsInitialLayout = false;
			delay = 0;
		}
		this.webviewLayoutThrottledDelayer.trigger(() => this.webview.layout(), delay);
	}

	private heightInLines: number | undefined;
	private relayoutBody(bodyHeightInPixel: number | undefined): void {
		const totalHeight = bodyHeightInPixel + this._decoratingElementsHeight() + this.headHeight;
		const lineHeight = this.editor.getConfiguration().lineHeight;
		this.heightInLines = Math.ceil(totalHeight / lineHeight);
		this._relayout(this.heightInLines);
	}

	public toJSON(): any { return this._toJSON; }
}

/**
 * Manage all active view zones so that we can bind a hotkey (Escape) to close all view zones.
 */
class TextEditorViewZoneController extends Disposable implements IEditorContribution {

	private static ID = 'editor.contrib.textEditorViewZone';

	public static get(editor: ICodeEditor): TextEditorViewZoneController {
		return editor.getContribution<TextEditorViewZoneController>(TextEditorViewZoneController.ID);
	}

	private readonly viewZoneVisibleContextKey: IContextKey<boolean>;
	private viewZones = new Set<MainThreadViewZone>();

	constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		this.viewZoneVisibleContextKey = viewZoneVisibleContextKey.bindTo(contextKeyService);
	}

	public getId(): string {
		return TextEditorViewZoneController.ID;
	}

	public register(viewZone: MainThreadViewZone): void {
		this.viewZones.add(viewZone);

		// TODO(sqs): actually track if these are visible
		this.viewZoneVisibleContextKey.set(true);
	}

	public getFocusedViewZone(): MainThreadViewZone {
		let focusedViewZone: MainThreadViewZone;
		this.viewZones.forEach(viewZone => {
			if (viewZone.focused) {
				focusedViewZone = viewZone;
			}
		});
		return focusedViewZone;
	}

	public unregister(viewZone: MainThreadViewZone): void {
		this.viewZones.delete(viewZone);
	}

	public close(): void {
		this.viewZones.forEach(viewZone => {
			viewZone.dispose();
		});
		this.viewZoneVisibleContextKey.set(false);
	}
}

registerEditorContribution(TextEditorViewZoneController);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeTextEditorViewZone',
	weight: KeybindingsRegistry.WEIGHT.editorContrib(50),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: viewZoneVisibleContextKey,
	handler: getTextEditorViewZoneHandler(controller => controller.close()),
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'textEditorViewZoneSelectAll',
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	handler: getTextEditorViewZoneHandler(controller => {
		controller.getFocusedViewZone().webviewTag.selectAll();
	}),
	when: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_A
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'textEditorViewZoneCut',
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	handler: getTextEditorViewZoneHandler(controller => {
		controller.getFocusedViewZone().webviewTag.cut();
	}),
	when: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_X
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'textEditorViewZoneCopy',
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	handler: getTextEditorViewZoneHandler(controller => {
		controller.getFocusedViewZone().webviewTag.copy();
	}),
	when: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_C
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'textEditorViewZonePaste',
	weight: KeybindingsRegistry.WEIGHT.editorContrib(),
	handler: getTextEditorViewZoneHandler(controller => {
		controller.getFocusedViewZone().webviewTag.paste();
	}),
	when: KEYBINDING_CONTEXT_WEBVIEWEDITOR_FOCUS,
	primary: KeyMod.CtrlCmd | KeyCode.KEY_V
});


function getTextEditorViewZoneHandler(handler: (controller: TextEditorViewZoneController) => void): ICommandHandler {
	return accessor => {
		const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (!editor) {
			return;
		}
		const controller = TextEditorViewZoneController.get(editor);
		if (!controller) {
			return;
		}
		handler(controller);
	};
}
