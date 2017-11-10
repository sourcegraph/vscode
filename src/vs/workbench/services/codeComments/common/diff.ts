/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

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
	 * Converts a pre-diff range to a post-diff range.
	 * It returns undefined if the content at the pre-diff range
	 * does not exist after the diff.
	 */
	public transformRange(range: Range): Range | undefined {
		if (this.isModifiedRange(range)) {
			return undefined;
		}
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

	private isModifiedRange(range: Range): boolean {
		for (let line = range.startLineNumber; line <= range.endLineNumber; line++) {
			if (this.deletedIndex.has(line)) {
				return true;
			}
		}
		return false;
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