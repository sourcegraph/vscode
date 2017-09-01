/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { Diff, LineDiff } from 'vs/workbench/services/codeComments/common/diff';

/**
 * Diff is constructed from a unified diff string and provides a method
 * to transform a range according to the diff.
 *
 * No diff context is necessary (Git defaults to three lines) so you can optimize diff
 * size by excluding context (e.g. -U0 for Git).
 *
 * @deprecated
 * There is nothing wrong with this implementation other than the fact that
 * it was designed to operate on diffs. In order to support diffs on unsaved code,
 * I created vsdiff to leverage how VS Code displays diffs.
 * This class is no longer needed but I am not ready to delete it yet.
 */
export class UnifiedDiff extends Diff {

	public constructor(diff: string) {
		super();
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