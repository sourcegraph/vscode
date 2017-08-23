/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { Disposable } from 'vs/base/common/lifecycle';
import { IRequestOptions, IRequestContext } from 'vs/base/node/request';
import { IRequestService } from 'vs/platform/request/node/request';
import { IRemoteService, IRemoteConfiguration } from 'vs/platform/remote/node/remote';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

/**
 * This service exposes the remote endpoint, if any.
 */
export class RemoteService extends Disposable implements IRemoteService {

	_serviceBrand: any;

	private endpoint: URI | null = null;
	private cookie: string | null = null;

	constructor(
		@IConfigurationService protected configurationService: IConfigurationService,
		@IRequestService private requestService: IRequestService,
	) {
		super();
		this.configure(configurationService.getConfiguration<IRemoteConfiguration>());
		this._register(configurationService.onDidUpdateConfiguration(() => this.onDidUpdateConfiguration()));
	}

	private onDidUpdateConfiguration() {
		this.configure(this.configurationService.getConfiguration<IRemoteConfiguration>());
	}

	private configure(config: IRemoteConfiguration) {
		if (config.remote && config.remote.endpoint) {
			this.endpoint = URI.parse(config.remote.endpoint);
			this.cookie = config.remote.cookie;
		} else {
			this.endpoint = null;
			this.cookie = null;
		}
	}

	request(options: IRequestOptions): TPromise<IRequestContext> {
		const url = URI.parse(options.url);
		if (url.scheme || url.authority || url.fragment) {
			return TPromise.wrapError(new Error('invalid remote URL (may only contain path and query): ' + url.toString()));
		}
		options = { ...options, url: this.endpoint.with({ path: url.path, query: url.query }).toString() };
		if (this.cookie) {
			if (!options.headers) {
				options.headers = {};
			}
			options.headers['Authorization'] = `session ${this.cookie}`;
		}
		return this.requestService.request(options).then(undefined, err => {
			if (err instanceof ProgressEvent) {
				// Convert ProgressEvent to an actual error with a useful error message.
				throw new ProgressEventError(err);
			}
			throw err;
		});
	}
}

export class ProgressEventError extends Error {
	constructor(public readonly progressEvent: ProgressEvent) {
		super(localize('progressEventErrorMessage', "Network request failed."));
	}
}