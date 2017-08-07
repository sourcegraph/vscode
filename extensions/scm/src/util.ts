/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export const SELECTION_DEBOUNCE_WAIT_MSEC = 250;

export function pad(s: string, before: number = 0, after: number = 0, padding: string = `\u00a0`) {
	if (before === 0 && after === 0) {
		return s;
	}

	return `${before === 0 ? '' : padding.repeat(before)}${s}${after === 0 ? '' : padding.repeat(after)}`;
}

export function padLeft(s: string, padTo: number, padding: string = '\u00a0') {
	const diff = padTo - s.length;
	return (diff <= 0) ? s : '\u00a0'.repeat(diff) + s;
}

export function padLeftOrTruncate(s: string, max: number, padding?: string) {
	if (s.length < max) {
		return padLeft(s, max, padding);
	}
	if (s.length > max) {
		return truncate(s, max);
	}
	return s;
}

export function padRight(s: string, padTo: number, padding: string = '\u00a0') {
	const diff = padTo - s.length;
	return (diff <= 0) ? s : s + '\u00a0'.repeat(diff);
}

export function padOrTruncate(s: string, max: number, padding?: string) {
	const left = max < 0;
	max = Math.abs(max);

	if (s.length < max) {
		return left ? padLeft(s, max, padding) : padRight(s, max, padding);
	}
	if (s.length > max) {
		return truncate(s, max);
	}
	return s;
}

export function padRightOrTruncate(s: string, max: number, padding?: string) {
	if (s.length < max) {
		return padRight(s, max, padding);
	}
	if (s.length > max) {
		return truncate(s, max);
	}
	return s;
}

export function truncate(s: string, truncateTo?: number) {
	if (!s || truncateTo === undefined || s.length <= truncateTo) {
		return s;
	}
	return `${s.substring(0, truncateTo - 1)}\u2026`;
}

/**
 * Unsafe formatter of shell arguments for display purposes only. Is not guaranteed to
 * securely escape args.
 */
export function shellFormat(args: string[]): string {
	return args.map(arg => {
		if (/[^\w\d:%./-]/.test(arg)) {
			return JSON.stringify(arg);
		}
		return arg;
	}).join(' ');
}

export function flatten<T>(arr: T[][]): T[] {
	return arr.reduce((r, v) => r.concat(v), []);
}
