/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { Button } from 'vs/base/browser/ui/button/button';
import { $ } from 'vs/base/browser/builder';
import { ViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUpdateService } from 'vs/platform/update/common/update';

/**
 * UpdateView is a collapasble viewlet rendered in the ManagementViewlet
 * and is displayed when an update is available.
 */
export class UpdateView extends ViewsViewletPanel {

	public static readonly ID = 'management.updateView';

	constructor(
		options: IViewletViewOptions,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IUpdateService private updateService: IUpdateService
	) {
		super({ ...(options as IViewOptions) }, keybindingService, contextMenuService);
		this.minimumBodySize = 56;
		this.maximumBodySize = 56;
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(this.name).appendTo(titleDiv);
	}

	protected renderBody(container: HTMLElement): void {
		const updateDiv = $('div.section').appendTo(container);
		const buttonContainer = $('div').appendTo(updateDiv).padding(15, 15, 15, 15);
		const updateButton = new Button(buttonContainer);
		updateButton.label = nls.localize('miRestartToUpdate', 'Restart to update');
		updateButton.addListener('click', () => {
			this.telemetryService.publicLog('workbenchActionExecuted', { id: 'RestartToUpdate', from: 'managementViewlet' });
			this.updateService.quitAndInstall();
		});
	}
}
