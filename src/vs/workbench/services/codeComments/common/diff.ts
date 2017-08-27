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
 * No diff context is necessary (Git defaults to three lines) so you can optimize diff
 * size by excluding context (e.g. -U0 for Git).
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
	private addedIndexExact = new Map<string, LineDiff | false>();

	/**
	 * An index on added lines by content with leading and trailing whitespace removed.
	 */
	private addedIndexTrim = new Map<string, LineDiff | false>();

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
					// If there are duplicates, we don't allow comments to move to these lines.
					// We would have to make an arbitrary decision or attach the thread to both ranges.
					if (this.addedIndexExact.has(content)) {
						this.addedIndexExact.set(content, false);
					} else {
						this.addedIndexExact.set(content, lineDiff);
					}
					const trimmedContent = content.trim();
					if (this.addedIndexTrim.has(trimmedContent)) {
						this.addedIndexTrim.set(trimmedContent, false);
					} else {
						this.addedIndexTrim.set(trimmedContent, lineDiff);
					}
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
		const trimmedRange = this.trimDeletedLines(range);
		if (!trimmedRange) {
			return this.findMovedRange(range);
		}
		range = trimmedRange;
		const effectiveEndLine = getEffectiveEndLine(range);

		// Loop through the line diffs to compute the offsets that should
		// be applied to the beginning and end of the range.
		let startLineOffset = 0;
		let endLineOffset = 0;
		for (const lineDiff of this.lineDiffs) {
			if (lineDiff.beforeLine > effectiveEndLine) {
				break;
			}
			if (lineDiff.beforeLine <= range.startLineNumber) {
				startLineOffset += lineDiff.lineDelta;
			}
			endLineOffset += lineDiff.lineDelta;
		}
		const transformedRange = new Range(range.startLineNumber + startLineOffset, range.startColumn, range.endLineNumber + endLineOffset, range.endColumn);
		return range.isEmpty() ? transformedRange : this.nonEmptyRange(transformedRange);
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
	 */
	private trimDeletedLines(range: Range): Range | undefined {
		if (range.isEmpty()) {
			// Handle empty case specially because handling it in
			// the general case below would be tricky.
			return this.deletedIndex.has(range.startLineNumber) ? undefined : range;
		}
		let endPosition: Position | undefined;
		let startPosition: Position | undefined;
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
				endPosition = range.getEndPosition();
			} else {
				// Either we are in the middle of the range and this endPosition will get overwritten
				// on the next loop iteration, or the diff doesn't contain any context around changes (i.e. -U0).
				// In either case we don't know the length of this line, so the end position
				// of the range is just the first character in the next line.
				// The existance of this case is why we store effectiveEndLine separately.
				endPosition = new Position(line + 1, 1);
			}
		}
		if (!startPosition || !endPosition) {
			return undefined;
		}
		return this.nonEmptyRange(new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column));
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

			const effectiveEndLine = startPosition ? getEffectiveEndLine(Range.fromPositions(startPosition, endPosition)) : 0;
			if (!startPosition || addedLine.afterLine === effectiveEndLine + 1) {
				// Starting or continuing a range.
				if (line === range.endLineNumber) {
					const endColumn = Math.max(range.endColumn + columnDelta, 1);
					endPosition = new Position(addedLine.afterLine, endColumn);
				} else {
					endPosition = new Position(addedLine.afterLine + 1, 1);
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
		const movedRange = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		return range.isEmpty() ? movedRange : this.nonEmptyRange(movedRange);
	}
}

/**
 * Returns the effective end line of a range.
 * If a range ends on column one (e.g. [4, 2] -> [5, 1]),
 * then the effective end line is the previous line (e.g. 4)
 * unless the range was already empty.
 */
function getEffectiveEndLine(range: Range): number {
	const excludeTrailingNewline = (range.endColumn === 1 && !range.isEmpty());
	return excludeTrailingNewline ? range.endLineNumber - 1 : range.endLineNumber;
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