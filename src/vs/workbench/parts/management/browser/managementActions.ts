/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { IAuthService } from 'vs/platform/auth/common/auth';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

export class RefreshProfileAction extends Action {
	public static readonly ID = 'management.action.refresh';

	constructor(
		enabled: boolean,
		clazz: string,
		@IAuthService private authService: IAuthService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		super(RefreshProfileAction.ID, nls.localize('refresh', "Refresh"), clazz, enabled, (context: any) => {
			// Check for new org data.
			this.telemetryService.publicLog('RefreshOrgClicked');
			this.authService.refresh();
			return TPromise.as(null);
		});
	}
}

export class CreateOrganizationAction extends Action {
	public static readonly ID = 'management.action.createOrganization';

	constructor(
		viewer: ITree,
		enabled: boolean,
		clazz: string,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		super(CreateOrganizationAction.ID, nls.localize('management.createOrganization', "Create Organization"), clazz, enabled, (context: any) => {
			this.telemetryService.publicLog('CreateOrgClicked');
			window.open('https://sourcegraph.com/settings/teams/new');
			return TPromise.as(null);
		});
	}
}