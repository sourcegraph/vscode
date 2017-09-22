/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { VSDiff as Diff } from 'vs/workbench/services/codeComments/common/vsdiff';
import { TPromise } from 'vs/base/common/winjs.base';
import { Range } from 'vs/editor/common/core/range';
import { IDiffWorker, IDiffArgs, IDiffResult } from './diffWorkerIpc';

/**
 * A worker that transforms ranges based on diffs.
 * It should be run in a separate process because it does
 * intensive CPU bound work that would interrupt user interactions.
 */
export class DiffWorker implements IDiffWorker {

	public diff(args: IDiffArgs): TPromise<IDiffResult> {
		// We daisy chain these promises so that we can yield between each diff.
		// This gives cancellation signals a chance to propogate.
		const diffs = new Map<string, Diff>();
		return args.revLines.reduce((diffPromise, revLines) => {
			return diffPromise
				// Yield the runloop before we start a new CPU bound task.
				// This allows the cancellation signal to be handled.
				.then(() => TPromise.timeout(10))
				.then(() => {
					// This is a slow CPU bound call (i.e. 100+ms).
					const diff = new Diff(revLines.lines, args.modifiedLines);
					diffs.set(revLines.revision, diff);
				});
		}, TPromise.as(undefined))
			.then(() => {
				const diffResult: IDiffResult = {};
				for (const revRange of args.revRanges) {
					const diff = diffs.get(revRange.revision);
					const fromRange = Range.lift(revRange.range);
					const range = diff.transformRange(fromRange);
					if (!diffResult[revRange.revision]) {
						diffResult[revRange.revision] = {};
					}
					diffResult[revRange.revision][fromRange.toString()] = range;
				}
				return diffResult;
			});
	}
}