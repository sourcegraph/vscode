/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import 'isomorphic-fetch';

export function requestGraphQL<T>(query: string, variables: { [name: string]: any }, caller: string): Thenable<T> {
	const endpoint = vscode.workspace.getConfiguration('remote').get<string>('endpoint');
	return fetch(`${endpoint}/.api/graphql?${caller}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
		},
		body: JSON.stringify({ query, variables }),
	})
		.then(resp => resp.json() as Thenable<T>)
		.then((body: any) => body.data.root);
}
