/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import 'isomorphic-fetch';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export function fetchFromBitbucket<T>(url: string): Thenable<T> {
	const config = vscode.workspace.getConfiguration('bitbucket.cloud');
	const username = config.get<string>('username');
	const appPassword = config.get<string>('appPassword');
	const authDigest = new Buffer(`${username}:${appPassword}`).toString('base64');

	const headers: { [name: string]: string } = {
		'Content-Type': 'application/json; charset=utf-8',
		'Authorization': `Basic ${authDigest}`,
	};

	return fetch(`https://api.bitbucket.org/2.0${url}`, {
		method: 'GET',
		headers,
	})
		.then(resp => {
			if (resp.status < 200 || resp.status > 299) {
				return resp.json().then(
					(err: { error: { message: string } }) => createError(err && err.error ? err.error.message : resp.statusText),
					err => createError(err),
				);
			}
			return resp.json();
		});
}

function createError(error: string): Thenable<string> {
	return Promise.reject(localize('apiError', "Error from Bitbucket: {0}", error));
}