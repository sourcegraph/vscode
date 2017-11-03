/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { VSDiff as Diff } from 'vs/workbench/services/codeComments/common/vsdiff';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IDiffWorker, IDiffArgs, IDiffResult } from './diffWorkerIpc';
import { startsWith, endsWith } from 'vs/base/common/strings';

/**
 * A worker that transforms ranges based on diffs.
 * It should be run in a separate process because it does
 * intensive CPU bound work that would interrupt user interactions.
 */
export class DiffWorker implements IDiffWorker {

	// TODO(nick): refactor public api to return Promise.
	public diff(args: IDiffArgs): TPromise<IDiffResult> {
		return TPromise.wrap(this.diffAsync(args));
	}

	private async diffAsync(args: IDiffArgs): Promise<IDiffResult> {
		// We daisy chain these promises so that we can yield between each diff.
		// This gives cancellation signals a chance to propogate.
		const diffs = new Map<string, Diff>();
		const linesByRev = new Map<string, string[]>();
		await args.revLines.reduce((diffPromise, revLines) => {
			linesByRev.set(revLines.revision, revLines.lines);
			return diffPromise
				// Yield the runloop before we start a new CPU bound task.
				// This allows the cancellation signal to be handled.
				.then(() => TPromise.timeout(10))
				.then(() => {
					// This is a slow CPU bound call (i.e. 100+ms).
					const diff = new Diff(revLines.lines, args.modifiedLines);
					diffs.set(revLines.revision, diff);
				});
		}, TPromise.as(undefined));

		const diffResult: IDiffResult = {};
		for (const revRange of args.revRanges) {
			const diff = diffs.get(revRange.revision);
			const fromRange = Range.lift(revRange.range);
			let range: IRange;
			if (diff) {
				range = diff.transformRange(fromRange);
				if (!range && !revRange.rangeContent) {
					// The thread wasn't populated with a snippet, but we have access to the
					// original file content, so populate the snippet manually.
					const revLines = linesByRev.get(revRange.revision);
					const rangeLines = revLines.slice(fromRange.startLineNumber - 1, fromRange.endLineNumber);
					rangeLines[0] = rangeLines[0].slice(fromRange.startColumn - 1);
					rangeLines[rangeLines.length - 1] = rangeLines[rangeLines.length - 1].slice(0, fromRange.endColumn);
					revRange.rangeContent = rangeLines.join('\n');
				}
			}
			if (!range && revRange.rangeContent) {
				// We may not have been able to resolve a range because the revision is no
				// longer reachable (e.g. comment made on a remote branch that is now deleted).
				//
				// If the actual content of the range is available, then try to
				// find it in the modified file.
				const rangeContentLines = revRange.rangeContent.split(/\r?\n/);
				range = rangeInLines(args.modifiedLines, rangeContentLines);
			}
			if (!diffResult[revRange.revision]) {
				diffResult[revRange.revision] = {};
			}
			diffResult[revRange.revision][fromRange.toString()] = range;
		}
		return diffResult;
	}
}

/**
 * Searches for needle in haystack. The range of the longest match is returned.
 */
function rangeInLines(haystack: string[], needle: string[]): IRange {
	const matches = longestCommonLines(haystack, needle);
	if (matches.length !== 1) {
		// If there are multiple matches, we don't try to guess one.
		return undefined;
	}
	return matches[0];
}

interface Match {
	lineCount: number;
	characterCount: number;
}

/**
 * Based on longest common substring, but adapted for an array of lines.
 * https://en.wikipedia.org/wiki/Longest_common_substring_problem#Pseudocode
 *
 * It returns the matching ranges in the haystack.
 */
function longestCommonLines(haystack: string[], needle: string[]): Range[] {
	const matches: Match[][] = [];
	let longestMatch: Match = { lineCount: 0, characterCount: 0 };
	let longestMatchingRanges: Range[] = [];
	for (let i = 0; i < haystack.length; i++) {
		const row: Match[] = [];
		matches.push(row);
		for (let j = 0; j < needle.length; j++) {
			const matchedLine = matchLines(haystack[i], needle, j);
			if (matchedLine) {
				const characterCount = matchedLine.endColumn - matchedLine.startColumn;
				if (i === 0 || j === 0) {
					row.push({ lineCount: 1, characterCount });
				} else {
					const previousMatch = matches[i - 1][j - 1];
					row.push({
						lineCount: previousMatch.lineCount + 1,
						characterCount: previousMatch.characterCount + characterCount,
					});
				}
				const match = matches[i][j];
				const matchingRange = new Range(i - match.lineCount + 2, matchedLine.startColumn, i + 1, matchedLine.endColumn);
				if (match.characterCount > longestMatch.characterCount) {
					longestMatch = match;
					longestMatchingRanges = [matchingRange];
				} else if (match.characterCount === longestMatch.characterCount) {
					longestMatchingRanges.push(matchingRange);
				}
			} else {
				row.push({ lineCount: 0, characterCount: 0 });
			}
		}
	}
	return longestMatchingRanges;
}

/**
 * Returns true if the needle line at index matches the haystack line.
 * Matching ignores leading and trailing whitespace.
 *
 * The haystack line matches
 * - The first line of needle if it ends with the first line of needle.
 * - The last line of needle if it begins with the last line of needle.
 * - Any other line of needle if it is equal to that line of needle.
 *
 * It returns the start and end column in the haystack line that matches.
 * If the line didn't match, it returns undefined.
 */
function matchLines(haystackLine: string, needle: string[], needleIdx: number): { startColumn: number, endColumn: number } | undefined {
	const needleLine = needle[needleIdx];
	const trimmedNeedleLine = needleLine.trim();
	// If needle is a single line, then check if trimmedNeedleLine is in haystackLine.
	if (needle.length === 1) {
		const matchIdx = haystackLine.indexOf(trimmedNeedleLine);
		if (matchIdx === -1) {
			return undefined;
		}
		const startColumn = matchIdx + 1;
		return { startColumn, endColumn: startColumn + trimmedNeedleLine.length };
	}
	if (needleIdx > 0 && needleIdx < needle.length - 1 && trimmedNeedleLine !== haystackLine.trim()) {
		// For a multi-line needle, lines in the middle of needle need to match exactly (ignoring whitespace).
		return undefined;
	}
	const leftTrimmedHaystackLine = haystackLine.replace(/^\s+/gm, '');
	const rightTrimmedHaystackLine = haystackLine.replace(/\s+$/gm, '');
	// Initialize the match with the values for the needle's middle lines.
	const matched = {
		startColumn: haystackLine.length - leftTrimmedHaystackLine.length + 1,
		endColumn: rightTrimmedHaystackLine.length + 1,
	};
	// The first line of the needle can match any haystack line
	// that ends with the needle (ignoring whitespace).
	if (needleIdx === 0) {
		if (!endsWith(rightTrimmedHaystackLine, trimmedNeedleLine)) {
			return undefined;
		}
		matched.startColumn = rightTrimmedHaystackLine.length - trimmedNeedleLine.length + 1;
	}
	// The last line of the needle can match any haystack line
	// that begins with the needle (ignoring whitespace).
	if (needleIdx === needle.length - 1) {
		if (!startsWith(leftTrimmedHaystackLine, trimmedNeedleLine)) {
			return undefined;
		}
		const leftPadding = haystackLine.length - leftTrimmedHaystackLine.length;
		matched.endColumn = leftPadding + trimmedNeedleLine.length + 1;
	}
	return matched;
}
