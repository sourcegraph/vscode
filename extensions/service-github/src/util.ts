/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import 'isomorphic-fetch';
import * as nls from 'vscode-nls';
import * as cp from 'child_process';

const localize = nls.loadMessageBundle();

export function timeout(millis: number): Promise<void> {
	return new Promise(c => setTimeout(c, millis));
}

export interface GraphQLQueryResponseRoot {
	data?: GitHubGQL.IQuery;
	errors?: GitHubGQL.IGraphQLResponseError[];
}

export async function queryGraphQL(query: string, variables: { [name: string]: any }): Promise<GraphQLQueryResponseRoot> {
	const headers = new Headers({
		'Content-Type': 'application/json; charset=utf-8',
		'Authorization': `Bearer ${vscode.workspace.getConfiguration('github').get<string>('token')}`,
		'User-Agent': 'GitHub GraphQL Client',
	});

	const resp = await fetch(`https://api.github.com/graphql`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ query, variables }),
	});
	if (resp.status < 200 || resp.status > 299) {
		const error = await resp.json();
		throw Object.assign(new Error(localize('apiError', "Error from GitHub: {0}", error.message)), { error });
	}
	return await resp.json();
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

export const execGit = (args: string[], cwd: string): Promise<string> => new Promise<string>((resolve, reject) => {
	cp.execFile('git', args, { cwd, encoding: 'utf8' }, (err, stdout, stderr) => err ? reject(err) : resolve(stdout.trim()));
});

export interface IDisposable {
	dispose(): void;
}

export function dispose<T extends IDisposable>(disposables: T[]): T[] {
	disposables.forEach(d => d.dispose());
	return [];
}

export function toDisposable(dispose: () => void): IDisposable {
	return { dispose };
}

export function combinedDisposable(disposables: IDisposable[]): IDisposable {
	return toDisposable(() => dispose(disposables));
}

export const EmptyDisposable = toDisposable(() => null);

export function flatten<T>(arr: T[][]): T[] {
	return arr.reduce((r, v) => r.concat(v), []);
}

export function done<T>(promise: Promise<T>): Promise<void> {
	return promise.then<void>(() => void 0);
}

export function onceEvent<T>(event: vscode.Event<T>): vscode.Event<T> {
	return (listener, thisArgs = null, disposables?) => {
		const result = event(e => {
			result.dispose();
			return listener.call(thisArgs, e);
		}, null, disposables);

		return result;
	};
}

export function eventToPromise<T>(event: vscode.Event<T>): Promise<T> {
	return new Promise<T>(c => onceEvent(event)(c));
}

export function filterEvent<T>(event: vscode.Event<T>, filter: (e: T) => boolean): vscode.Event<T> {
	return (listener, thisArgs = null, disposables?) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}
