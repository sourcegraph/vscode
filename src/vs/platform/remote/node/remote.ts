/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IRequestOptions, IRequestContext, asJson } from 'vs/base/node/request';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { Registry } from 'vs/platform/registry/common/platform';

export const IRemoteService = createDecorator<IRemoteService>('remoteService');

export interface IRemoteService {
	_serviceBrand: any;

	/**
	 * Issues a request to the remote server's endpoint.
	 */
	request(options: IRequestOptions): TPromise<IRequestContext>;
}

export interface IRemoteConfiguration {
	remote?: {
		endpoint?: string;
	};
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration({
		id: 'remote',
		order: 16,
		title: localize('TODO-1', "Remote"),
		type: 'object',
		properties: {
			'remote.endpoint': {
				type: 'string',
				pattern: '^https?://([^:]*(:[^@]*)?@)?([^:]+)(:\\d+)?/?$|^$',
				description: localize('TODO-2', "The URL to the Sourcegraph or Sourcegraph Enterprise server."),
				default: 'https://sourcegraph.com',
			},
		}
	});

export function requestGraphQL<T>(remoteService: IRemoteService, query: string, variables: { [name: string]: any }): TPromise<T> {
	const match = query.match(/.*\bquery\b +([A-Za-z]+)\b.*/m);
	const caller = match ? match[1] : '';
	return sendGraphQLRequest<T>(remoteService, query, variables, caller).then(resp => { return resp.data.root; });
}

export function requestGraphQLMutation<T>(remoteService: IRemoteService, query: string, variables: { [name: string]: any }): TPromise<{ [mutation: string]: T }> {
	return sendGraphQLRequest<T>(remoteService, query, variables, '').then(resp => { return resp.data; });
}

function sendGraphQLRequest<T>(remoteService: IRemoteService, query: string, variables: { [name: string]: any }, caller: string): TPromise<{ data: { root?: T, [key: string]: T }, errors: { message: string }[] }> {
	let url = '/.api/graphql';
	if (caller) {
		url = url + '?' + caller;
	}
	return remoteService.request({
		url,
		type: 'POST',
		data: JSON.stringify({ query, variables }),
	})
		.then(resp => asJson<{ data: { root: T, [key: string]: T }, errors: { message: string }[] }>(resp))
		.then(resp => {
			if (resp.errors && resp.errors.length > 0) {
				const messages = resp.errors.map(e => e.message);
				return TPromise.wrapError(new Error(messages.join('\n')));
			}
			return resp;
		});
}

export interface FormResponse {
	EmailAddress: string;
}

export function submitForm(remoteService: IRemoteService, payload: any): TPromise<FormResponse> {
	return remoteService.request({
		url: '/.api/submit-form',
		type: 'POST',
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
		data: JSON.stringify(payload),
	})
		.then(resp => {
			return asJson<FormResponse>(resp);
		});
}