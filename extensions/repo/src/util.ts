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

export function toRelativePath(folder: vscode.Uri, resource: vscode.Uri): string {
	// Handle root with revision in querystring and resources with revision in
	// querystring.
	const folderString = folder.with({ query: '' }).toString();
	const resourceString = resource.with({ query: '' }).toString();

	const baseMatches = resourceString === folderString || resourceString.startsWith(folderString + '/');
	const queryMatches = (!folder.query && !resource.query) || (folder.query === resource.query);
	if (baseMatches && queryMatches) {
		return resourceString.slice(folderString.length + 1);
	}

	throw new Error(`unable to make ${resource.toString()} relative to ${folder.toString()}`);
}
