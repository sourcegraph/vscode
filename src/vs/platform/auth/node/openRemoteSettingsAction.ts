/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRemoteConfiguration } from 'vs/platform/remote/node/remote';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IOpenerService } from 'vs/platform/opener/common/opener';

/**
 * OpenRemoteSettingsAction opens a user's remote settings page
 */
export class OpenRemoteSettingsAction extends Action {
	public static ID = 'remote.auth.openRemoteSettingsAction';
	public static LABEL = localize('remote.auth.openRemoteSettingsLabel', "Manage Sourcegraph Account and Team Settings");

	constructor(
		id: string,
		label: string,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IOpenerService private openerService: IOpenerService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		this.telemetryService.publicLog('RemoteSettingsOpened');
		const config = this.configurationService.getConfiguration<IRemoteConfiguration>();
		if (!config.remote || !config.remote.endpoint) {
			throw new Error('unable to open settings because remote.endpoint configuration setting is not present');
		}
		// TODO(Dan); this doesn't exist yet
		this.openerService.open(URI.parse(config.remote.endpoint).with({ path: '/settings' }));
		return TPromise.as(void 0);
	}
}

