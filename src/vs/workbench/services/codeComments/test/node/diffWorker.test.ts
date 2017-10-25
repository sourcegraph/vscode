/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { DiffWorker } from 'vs/workbench/services/codeComments/node/worker/diffWorker';
import { IDiffArgs } from 'vs/workbench/services/codeComments/node/worker/diffWorkerIpc';
import { Range } from 'vs/editor/common/core/range';

suite('diffWorker', function () {
	const diffWorker = new DiffWorker();
	suite('diff', function () {
		const tests: {
			label?: string;
			rangeContent: string;
			modifiedLines: string[];
			expectedRange: Range;
		}[] = [
				{
					rangeContent: 'foo',
					modifiedLines: ['foo', 'bar', 'baz'],
					expectedRange: new Range(1, 1, 1, 4),
				},
				{
					rangeContent: 'bar',
					modifiedLines: ['foo', 'bar', 'baz'],
					expectedRange: new Range(2, 1, 2, 4),
				},
				{
					rangeContent: 'baz',
					modifiedLines: ['foo', 'bar', 'baz'],
					expectedRange: new Range(3, 1, 3, 4),
				},
				{
					label: 'Multi-line beginning',
					rangeContent: 'foo\nbar',
					modifiedLines: ['foo', 'bar', 'baz'],
					expectedRange: new Range(1, 1, 2, 4),
				},
				{
					label: 'Multi-line full range',
					rangeContent: 'foo\nbar\nbaz',
					modifiedLines: ['foo', 'bar', 'baz'],
					expectedRange: new Range(1, 1, 3, 4),
				},
				{
					label: 'Multi-line end',
					rangeContent: 'bar\nbaz',
					modifiedLines: ['foo', 'bar', 'baz'],
					expectedRange: new Range(2, 1, 3, 4),
				},
				{
					rangeContent: 'bum\nbar\nbaz',
					modifiedLines: ['foo', 'bar', 'baz'],
					expectedRange: new Range(2, 1, 3, 4),
				},
				{
					label: 'Match whitespace trimmed',
					rangeContent: 'bar',
					modifiedLines: ['foo', '  bar  ', 'baz'],
					expectedRange: new Range(2, 3, 2, 6),
				},
				{
					label: 'Match middle line',
					rangeContent: 'bar',
					modifiedLines: ['foo bar baz'],
					expectedRange: new Range(1, 5, 1, 8),
				},
				{
					label: 'Match indent middle line',
					rangeContent: 'foo\nbar\nbaz',
					modifiedLines: ['foo', '  bar  ', 'baz'],
					expectedRange: new Range(1, 1, 3, 4),
				},
				{
					label: 'Match indent all lines',
					rangeContent: 'foo\nbar\nbaz',
					modifiedLines: ['  foo  ', '  bar  ', '  baz  '],
					expectedRange: new Range(1, 3, 3, 6),
				},
				{
					label: 'Match longest char length, not line length',
					rangeContent: 'a\nb\nbaz',
					modifiedLines: ['a', 'b', 'bum', 'baz'],
					expectedRange: new Range(4, 1, 4, 4),
				},
				{
					rangeContent: 'r',
					modifiedLines: ['foo', 'bar', 'baz'],
					expectedRange: new Range(2, 3, 2, 4),
				},
			];

		tests.forEach((testCase, idx) => {
			test(`[${testCase.label || idx}]: '${testCase.rangeContent}' in '${testCase.modifiedLines.join('\n')}'`, async function () {
				const revision = 'fake-revision';
				const range = new Range(1, 1, 1, 1);
				const args: IDiffArgs = {
					revLines: [],
					revRanges: [{ revision, range, rangeContent: testCase.rangeContent }],
					modifiedLines: testCase.modifiedLines,
				};
				const result = await diffWorker.diff(args);
				const actualRange = result[revision][range.toString()];
				assert.deepEqual(actualRange, testCase.expectedRange);
			});
		});
	});
});