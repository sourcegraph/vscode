/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range } from 'vs/editor/common/core/range';
import * as strings from 'vs/base/common/strings';

/**
 * Diff is constructed from a unified diff string and provides a transformRange method
 * to transform a range according to the diff.
 */
export class Diff {
	/**
	 * Structured representation of the changed lines in the diff.
	 */
	private lineDiffs: LineDiff[] = [];

	/**
	 * A index on deleted lines by line number.
	 */
	private deletedIndex = new Map<number, LineDiff>();

	public constructor(diff: string) {
		const lines = diff.trim().split('\n');
		let offset = -1;
		let header = true;
		for (const line of lines) {
			if (strings.startsWith(line, '@@')) {
				const hunk = parseHunkHeader(line);
				offset = hunk.before.count > 0 ? hunk.before.start : hunk.before.start + 1;
				header = false;
				continue;
			}
			if (header) {
				// Skip past everything until the first hunk.
				continue;
			}
			const content = line.substr(1);
			switch (line[0]) {
				case '+': {
					const lineDiff: LineDiff = { line: offset, content, type: DiffType.Add };
					this.lineDiffs.push(lineDiff);
					break;
				}
				case '-': {
					const lineDiff: LineDiff = { line: offset, content, type: DiffType.Delete };
					this.lineDiffs.push(lineDiff);
					this.deletedIndex.set(offset, lineDiff);
					offset += 1;
					break;
				}
				case ' ':
					offset += 1;
					break;
				default:
					throw new Error('invalid diff line: ' + line);
			}
		}
	}

	/**
	 * Converts a pre-diff range to a post-diff range.
	 * It returns undefined if the content at the pre-diff range
	 * does not exist after the diff.
	 */
	public transformRange(range: Range): Range | undefined {
		// If any part of the range is deleted, then treat the entire range as deleted.
		// This could be improved upon in the future.
		for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
			if (this.deletedIndex.has(line)) {
				return undefined;
			}
		}

		// This could use binary search, but I am lazy.
		let lineOffset = 0;
		for (const lineDiff of this.lineDiffs) {
			if (lineDiff.line > range.startLineNumber) {
				break;
			}
			switch (lineDiff.type) {
				case DiffType.Add:
					lineOffset += 1;
					break;
				case DiffType.Delete:
					lineOffset -= 1;
					break;
			}
		}
		if (lineOffset === 0) {
			return range;
		}
		return new Range(range.startLineNumber + lineOffset, range.startColumn, range.endLineNumber + lineOffset, range.endColumn);
	}
}

enum DiffType {
	Add, Delete
}

interface LineDiff {
	/**
	 * Line number (the first line of the file is 1).
	 */
	line: number;

	/**
	 * The content of the line that was added or deleted.
	 */
	content: string;

	type: DiffType;
}

const beforeHunkRegex = /-([0-9]+)(?:,([0-9]+))?/;
const afterHunkRegex = /\+([0-9]+)(?:,([0-9]+))?/;

interface Lines {
	/**
	 * 1-indexed
	 */
	start: number;
	count: number;
}

interface HunkHeader {
	before: Lines;
	after: Lines;
}

/**
 * Parses a string like "@@ -1,3 2,4 @@".
 */
function parseHunkHeader(hunk: string): HunkHeader {
	const beforeHunk = beforeHunkRegex.exec(hunk);
	const afterHunk = afterHunkRegex.exec(hunk);
	if (!beforeHunk || !afterHunk) {
		throw new Error('invalid hunk: ' + hunk);
	}
	return {
		before: {
			start: parseInt(beforeHunk[1]),
			count: beforeHunk[2] ? parseInt(beforeHunk[2]) : 1,
		},
		after: {
			start: parseInt(afterHunk[1]),
			count: afterHunk[2] ? parseInt(afterHunk[2]) : 1,
		},
	};
}