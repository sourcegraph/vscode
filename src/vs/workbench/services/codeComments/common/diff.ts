/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

/**
 * Base class for differs that provide a transformRange method.
 * Subclass should do all work in the constructor and update
 * the appropriate properties.
 *
 * This class only exists to provide a consistent implementation
 * between UnifiedDiff and VSDiff.
 */
export abstract class Diff {
	/**
	 * Structured representation of the changed lines in the diff.
	 */
	protected lineDiffs: LineDiff[] = [];

	/**
	 * An index on deleted lines by line number.
	 */
	protected deletedIndex = new Map<number, LineDiff>();

	/**
	 * An index on added lines by content.
	 */
	protected addedIndexExact = new Map<string, LineDiff | false>();

	/**
	 * An index on added lines by content with leading and trailing whitespace removed.
	 */
	protected addedIndexTrim = new Map<string, LineDiff | false>();

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
		return range.isEmpty() ? transformedRange : nonEmptyRange(transformedRange);
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
		return nonEmptyRange(new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column));
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
		return range.isEmpty() ? movedRange : nonEmptyRange(movedRange);
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

/**
 * Returns range if it isn't empty and undefined otherwise.
 */
function nonEmptyRange(range: Range): Range | undefined {
	return range.isEmpty() ? undefined : range;
}

export interface LineDiff {
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