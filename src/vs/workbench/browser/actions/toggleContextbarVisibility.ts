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

export abstract class ContextbarVisibilityAction extends Action {

	public static ID = 'workbench.action.toggleContextbarVisibility';
	public static LABEL = nls.localize('toggleContextbar', "Toggle Context Bar Visibility");

	private static contextbarVisibleKey = 'workbench.contextBar.visible';

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
		return this.partService.isVisible(Parts.CONTEXTBAR_PART);
	}

	protected setVisibility(newVisibilityValue: boolean): TPromise<void> {
		return this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: ContextbarVisibilityAction.contextbarVisibleKey, value: newVisibilityValue });
	}

	public abstract run(): TPromise<any>;
}

export class HideContextbarAction extends ContextbarVisibilityAction {

	public static ID = 'workbench.action.hideContextbar';
	public static LABEL = nls.localize('hideContextbar', "Hide Context Bar");

	public run(): TPromise<any> {
		return this.setVisibility(false);
	}
}

export class ToggleContextbarVisibilityAction extends ContextbarVisibilityAction {

	public static ID = 'workbench.action.toggleContextbarVisibility';
	public static LABEL = nls.localize('toggleContextbar', "Toggle Context Bar Visibility");

	public run(): TPromise<any> {
		return this.setVisibility(!this.getVisibility());
	}
}

const registry = Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(ToggleContextbarVisibilityAction, ToggleContextbarVisibilityAction.ID, ToggleContextbarVisibilityAction.LABEL), 'View: Toggle Context Bar Visibility', nls.localize('view', "View"));