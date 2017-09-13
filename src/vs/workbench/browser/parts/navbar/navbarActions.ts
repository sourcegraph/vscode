/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
import { TPromise } from 'vs/base/common/winjs.base';
import { $ } from 'vs/base/browser/builder';
import { Action } from 'vs/base/common/actions';
import { ActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IActivityBarService } from 'vs/workbench/services/activity/common/activityBarService';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { NavigateBackwardsAction, NavigateForwardAction, ClearEditorHistoryAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { IHistoryService, IStackEntry } from 'vs/workbench/services/history/common/history';
import { IEditorInput } from 'vs/platform/editor/common/editor';
import { IWorkbenchEditorService, IResourceInputType } from 'vs/workbench/services/editor/common/editorService';
import { INavBarService } from 'vs/workbench/services/nav/common/navBar';
import { INavService } from 'vs/workbench/services/nav/common/nav';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';
import { NavbarPart } from 'vs/workbench/browser/parts/navbar/navbarPart';

export class FocusLocationBarAction extends Action {

	public static ID = 'workbench.action.focusLocationBar';
	public static LABEL = nls.localize('focusLocationBar', "Focus on Location Bar");

	private static navbarVisibleKey = 'workbench.navBar.visible';

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService,
		@INavBarService private navBarService: INavBarService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let p: TPromise<any>;

		const visible = this.partService.isVisible(Parts.NAVBAR_PART);
		if (!visible) {
			p = this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: FocusLocationBarAction.navbarVisibleKey, value: true });
		} else {
			p = TPromise.as(void 0);
		}

		return p.then(() => this.navBarService.focusLocationBar());
	}
}

export class CopyLocationAction extends Action {

	public static ID = 'workbench.action.copyLocation';
	public static LABEL = nls.localize('copyLocation', "Copy Address in Location Bar");

	constructor(
		id: string,
		label: string,
		@INavService private navService: INavService,
		@IClipboardService private clipboardService: IClipboardService,
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const location = this.navService.getLocation();
		if (location) {
			this.clipboardService.writeText(location.toString(true));
		}

		return TPromise.as(null);
	}
}

export class ShareLocationAction extends Action {

	public static ID = 'workbench.action.shareLocation';
	public static LABEL = nls.localize('shareLocation', "Copy Shareable URL to Current File");

	constructor(
		id: string,
		label: string,
		@INavService private navService: INavService,
		@INavBarService private navBarService: INavBarService,
		@IClipboardService private clipboardService: IClipboardService,
		@IPartService private partService: IPartService,
	) {
		super(id, label, 'share-location-action');
	}

	public run(): TPromise<any> {
		const location = this.navService.getShareableLocation();
		this.clipboardService.writeText(location);

		if (this.partService.isVisible(Parts.NAVBAR_PART)) {
			const navbarPart = this.navBarService as NavbarPart;
			if (navbarPart.locationBarInput) {
				navbarPart.locationBarInput.showMessage(nls.localize('copiedShareableLocation', "Copied shareable link to current file and position."));
			}
		}

		return TPromise.as(null);
	}
}

export class LocationHistoryActionItem extends ActionItem {

	private static MAX_ENTRIES = 20;

	private static clearEditorHistoryAction: ClearEditorHistoryAction;

	constructor(
		private action: NavigateBackwardsAction | NavigateForwardAction,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IActivityBarService private activityBarService: IActivityBarService,
		@IHistoryService private historyService: IHistoryService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(null, action, { icon: true, label: false, keybinding: LocationHistoryActionItem.getKeybindingLabel(keybindingService, action.id) });

		if (!LocationHistoryActionItem.clearEditorHistoryAction) {
			LocationHistoryActionItem.clearEditorHistoryAction = instantiationService.createInstance(ClearEditorHistoryAction, ClearEditorHistoryAction.ID, ClearEditorHistoryAction.LABEL);
		}
	}

	private static getKeybindingLabel(keybindingService: IKeybindingService, id: string): string {
		const kb = keybindingService.lookupKeybinding(id);
		if (kb) {
			return kb.getLabel();
		}

		return null;
	}

	public render(container: HTMLElement): void {
		super.render(container);

		$(container).on('contextmenu', e => {
			DOM.EventHelper.stop(e, true);

			if (this.action.enabled) {
				this.showContextMenu(container);
			}
		});
	}

	private showContextMenu(container: HTMLElement): void {
		const actions: Action[] = [];

		const { stack, index } = this.historyService.getStack();
		let entries: IStackEntry[];
		if (this.action instanceof NavigateForwardAction) {
			entries = stack.slice(index + 1);
		} else {
			entries = stack.slice(0, index).reverse();
		}
		if (entries.length > LocationHistoryActionItem.MAX_ENTRIES) {
			entries = entries.slice(0, LocationHistoryActionItem.MAX_ENTRIES);
		}

		for (let i = 0; i < entries.length; i++) {
			let offset: number;
			if (this.action instanceof NavigateForwardAction) {
				offset = i;
			} else {
				offset = -1 * i;
			}

			const entry = entries[i];

			const input = this.editorService.createInput(entry.input as (IEditorInput & IResourceInputType));
			let label: string;
			if (entry.selection) {
				const nameAndSelection = input.getName() + ':' + entry.selection.startLineNumber;
				if (input.getDescription()) {
					label = nls.localize('historyEntryWithSelection', "{0} — {1}", nameAndSelection, input.getDescription());
				} else {
					label = nameAndSelection;
				}
			} else {
				if (input.getDescription()) {
					label = nls.localize('historyEntry', "{0} — {1}", input.getName(), input.getDescription());
				} else {
					label = input.getName();
				}
			}

			actions.push(new Action('navigate', label, undefined, true, () => {
				this.historyService.go(offset);
				return TPromise.as(void 0);
			}));
		}

		actions.push(
			new Separator(),
			LocationHistoryActionItem.clearEditorHistoryAction,
		);

		this.contextMenuService.showContextMenu({
			getAnchor: () => container,
			getActions: () => TPromise.as(actions),
			// TODO(sqs): keybinding
		});
	}
}
