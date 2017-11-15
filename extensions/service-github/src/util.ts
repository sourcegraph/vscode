/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { default as fetch, RequestInit, Headers } from 'node-fetch';
import * as https from 'https';
import * as nls from 'vscode-nls';
import * as cp from 'child_process';
import * as util from 'util';

const localize = nls.loadMessageBundle();

export function timeout(millis: number): Promise<void> {
	return new Promise(c => setTimeout(c, millis));
}

export interface QueryResult {
	data?: GitHubGQL.IQuery;
	errors?: GitHubGQL.IGraphQLResponseError[];
}

export interface MutationResult {
	data?: GitHubGQL.IMutation;
	errors?: GitHubGQL.IGraphQLResponseError[];
}

export async function queryGraphQL(query: string, variables: { [name: string]: any }): Promise<QueryResult> {
	return requestGraphQL(query, variables) as QueryResult;
}

export async function mutateGraphQL(query: string, variables: { [name: string]: any }): Promise<MutationResult> {
	return requestGraphQL(query, variables) as MutationResult;
}

export async function requestGraphQL(query: string, variables: { [name: string]: any }): Promise<GitHubGQL.IGraphQLResponseRoot> {
	let githubURL = vscode.workspace.getConfiguration('github').get<string>('url');
	let githubEnterprise = false;
	if (githubURL) {
		githubEnterprise = true;
		githubURL = `${githubURL}/api`;
	} else {
		githubURL = 'https://api.github.com';
	}

	const headers = new Headers();
	headers.append('Content-Type', 'application/json; charset=utf-8');
	headers.append('Authorization', `Bearer ${vscode.workspace.getConfiguration('github').get<string>('token')}`);
	headers.append('User-Agent', 'GitHub GraphQL Client');
	const init: RequestInit = {
		method: 'POST',
		headers,
		body: JSON.stringify({ query, variables }),
	};
	if (githubEnterprise && vscode.Uri.parse(githubURL).scheme === 'https') {
		init.agent = new https.Agent({
			// GitHub Enterprise instances may use self-signed certs. To support this, disable unauthorized cert rejection.
			rejectUnauthorized: false,
		});
	}
	const resp = await fetch(`${githubURL}/graphql`, init);
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

export const execGit = (args: string[], cwd: string, stdin?: string): Promise<string> => new Promise<string>((resolve, reject) => {
	const child = cp.execFile('git', args, { cwd, encoding: 'utf8' }, (err, stdout, stderr) => err ? reject(err) : resolve(stdout.trim()));
	if (stdin !== undefined) {
		child.stdin.end(stdin, 'utf8');
	}
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
