/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { ViewletActivityAction } from 'vs/workbench/browser/parts/activitybar/activitybarActions';
import { ActivityActionItem } from 'vs/workbench/browser/parts/compositebar/compositeBarActions';
import { IActivity, IGlobalActivity } from 'vs/workbench/common/activity';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IActivityBarService } from 'vs/workbench/services/activity/common/activityBarService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { GlobalViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import DOM = require('vs/base/browser/dom');
import { IAction } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';

/**
 * GlobalViewletActionItem creates a viewlet action item in the global activity bar. This is useful if a user wishes to
 * render an action item in the global bar and trigger a viewlet instead of a command pallet.
 */
export class GlobalViewletActionItem extends ActivityActionItem {
	private viewletActivity: IActivity;
	private cssClass: string;
	private globalActivity: IGlobalActivity;

	constructor(
		private action: ViewletActivityAction,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IActivityBarService private activityBarService: IActivityBarService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IViewletService private viewletService: IViewletService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService
	) {
		super(action, { draggable: false }, themeService);
		this.cssClass = action.class;
		this.viewletService.onDidViewletClose((e) => {
			this.action.checked = false;
		});
		this.viewletService.onDidViewletOpen((e) => {
			const active = this.viewletService.getActiveViewlet();
			if (this.activity.id === active.getId()) {
				this.action.checked = true;
			}
		});
		if (this.action.activity instanceof GlobalViewletDescriptor) {
			this.globalActivity = this.instantiationService.createInstance(this.action.activity.globalActivity);
		}
	}

	private getKeybindingLabel(id: string): string {
		const kb = this.keybindingService.lookupKeybinding(id);
		return kb && kb.getLabel();
	}

	protected get activity(): IActivity {
		if (!this.viewletActivity) {
			let activityName: string;

			const keybinding = this.getKeybindingLabel(this.action.activity.id);
			if (keybinding) {
				activityName = nls.localize('titleKeybinding', "{0} ({1})", this.action.activity.name, keybinding);
			} else {
				activityName = this.action.activity.name;
			}

			this.viewletActivity = {
				id: this.action.activity.id,
				cssClass: this.cssClass,
				name: activityName
			};
		}

		return this.viewletActivity;
	}

	public render(container: HTMLElement): void {
		super.render(container);
		this.$container.on('contextmenu', e => {
			DOM.EventHelper.stop(e, true);

			this.showContextMenu(container);
		});

		this.updateStyles();
	}

	private showContextMenu(container: HTMLElement): void {
		if (this.globalActivity) {
			const actions: IAction[] = this.globalActivity.getActions();
			this.contextMenuService.showContextMenu({
				getAnchor: () => container,
				getActionsContext: () => this.activity.id,
				getActions: () => TPromise.as(actions)
			});
		}
	}

	public focus(): void {
		this.$container.domFocus();
	}

	protected _updateClass(): void {
		if (this.cssClass) {
			this.$badge.removeClass(this.cssClass);
		}

		this.cssClass = this.getAction().class;
		this.$badge.addClass(this.cssClass);
	}

	protected _updateChecked(): void {
		if (this.getAction().checked) {
			this.$container.addClass('checked');
		} else {
			this.$container.removeClass('checked');
		}
	}

	protected _updateEnabled(): void {
		if (this.getAction().enabled) {
			this.builder.removeClass('disabled');
		} else {
			this.builder.addClass('disabled');
		}
	}

	public dispose(): void {
		super.dispose();

		this.$label.destroy();
	}
}
