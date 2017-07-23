/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { IRequestOptions, IRequestContext } from 'vs/base/node/request';
import { IRequestService } from 'vs/platform/request/node/request';
import { IRemoteService, IRemoteConfiguration } from 'vs/platform/remote/node/remote';
import { IConfigurationService, IConfigurationServiceEvent } from 'vs/platform/configuration/common/configuration';

/**
 * This service exposes the remote endpoint, if any.
 */
export class RemoteService implements IRemoteService {

	_serviceBrand: any;

	private endpoint: URI | null = null;
	private disposables: IDisposable[] = [];

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IRequestService private requestService: IRequestService,
	) {
		this.configure(configurationService.getConfiguration<IRemoteConfiguration>());
		configurationService.onDidUpdateConfiguration(this.onDidUpdateConfiguration, this, this.disposables);
	}

	private onDidUpdateConfiguration(e: IConfigurationServiceEvent) {
		this.configure(this.configurationService.getConfiguration<IRemoteConfiguration>());
	}

	private configure(config: IRemoteConfiguration) {
		if (config.remote && config.remote.endpoint) {
			this.endpoint = URI.parse(config.remote.endpoint);
		} else {
			this.endpoint = null;
		}
	}

	request(options: IRequestOptions): TPromise<IRequestContext> {
		const url = URI.parse(options.url);
		if (url.scheme || url.authority || url.fragment) {
			return TPromise.wrapError(new Error('invalid remote URL (may only contain path and query): ' + url.toString()));
		}
		options = { ...options, url: this.endpoint.with({ path: url.path, query: url.query }).toString() };
		return this.requestService.request(options);
	}
}
