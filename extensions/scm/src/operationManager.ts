/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { LRUMap } from 'lru_map';

/**
 * Performs repository operations, ensuring (1) single-flighting: if an operation is in
 * progress and another request is received for the same operation, it receives the result
 * of the in-flight operation instead of performing a duplicative operation; and (2)
 * caching: if an operation is cacheable, subsequent requests return the cached data.
 */
export class OperationManager {
	static readonly CacheSize = 1000;

	private cache = new LRUMap<string, any>(OperationManager.CacheSize);
	private inFlight = new Map<string, Thenable<any>>();

	public performOperation<T>(key: string, operation: () => Thenable<T>, token?: vscode.CancellationToken): Thenable<T | undefined> {
		if (token && token.isCancellationRequested) {
			return Promise.resolve(undefined);
		}

		if (this.cache.has(key)) {
			return Promise.resolve(this.cache.get(key));
		}

		let op = this.inFlight.get(key);
		if (op) {
			return op;
		}

		op = operation().then(
			(result: T) => {
				this.cache.set(key, result);
				this.inFlight.delete(key);
				return result;
			},
			err => {
				this.inFlight.delete(key);
				throw err;
			},
		);
		this.inFlight.set(key, op);
		return op;
	}

	public isCachedOrInFlight(key: string): boolean {
		return this.cache.has(key) || this.inFlight.has(key);
	}
}
