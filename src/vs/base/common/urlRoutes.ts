/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as types from 'vs/base/common/types';

/**
* Splits a value of the form "a[@b]" into "a" and "b". The "@b" part is optional.
*/
export function atOptionalRevision(str: string): { resource: string, revision?: string } {
	const at = str.indexOf('@');
	if (at === -1) {
		return { resource: str };
	}
	return {
		resource: str.slice(0, at),
		revision: str.slice(at + 1)
	};
}

/**
 * Line numbers and columns are 1-indexed.
 */
export type Selection = {
	startLineNumber: number;
	startColumn?: number;
	endLineNumber?: number;
	endColumn?: number;
};

/**
 * An editor action to perform after the editor has loaded.
 */
export enum EditorAction {
	References
}

/**
 * Arguments encoded in the url's fragment.
 */
export interface FragmentArgs {
	selection?: Selection;
	editorAction?: EditorAction;
}

/**
 * Parses the arguments from a fragment string.
 */
export function parseFragment(fragment: string | undefined): FragmentArgs {
	const args: FragmentArgs = {};
	const parts = (fragment || '').split('$', 2);
	const sel = parseSelection(parts[0]);
	if (sel) {
		args.selection = sel;
	}
	if (parts.length === 2) {
		// SECURITY: Actions added to this whitelist should be vetted for security vulnerabilities.
		// For example, we would not want to expose a command that executes arbitrary javascript at the cursor position.
		switch (parts[1]) {
			case 'references':
				args.editorAction = EditorAction.References;
				break;
		}
	}
	return args;
}

/**
 * Formats the arguments to a fragment string.
 */
export function formatFragment(args: FragmentArgs): string {
	return formatSelection(args.selection);
}

// parseSelection parses a string like '1-2', '1:2', '1:2-3', '1-2:3', or
// '1:2-3:4'. It assumes that line and column numbers are 1-indexed.
function parseSelection(range: string): Selection | undefined {
	let m = range.match(/^L(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
	if (m) {
		const sel: Selection = { startLineNumber: Number(m[1]) };
		if (typeof m[2] === 'string') { sel.startColumn = Number(m[2]); }
		if (typeof m[3] === 'string') { sel.endLineNumber = Number(m[3]); }
		if (typeof m[4] === 'string') { sel.endColumn = Number(m[4]); }
		return sel;
	}
	return undefined;
}

function formatNumber(n: number | undefined, canOmit: boolean): string {
	if (types.isUndefinedOrNull(n) || n <= 0 || (canOmit && n === 1)) { return ''; }
	return n.toString();
}

function formatPosition(line: number, column: number, canOmit: boolean): string {
	const columnStr = formatNumber(column, true);
	const lineStr = formatNumber(line, !columnStr && canOmit);
	if (columnStr) {
		return lineStr + ':' + columnStr;
	}
	return lineStr;
}

// formatString returns the string representation of the range or
// position. The string representation can be parsed using parseSelection.
function formatSelection(range: Selection): string {
	const end = formatPosition(range.endLineNumber, range.endColumn, true);
	const start = formatPosition(range.startLineNumber, range.startColumn, !end);
	if (end) {
		return 'L' + start + '-' + end;
	}
	if (start) {
		return 'L' + start;
	}
	return '';
}
