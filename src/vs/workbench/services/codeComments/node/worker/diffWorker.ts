/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { VSDiff as Diff } from 'vs/workbench/services/codeComments/common/vsdiff';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range, IRange } from 'vs/editor/common/core/range';
import { IDiffWorker, IDiffArgs, IDiffResult } from './diffWorkerIpc';

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
		await args.revLines.reduce((diffPromise, revLines) => {
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
			} else if (revRange.rangeContent) {
				// Our caller asked us to resolve range at a revision and did not
				// provide lines to diff because the revision is no longer reachable
				// (e.g. comment made on a remote branch that is now deleted).
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
		return undefined;
	}
	const { start, end } = matches[0];
	return {
		startLineNumber: start + 1,
		startColumn: 1,
		endLineNumber: end + 1,
		endColumn: haystack[end].length + 1,
	};
}

interface LCSHaystackMatch {
	start: number;
	end: number;
}

/**
 * Based on longest common substring, but adapted for an array of lines.
 * https://en.wikipedia.org/wiki/Longest_common_substring_problem#Pseudocode
 *
 * It returns the matches in the haystack.
 */
function longestCommonLines(haystack: string[], needle: string[]): LCSHaystackMatch[] {
	const lengths: number[][] = [];
	let longestMatchLength = 0;
	let longestMatches: LCSHaystackMatch[] = [];
	for (let i = 0; i < haystack.length; i++) {
		const row = [];
		lengths.push(row);
		for (let j = 0; j < needle.length; j++) {
			if (haystack[i].trim() === needle[j].trim()) {
				if (i === 0 || j === 0) {
					row.push(1);
				} else {
					row.push(lengths[i - 1][j - 1] + 1);
				}
				if (lengths[i][j] > longestMatchLength) {
					longestMatchLength = lengths[i][j];
					longestMatches = [{ start: i - longestMatchLength + 1, end: i }];
				} else if (lengths[i][j] === longestMatchLength) {
					longestMatches.push({ start: i - longestMatchLength + 1, end: i });
				}
			} else {
				row.push(0);
			}
		}
	}
	return longestMatches;
}