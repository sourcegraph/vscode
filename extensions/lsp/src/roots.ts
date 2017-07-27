/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';

const rootsState = new Map<string, IRootState>();

/**
 * Per-workspace root folder state.
 */
export interface IRootState {
	/**
	 * The modes of all activated language servers for this workspace root folder.
	 */
	activatedModes: Set<string>;
}

/**
 * Gets state information about a workspace root folder.
 */
export function getRootState(root: vscode.Uri): IRootState {
	return rootsState.get(root.toString());
}

/**
 * Returns whether a language server for the mode has been activated in the given
 * workspace root folder.
 */
export function hasActivatedMode(root: vscode.Uri, mode: string): boolean {
	const state = rootsState.get(root.toString());
	return state && state.activatedModes.has(mode);
}

/**
 * Records that a language server for the given mode has been activated in the given
 * workspace root folder. Subsequent calls to hasActivatedMode with these args will return
 * true.
 */
export function setActivatedMode(root: vscode.Uri, mode: string): vscode.Disposable {
	let state = rootsState.get(root.toString());
	if (!state) {
		state = { activatedModes: new Set<string>() };
		rootsState.set(root.toString(), state);
	}
	state.activatedModes.add(mode);
	return {
		dispose: () => {
			state.activatedModes.delete(mode);
		},
	};
}
