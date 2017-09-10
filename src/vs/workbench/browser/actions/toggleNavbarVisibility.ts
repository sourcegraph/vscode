/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import { Registry } from 'vs/platform/registry/common/platform';
import { Action } from 'vs/base/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';

export abstract class NavbarVisibilityAction extends Action {

	public static ID = 'workbench.action.toggleNavbarVisibility';
	public static LABEL = nls.localize('toggleNavbar', "Toggle Nav Bar Visibility");

	private static navbarVisibleKey = 'workbench.navBar.visible';

	constructor(
		id: string,
		label: string,
		@IPartService private partService: IPartService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService
	) {
		super(id, label);

		this.enabled = !!this.partService;
	}

	protected getVisibility(): boolean {
		return this.partService.isVisible(Parts.NAVBAR_PART);
	}

	protected setVisibility(newVisibilityValue: boolean): TPromise<void> {
		return this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: NavbarVisibilityAction.navbarVisibleKey, value: newVisibilityValue });
	}

	public abstract run(): TPromise<any>;
}

export class HideNavbarAction extends NavbarVisibilityAction {

	public static ID = 'workbench.action.hideNavbar';
	public static LABEL = nls.localize('hideNavbar', "Hide Nav Bar");

	public run(): TPromise<any> {
		return this.setVisibility(false);
	}
}

export class ToggleNavbarVisibilityAction extends NavbarVisibilityAction {

	public static ID = 'workbench.action.toggleNavbarVisibility';
	public static LABEL = nls.localize('toggleNavbar', "Toggle Nav Bar Visibility");

	public run(): TPromise<any> {
		return this.setVisibility(!this.getVisibility());
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleNavbarVisibilityAction, ToggleNavbarVisibilityAction.ID, ToggleNavbarVisibilityAction.LABEL), 'View: Toggle Nav Bar Visibility', nls.localize('view', "View"));