/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as strings from 'vs/base/common/strings';

/**
 * Diff is constructed from a unified diff string and provides a transformRange method
 * to transform a range according to the diff.
 *
 * For best results, construct with a diff that has at least one line of context.
 * Git diff defaults to three lines of context (and you can change it with the -U option).
 */
export class Diff {
	/**
	 * Structured representation of the changed lines in the diff.
	 */
	private lineDiffs: LineDiff[] = [];

	/**
	 * An index on deleted lines by line number.
	 */
	private deletedIndex = new Map<number, LineDiff>();

	/**
	 * An index on added lines by content.
	 */
	private addedIndexExact = new Map<string, LineDiff>();

	/**
	 * An index on added lines by content with leading and trailing whitespace removed.
	 */
	private addedIndexTrim = new Map<string, LineDiff>();

	/**
	 * An index on unchanged lines by line number.
	 */
	private unchangedIndex = new Map<number, LineDiff>();

	public constructor(diff: string) {
		const lines = diff.trim().split('\n');
		let beforeLine = -1;
		let afterLine = -1;
		let header = true;
		for (const line of lines) {
			if (strings.startsWith(line, '@@')) {
				const hunk = parseHunkHeader(line);
				beforeLine = hunk.before.count > 0 ? hunk.before.start : hunk.before.start + 1;
				afterLine = hunk.after.count > 0 ? hunk.after.start : hunk.after.start + 1;
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
					const lineDiff: LineDiff = { beforeLine, afterLine, content, lineDelta: 1 };
					this.lineDiffs.push(lineDiff);
					// If there are duplicates, we just choose the last one.
					// Future improvement: update transformRange to return an array of ranges
					// so ranges can be split. We would need to store all values here.
					this.addedIndexExact.set(content, lineDiff);
					this.addedIndexTrim.set(content.trim(), lineDiff);
					afterLine += 1;
					break;
				}
				case '-': {
					const lineDiff: LineDiff = { beforeLine, afterLine, content, lineDelta: -1 };
					this.lineDiffs.push(lineDiff);
					this.deletedIndex.set(beforeLine, lineDiff);
					beforeLine += 1;
					break;
				}
				case ' ':
					const lineDiff: LineDiff = { beforeLine, afterLine, content, lineDelta: 0 };
					this.unchangedIndex.set(beforeLine, lineDiff);
					beforeLine += 1;
					afterLine += 1;
					break;
				case '\\':
					// "\ No newline at end of file."
					break;
				default:
					const err: any = new Error(`invalid diff line: ${line}`);
					err.diff = diff;
					throw err;
			}
		}
	}

	/**
	 * Converts a pre-diff range to a post-diff range.
	 * It returns undefined if the content at the pre-diff range
	 * does not exist after the diff.
	 */
	public transformRange(range: Range): Range | undefined {
		const result = this.trimDeletedLines(range);
		if (!result) {
			return this.findMovedRange(range);
		}
		range = result.range;

		let startLineOffset = 0;
		let endLineOffset = 0;
		for (const lineDiff of this.lineDiffs) {
			if (lineDiff.beforeLine > result.effectiveEndLine) {
				break;
			}
			if (lineDiff.beforeLine <= range.startLineNumber) {
				startLineOffset += lineDiff.lineDelta;
			}
			endLineOffset += lineDiff.lineDelta;
		}
		if (startLineOffset === 0 && endLineOffset === 0) {
			return range;
		}
		return this.nonEmptyRange(new Range(range.startLineNumber + startLineOffset, range.startColumn, range.endLineNumber + endLineOffset, range.endColumn));
	}

	/**
	 * Returns range if it isn't empty and undefined otherwise.
	 */
	private nonEmptyRange(range: Range): Range | undefined {
		return range.isEmpty() ? undefined : range;
	}

	/**
	 * Returns the range with leading and trailing deleted lines removed.
	 * If no lines remain, it returns undefined.
	 * If lines are trimmed from the end of the range, the end position might be
	 * the first character on the line after the effectiveEndLine
	 * if the diff doesn't contain at least one line of context around each hunk.
	 */
	private trimDeletedLines(range: Range): { range: Range, effectiveEndLine: number } | undefined {
		let endPosition: Position | undefined;
		let startPosition: Position | undefined;
		let effectiveEndLine: number;
		for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
			if (this.deletedIndex.has(line)) {
				continue;
			}
			if (!startPosition) {
				if (line === range.startLineNumber) {
					startPosition = range.getStartPosition();
				} else {
					startPosition = new Position(line, 1);
				}
			}
			if (line === range.endLineNumber) {
				// Only update the end position if there is a meaningful column on the last line.
				// Otherwise, we can just use the previous end position.
				if (range.endColumn > 1) {
					endPosition = range.getEndPosition();
					effectiveEndLine = line;
				}
			} else if (this.unchangedIndex.has(line)) {
				// The diff has this unchanged line in it so we can
				// determine the end position based on the content.
				const lineDiff = this.unchangedIndex.get(line);
				endPosition = new Position(line, lineDiff.content.length + 1);
				effectiveEndLine = line;
			} else {
				// Either we are in the middle of the range and this endPosition will get overwritten
				// on the next loop iteration, or the diff doesn't contain any context around changes (i.e. -U0).
				// In either case we don't know the length of this line, so the end position
				// of the range is just the first character in the next line.
				// The existance of this case is why we store effectiveEndLine separately.
				endPosition = new Position(line + 1, 1);
				effectiveEndLine = line;
			}
		}
		if (!startPosition || !endPosition) {
			return undefined;
		}
		const trimmedRange = this.nonEmptyRange(new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column));
		if (!trimmedRange) {
			return undefined;
		}
		return {
			range: trimmedRange,
			effectiveEndLine,
		};
	}

	/**
	 * Returns the moved version of range if it has been moved.
	 * The input range is assumed to be completely deleted.
	 */
	private findMovedRange(range: Range): Range | undefined {
		let startPosition: Position | undefined;
		let endPosition: Position | undefined;
		for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
			const deletedLine = this.deletedIndex.get(line);
			if (!deletedLine) {
				if (line !== range.endLineNumber && line !== range.startLineNumber) {
					throw new Error('findMovedRange expected all lines to be deleted');
				}
				continue;
			}
			let addedLine = this.addedIndexExact.get(deletedLine.content);
			let columnDelta = 0;
			if (!addedLine) {
				const deletedLineTrimmed = deletedLine.content.trim();
				addedLine = this.addedIndexTrim.get(deletedLineTrimmed);
				if (addedLine) {
					const addedLineTrimmed = addedLine.content.trim();
					const leadingWhitespaceBefore = Math.max(deletedLine.content.indexOf(deletedLineTrimmed[0]), 0);
					const leadingWhitespaceAfter = Math.max(addedLine.content.indexOf(addedLineTrimmed[0]), 0);
					columnDelta = leadingWhitespaceAfter - leadingWhitespaceBefore;
				}
			}
			if (!addedLine) {
				if (startPosition) {
					// If we already found some part of the range moved,
					// then we are done.
					break;
				}
				// Keep looking to see if part of the range was moved.
				continue;
			}
			if (!startPosition || addedLine.afterLine === endPosition.lineNumber + 1) {
				// Starting or continuing a range.
				if (line === range.endLineNumber) {
					const endColumn = Math.max(range.endColumn + columnDelta, 1);
					endPosition = new Position(addedLine.afterLine, endColumn);
				} else {
					endPosition = new Position(addedLine.afterLine, addedLine.content.length + 1);
				}
			}
			if (!startPosition) {
				// Starting a new range.
				if (line === range.startLineNumber) {
					const startColumn = Math.max(range.startColumn + columnDelta, 1);
					startPosition = new Position(addedLine.afterLine, startColumn);
				} else {
					startPosition = new Position(addedLine.afterLine, 1);
				}
			}
		}
		if (!startPosition || !endPosition) {
			return undefined;
		}
		return this.nonEmptyRange(new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column));
	}
}

interface LineDiff {
	/**
	 * Line number (the first line of the file is 1).
	 */
	beforeLine: number;

	/**
	 * The line number after the diff is applied.
	 */
	afterLine: number;

	/**
	 * The content of the line that was added or deleted.
	 */
	content: string;

	/**
	 * 1 for add, -1 for delete.
	 */
	lineDelta: number;
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