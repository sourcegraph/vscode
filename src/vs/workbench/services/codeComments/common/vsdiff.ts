/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ILineChange } from 'vs/editor/common/editorCommon';
import { DiffComputer } from 'vs/editor/common/diff/diffComputer';
import { Diff, LineDiff } from 'vs/workbench/services/codeComments/common/diff';

/**
 * VSDiff computes the diff between originalLines and modifiedLines
 * and provides a method to transform a range according to the diff.
 */
export class VSDiff extends Diff {
	public lineChanges: ILineChange[] = [];

	constructor(originalLines: string[], modifiedLines: string[]) {
		super();
		const differ = new DiffComputer(originalLines, modifiedLines, {
			shouldPostProcessCharChanges: true,
			shouldIgnoreTrimWhitespace: false,
			shouldConsiderTrimWhitespaceInEmptyCase: true,
			shouldMakePrettyDiff: true,
		});
		this.lineChanges = differ.computeDiff();
		for (const lineChange of this.lineChanges) {

			// Added
			if (lineChange.originalEndLineNumber === 0 || lineChange.modifiedEndLineNumber !== 0) {
				const totalLinesAdded = lineChange.modifiedEndLineNumber - lineChange.modifiedStartLineNumber + 1;
				for (let i = 0; i < totalLinesAdded; i++) {
					const line = lineChange.modifiedStartLineNumber + i;
					const content = modifiedLines[line - 1];
					const lineDiff: LineDiff = {
						beforeLine: lineChange.originalStartLineNumber + 1,
						afterLine: line,
						lineDelta: 1,
						content,
					};
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
				}
			}

			// Removed
			if (lineChange.modifiedEndLineNumber === 0 || lineChange.originalEndLineNumber !== 0) {
				const totalLinesRemoved = lineChange.originalEndLineNumber - lineChange.originalStartLineNumber + 1;
				for (let i = 0; i < totalLinesRemoved; i++) {
					const line = lineChange.originalStartLineNumber + i;
					const content = originalLines[line - 1];
					const lineDiff: LineDiff = {
						beforeLine: line,
						afterLine: lineChange.modifiedStartLineNumber,
						lineDelta: -1,
						content,
					};
					this.lineDiffs.push(lineDiff);
					this.deletedIndex.set(line, lineDiff);
				}
			}
		}
	}
}