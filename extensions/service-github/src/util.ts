/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import 'isomorphic-fetch';

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
        .then(resp => resp.json() as Thenable<T>)
        .then((body: any) => {
            if (body.errors) {
                console.error('ERRORS', body.errors);
            }
            return body.data;
        });
}