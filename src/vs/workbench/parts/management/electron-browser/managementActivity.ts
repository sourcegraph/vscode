/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDisposable, dispose, empty as EmptyDisposable } from 'vs/base/common/lifecycle';
import { IActivityBarService, NumberBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { VIEWLET_ID } from 'vs/workbench/parts/management/common/management';
import { IStorageService } from 'vs/platform/storage/common/storage';

/**
 * ManagementUpdater adds the appropriate badge count to the ManagementViewlet ActivityActionItem in the activity bar.
 */
export class ManagementUpdater implements IWorkbenchContribution {
	private static ID = 'vs.management.managementUpdater';
	public static CODE_HOST_VIEW_TOGGLED = 'CODE_HOST_VIEW_TOGGLED';

	private badgeDisposable: IDisposable = EmptyDisposable;
	private disposables: IDisposable[] = [];

	constructor(
		@IActivityBarService private activityBarService: IActivityBarService,
		@IViewletService private viewletService: IViewletService,
		@IStorageService private storageService: IStorageService,
	) {
		// Only register listener if the user has not navigated to the management viewlet before.
		if (!this.getHasToggledCodeViewlet()) {
			this.disposables.push(this.viewletService.onDidViewletOpen((e) => {
				if (e.getId() === VIEWLET_ID) {
					this.updateCodeHostViewToggled();
				}
			}));
			this.render();
		}
	}

	getId(): string {
		return ManagementUpdater.ID;
	}

	/**
	 * Updates the badge on the account management global action
	 */
	private render(): void {
		this.badgeDisposable.dispose();
		if (!this.getHasToggledCodeViewlet()) {
			this.badgeDisposable = this.activityBarService.showActivity(VIEWLET_ID, new NumberBadge(1, () => localize('connectCodeHost', "Connect code host")), 'management-viewlet-label');
		}
	}

	/**
	 * Responsible for removing the badge for the code host view once it is toggled.
	 */
	private updateCodeHostViewToggled(): void {
		this.storageService.store(ManagementUpdater.CODE_HOST_VIEW_TOGGLED, true);
		this.render();
	}

	/**
	 * Returns if the user has toggled the account management viewlet
	 */
	private getHasToggledCodeViewlet(): boolean {
		return Boolean(this.storageService.get(ManagementUpdater.CODE_HOST_VIEW_TOGGLED));
	}

	dispose(): void {
		this.badgeDisposable.dispose();
		this.disposables = dispose(this.disposables);
	}
}
