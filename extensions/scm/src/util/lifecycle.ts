/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

// Adapted from vscode's vs/base/common/lifecycle module.

export function dispose<T extends vscode.Disposable>(disposable: T): T | undefined;
export function dispose<T extends vscode.Disposable>(...disposables: T[]): T[];
export function dispose<T extends vscode.Disposable>(disposables: T[]): T[];
export function dispose<T extends vscode.Disposable>(first: T | T[], ...rest: T[]): T | T[] | undefined {

	if (Array.isArray(first)) {
		first.forEach(d => d && d.dispose());
		return [];
	} else if (rest.length === 0) {
		if (first) {
			first.dispose();
			return first;
		}
		return undefined;
	} else {
		dispose(first);
		dispose(rest);
		return [];
	}
}

export function combinedDisposable(disposables: vscode.Disposable[]): vscode.Disposable {
	return { dispose: () => dispose(disposables) };
}

export function toDisposable(...fns: (() => void)[]): vscode.Disposable {
	return {
		dispose() {
			for (const fn of fns) {
				fn();
			}
		}
	};
}

export abstract class Disposable implements vscode.Disposable {

	private _toDispose: vscode.Disposable[];

	constructor() {
		this._toDispose = [];
	}

	public dispose(): void {
		this._toDispose = dispose(this._toDispose);
	}

	protected _register<T extends vscode.Disposable>(t: T): T {
		this._toDispose.push(t);
		return t;
	}
}
