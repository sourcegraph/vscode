/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import 'isomorphic-fetch';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export function requestGraphQL<T>(query: string, variables: { [name: string]: any }): Thenable<T> {
	const headers: { [name: string]: string } = {
		'Content-Type': 'application/json; charset=utf-8',
		'Authorization': `Bearer ${vscode.workspace.getConfiguration('github').get<string>('token')}`,
		'User-Agent': 'GitHub GraphQL Client',
	};

	return fetch(`https://api.github.com/graphql`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ query, variables }),
	})
		.then(resp => {
			if (resp.status < 200 || resp.status > 299) {
				return resp.json().then((err: { message: string }) =>
					Promise.reject(localize('apiError', "Error from GitHub: {0}", err.message)));
			}
			return resp.json();
		})
		.then((body: any) => {
			if (body.errors) {
				console.error('ERRORS', body.errors);
			}
			return body.data;
		});
}

export function distinct<V, K>(array: V[], key: (v: V) => K): V[] {
	const seen = new Set<K>();
	return array.filter(v => {
		const k = key(v);
		if (seen.has(k)) {
			return false;
		}
		seen.add(k);
		return true;
	});
}