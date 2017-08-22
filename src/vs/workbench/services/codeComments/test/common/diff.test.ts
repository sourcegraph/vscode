/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Diff } from 'vs/workbench/services/codeComments/common/diff';
import { Range } from 'vs/editor/common/core/range';
import * as assert from 'assert';

const diffHeader = `diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt`;

/**
 * Helper class for testing different forms of equivalent diffs.
 * u3 is a diff with 3 lines of context around each change (the default).
 * u0 is a diff with 0 lines of context around each change (-U0 option).
 */
class TestDiff {
	constructor(
		private u3Hunks: string,
		private u0Hunks: string,
	) { }

	/**
	 * Asserts that the diff transforms `from` to `to`.
	 * If `toU0` is provided, that value is used for the case
	 * where no diff context is provided.
	 */
	public assertTransformRange(from: Range, to: Range, toU0?: Range) {
		toU0 = toU0 || to;
		this.assertDiffTransformRange('u3\n' + diffHeader + this.u3Hunks, new Diff(diffHeader + this.u3Hunks), from, to);
		this.assertDiffTransformRange('u0\n' + diffHeader + this.u0Hunks, new Diff(diffHeader + this.u0Hunks), from, toU0);
	}

	private assertDiffTransformRange(label: string, diff: Diff, from: Range, to: Range) {
		const actual = diff.transformRange(from);
		const expectedActual = `diff.transformRange(${from})\nexpected: ${to}\nactual: ${actual}`;
		assert.deepEqual(actual, to, label + expectedActual);
	}
}

suite('diff', () => {
	suite('transformRange', () => {
		test('add one line at beginning', () => {
			const diff = new TestDiff(`
@@ -1,3 +1,4 @@
+added line
 this is line 1
 this is line 2
 this is line 3
`, `
@@ -0,0 +1 @@
+added line
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), new Range(2, 1, 2, 2));
			diff.assertTransformRange(new Range(2, 1, 2, 2), new Range(3, 1, 3, 2));
		});

		test('add one line in middle', () => {
			const diff = new TestDiff(`
@@ -1,4 +1,5 @@
 this is line 1
+added line
 this is line 2
 this is line 3
 this is line 4
`, `
@@ -1,0 +2 @@ this is line 1
+added line
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), new Range(1, 1, 1, 2));
			diff.assertTransformRange(new Range(2, 1, 2, 2), new Range(3, 1, 3, 2));

			diff.assertTransformRange(new Range(1, 1, 2, 2), new Range(1, 1, 3, 2));
		});

		test('add one line at end', () => {
			const diff = new TestDiff(`
@@ -18,3 +18,4 @@ this is line 17
 this is line 18
 this is line 19
 this is line 20
+added line
`, `
@@ -20,0 +21 @@ this is line 20
+added line
`);
			diff.assertTransformRange(new Range(20, 1, 20, 2), new Range(20, 1, 20, 2));
			diff.assertTransformRange(new Range(21, 1, 21, 2), new Range(22, 1, 22, 2));
		});

		test('add two lines at beginning', () => {
			const diff = new TestDiff(`
@@ -1,3 +1,5 @@
+added line a
+added line b
 this is line 1
 this is line 2
 this is line 3
`, `
@@ -0,0 +1,2 @@
+added line a
+added line b
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), new Range(3, 1, 3, 2));
		});

		test('add two lines in middle', () => {
			const diff = new TestDiff(`
@@ -7,6 +7,8 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
+added line
+added line
 this is line 10
 this is line 11
 this is line 12
`, `
@@ -9,0 +10,2 @@ this is line 9
+added line
+added line
`);
			diff.assertTransformRange(new Range(9, 1, 9, 2), new Range(9, 1, 9, 2));
			diff.assertTransformRange(new Range(10, 1, 10, 2), new Range(12, 1, 12, 2));

			diff.assertTransformRange(new Range(9, 1, 10, 2), new Range(9, 1, 12, 2));
		});

		test('add two lines at end', () => {
			const diff = new TestDiff(`
@@ -18,3 +18,5 @@ this is line 17
 this is line 18
 this is line 19
 this is line 20
+added line
+added line
`, `
@@ -20,0 +21,2 @@ this is line 20
+added line
+added line
`);
			diff.assertTransformRange(new Range(20, 1, 20, 2), new Range(20, 1, 20, 2));
			diff.assertTransformRange(new Range(21, 1, 21, 2), new Range(23, 1, 23, 2));
		});

		test('add one line in multiple hunks', () => {
			const diff = new TestDiff(`
@@ -1,6 +1,7 @@
 this is line 1
 this is line 2
 this is line 3
+added line
 this is line 4
 this is line 5
 this is line 6
@@ -8,6 +9,7 @@ this is line 7
 this is line 8
 this is line 9
 this is line 10
+added line
 this is line 11
 this is line 12
 this is line 13
@@ -15,6 +17,7 @@ this is line 14
 this is line 15
 this is line 16
 this is line 17
+added line
 this is line 18
 this is line 19
 this is line 20
`, `
@@ -3,0 +4 @@ this is line 3
+added line
@@ -10,0 +12 @@ this is line 10
+added line
@@ -17,0 +20 @@ this is line 17
+added line
`);
			diff.assertTransformRange(new Range(3, 1, 3, 2), new Range(3, 1, 3, 2));
			diff.assertTransformRange(new Range(4, 1, 4, 2), new Range(5, 1, 5, 2));
			diff.assertTransformRange(new Range(10, 1, 10, 2), new Range(11, 1, 11, 2));
			diff.assertTransformRange(new Range(11, 1, 11, 2), new Range(13, 1, 13, 2));
			diff.assertTransformRange(new Range(17, 1, 17, 2), new Range(19, 1, 19, 2));
			diff.assertTransformRange(new Range(18, 1, 18, 2), new Range(21, 1, 21, 2));

			diff.assertTransformRange(new Range(3, 1, 18, 2), new Range(3, 1, 21, 2));
		});

		test('add two lines in multiple hunks', () => {
			const diff = new TestDiff(`
@@ -1,6 +1,8 @@
 this is line 1
 this is line 2
 this is line 3
+added line
+added line
 this is line 4
 this is line 5
 this is line 6
@@ -8,6 +10,8 @@ this is line 7
 this is line 8
 this is line 9
 this is line 10
+added line
+added line
 this is line 11
 this is line 12
 this is line 13
@@ -15,6 +19,8 @@ this is line 14
 this is line 15
 this is line 16
 this is line 17
+added line
+added line
 this is line 18
 this is line 19
 this is line 20
`, `
@@ -3,0 +4,2 @@ this is line 3
+added line
+added line
@@ -10,0 +13,2 @@ this is line 10
+added line
+added line
@@ -17,0 +22,2 @@ this is line 17
+added line
+added line
`);
			diff.assertTransformRange(new Range(3, 1, 3, 2), new Range(3, 1, 3, 2));
			diff.assertTransformRange(new Range(4, 1, 4, 2), new Range(6, 1, 6, 2));
			diff.assertTransformRange(new Range(10, 1, 10, 2), new Range(12, 1, 12, 2));
			diff.assertTransformRange(new Range(11, 1, 11, 2), new Range(15, 1, 15, 2));
			diff.assertTransformRange(new Range(17, 1, 17, 2), new Range(21, 1, 21, 2));
			diff.assertTransformRange(new Range(18, 1, 18, 2), new Range(24, 1, 24, 2));

			diff.assertTransformRange(new Range(3, 1, 18, 2), new Range(3, 1, 24, 2));
		});

		test('delete one line at beginning', () => {
			const diff = new TestDiff(`
@@ -1,4 +1,3 @@
-this is line 1
 this is line 2
 this is line 3
 this is line 4
`, `
@@ -1 +0,0 @@
-this is line 1
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), undefined);
			diff.assertTransformRange(new Range(2, 1, 2, 2), new Range(1, 1, 1, 2));
		});

		test('delete one line in middle', () => {
			const diff = new TestDiff(`
@@ -7,7 +7,6 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
 this is line 11
 this is line 12
 this is line 13
`, `
@@ -10 +9,0 @@ this is line 9
-this is line 10
`);
			diff.assertTransformRange(new Range(8, 15, 9, 1), undefined, new Range(8, 15, 9, 1));
			diff.assertTransformRange(new Range(9, 1, 9, 2), new Range(9, 1, 9, 2));
			diff.assertTransformRange(new Range(9, 15, 10, 1), undefined, new Range(9, 15, 10, 1));
			diff.assertTransformRange(new Range(9, 15, 10, 15), undefined, new Range(9, 15, 10, 1));
			diff.assertTransformRange(new Range(9, 15, 11, 1), undefined, new Range(9, 15, 10, 1));
			diff.assertTransformRange(new Range(10, 1, 10, 2), undefined);
			diff.assertTransformRange(new Range(10, 1, 11, 1), undefined);
			diff.assertTransformRange(new Range(11, 1, 11, 2), new Range(10, 1, 10, 2));

			diff.assertTransformRange(new Range(9, 1, 11, 2), new Range(9, 1, 10, 2));
			diff.assertTransformRange(new Range(10, 1, 11, 2), new Range(10, 1, 10, 2));
			diff.assertTransformRange(new Range(9, 1, 10, 2), new Range(9, 1, 9, 15), new Range(9, 1, 10, 1));
		});

		test('delete one line at end', () => {
			const diff = new TestDiff(`
@@ -17,4 +17,3 @@ this is line 16
 this is line 17
 this is line 18
 this is line 19
-this is line 20
`, `
@@ -20 +19,0 @@ this is line 19
-this is line 20
`);
			diff.assertTransformRange(new Range(19, 1, 19, 2), new Range(19, 1, 19, 2));
			diff.assertTransformRange(new Range(20, 1, 20, 2), undefined);
			diff.assertTransformRange(new Range(21, 1, 21, 2), new Range(20, 1, 20, 2));
		});

		test('delete two lines at beginning', () => {
			const diff = new TestDiff(`
@@ -1,5 +1,3 @@
-this is line 1
-this is line 2
 this is line 3
 this is line 4
 this is line 5
`, `
@@ -1,2 +0,0 @@
-this is line 1
-this is line 2
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), undefined);
			diff.assertTransformRange(new Range(2, 1, 2, 2), undefined);
			diff.assertTransformRange(new Range(3, 1, 3, 2), new Range(1, 1, 1, 2));
		});

		test('delete two lines in middle', () => {
			const diff = new TestDiff(`
@@ -7,8 +7,6 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
-this is line 11
 this is line 12
 this is line 13
 this is line 14
`, `
@@ -10,2 +9,0 @@ this is line 9
-this is line 10
-this is line 11
`);
			diff.assertTransformRange(new Range(9, 1, 9, 2), new Range(9, 1, 9, 2));
			diff.assertTransformRange(new Range(10, 1, 10, 2), undefined);
			diff.assertTransformRange(new Range(11, 1, 11, 2), undefined);
			diff.assertTransformRange(new Range(12, 1, 12, 2), new Range(10, 1, 10, 2));

			diff.assertTransformRange(new Range(9, 1, 12, 2), new Range(9, 1, 10, 2));

			diff.assertTransformRange(new Range(10, 1, 12, 2), new Range(10, 1, 10, 2));
			diff.assertTransformRange(new Range(11, 1, 12, 2), new Range(10, 1, 10, 2));

			diff.assertTransformRange(new Range(9, 1, 10, 2), new Range(9, 1, 9, 15), new Range(9, 1, 10, 1));
			diff.assertTransformRange(new Range(9, 1, 11, 2), new Range(9, 1, 9, 15), new Range(9, 1, 10, 1));
		});

		test('delete two lines at end', () => {
			const diff = new TestDiff(`
@@ -16,5 +16,3 @@ this is line 15
 this is line 16
 this is line 17
 this is line 18
-this is line 19
-this is line 20
`, `
@@ -19,2 +18,0 @@ this is line 18
-this is line 19
-this is line 20
`);
			diff.assertTransformRange(new Range(18, 1, 18, 2), new Range(18, 1, 18, 2));
			diff.assertTransformRange(new Range(19, 1, 19, 2), undefined);
			diff.assertTransformRange(new Range(20, 1, 20, 2), undefined);
			diff.assertTransformRange(new Range(21, 1, 21, 2), new Range(19, 1, 19, 2));
		});

		test('delete one line in multiple hunks', () => {
			const diff = new TestDiff(`
@@ -1,5 +1,4 @@
 this is line 1
-this is line 2
 this is line 3
 this is line 4
 this is line 5
@@ -8,7 +7,6 @@ this is line 7
 this is line 8
 this is line 9
 this is line 10
-this is line 11
 this is line 12
 this is line 13
 this is line 14
@@ -16,5 +14,4 @@ this is line 15
 this is line 16
 this is line 17
 this is line 18
-this is line 19
 this is line 20
`, `
@@ -2 +1,0 @@ this is line 1
-this is line 2
@@ -11 +9,0 @@ this is line 10
-this is line 11
@@ -19 +16,0 @@ this is line 18
-this is line 19
`);
			diff.assertTransformRange(new Range(10, 1, 10, 2), new Range(9, 1, 9, 2));
			diff.assertTransformRange(new Range(11, 1, 11, 2), undefined);
			diff.assertTransformRange(new Range(12, 1, 12, 2), new Range(10, 1, 10, 2));
			diff.assertTransformRange(new Range(18, 1, 18, 2), new Range(16, 1, 16, 2));
			diff.assertTransformRange(new Range(19, 1, 19, 2), undefined);
			diff.assertTransformRange(new Range(20, 1, 20, 2), new Range(17, 1, 17, 2));

			diff.assertTransformRange(new Range(1, 1, 20, 2), new Range(1, 1, 17, 2));
		});

		test('delete two lines in multiple hunks', () => {
			const diff = new TestDiff(`
@@ -1,5 +1,3 @@
-this is line 1
-this is line 2
 this is line 3
 this is line 4
 this is line 5
@@ -7,8 +5,6 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
-this is line 11
 this is line 12
 this is line 13
 this is line 14
@@ -16,5 +12,3 @@ this is line 15
 this is line 16
 this is line 17
 this is line 18
-this is line 19
-this is line 20
`, `
@@ -1,2 +0,0 @@
-this is line 1
-this is line 2
@@ -10,2 +7,0 @@ this is line 9
-this is line 10
-this is line 11
@@ -19,2 +14,0 @@ this is line 18
-this is line 19
-this is line 20
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), undefined);
			diff.assertTransformRange(new Range(2, 1, 2, 2), undefined);
			diff.assertTransformRange(new Range(3, 1, 3, 2), new Range(1, 1, 1, 2));

			diff.assertTransformRange(new Range(9, 1, 9, 2), new Range(7, 1, 7, 2));
			diff.assertTransformRange(new Range(10, 1, 10, 2), undefined);
			diff.assertTransformRange(new Range(11, 1, 11, 2), undefined);
			diff.assertTransformRange(new Range(12, 1, 12, 2), new Range(8, 1, 8, 2));

			diff.assertTransformRange(new Range(18, 1, 18, 2), new Range(14, 1, 14, 2));
			diff.assertTransformRange(new Range(19, 1, 19, 2), undefined);
			diff.assertTransformRange(new Range(20, 1, 20, 2), undefined);
			diff.assertTransformRange(new Range(21, 1, 21, 2), new Range(15, 1, 15, 2));

			diff.assertTransformRange(new Range(1, 1, 21, 2), new Range(1, 1, 15, 2));
		});

		test('edit one line at beginning', () => {
			const diff = new TestDiff(`
@@ -1,4 +1,4 @@
-this is line 1
+edited line
 this is line 2
 this is line 3
 this is line 4
`, `
@@ -1 +1 @@
-this is line 1
+edited line
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), undefined);
			diff.assertTransformRange(new Range(2, 1, 2, 2), new Range(2, 1, 2, 2));
		});

		test('edit one line in middle', () => {
			const diff = new TestDiff(`
@@ -7,7 +7,7 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
+edited line
 this is line 11
 this is line 12
 this is line 13
`, `
@@ -10 +10 @@ this is line 9
-this is line 10
+edited line
`);
			diff.assertTransformRange(new Range(10, 1, 10, 2), undefined);
			diff.assertTransformRange(new Range(11, 1, 11, 2), new Range(11, 1, 11, 2));

			diff.assertTransformRange(new Range(9, 1, 11, 2), new Range(9, 1, 11, 2));
			diff.assertTransformRange(new Range(10, 1, 11, 2), new Range(11, 1, 11, 2));
			diff.assertTransformRange(new Range(9, 1, 10, 2), new Range(9, 1, 9, 15), new Range(9, 1, 10, 1));
		});

		test('edit one line in multiple hunks', () => {
			const diff = new TestDiff(`
@@ -1,5 +1,5 @@
 this is line 1
-this is line 2
+edited line
 this is line 3
 this is line 4
 this is line 5
@@ -7,7 +7,7 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
+edited line
 this is line 11
 this is line 12
 this is line 13
@@ -16,5 +16,5 @@ this is line 15
 this is line 16
 this is line 17
 this is line 18
-this is line 19
+edited line
 this is line 20
`, `
@@ -2 +2 @@ this is line 1
-this is line 2
+edited line
@@ -10 +10 @@ this is line 9
-this is line 10
+edited line
@@ -19 +19 @@ this is line 18
-this is line 19
+edited line
`);
			diff.assertTransformRange(new Range(2, 1, 2, 2), undefined);
			diff.assertTransformRange(new Range(3, 1, 3, 2), new Range(3, 1, 3, 2));

			diff.assertTransformRange(new Range(9, 1, 9, 2), new Range(9, 1, 9, 2));
			diff.assertTransformRange(new Range(10, 1, 10, 2), undefined);
			diff.assertTransformRange(new Range(11, 1, 11, 2), new Range(11, 1, 11, 2));

			diff.assertTransformRange(new Range(18, 1, 18, 2), new Range(18, 1, 18, 2));
			diff.assertTransformRange(new Range(19, 1, 19, 2), undefined);
			diff.assertTransformRange(new Range(20, 1, 20, 2), new Range(20, 1, 20, 2));

			diff.assertTransformRange(new Range(1, 1, 20, 2), new Range(1, 1, 20, 2));
		});

		test('edit two lines in multiple hunks', () => {
			const diff = new TestDiff(`
@@ -1,5 +1,5 @@
-this is line 1
-this is line 2
+edited line
+edited line
 this is line 3
 this is line 4
 this is line 5
@@ -7,8 +7,8 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
-this is line 11
+edited line
+edited line
 this is line 12
 this is line 13
 this is line 14
@@ -16,5 +16,5 @@ this is line 15
 this is line 16
 this is line 17
 this is line 18
-this is line 19
-this is line 20
+edited line
+edited line
`, `
@@ -1,2 +1,2 @@
-this is line 1
-this is line 2
+edited line
+edited line
@@ -10,2 +10,2 @@ this is line 9
-this is line 10
-this is line 11
+edited line
+edited line
@@ -19,2 +19,2 @@ this is line 18
-this is line 19
-this is line 20
+edited line
+edited line
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), undefined);
			diff.assertTransformRange(new Range(2, 1, 2, 2), undefined);
			diff.assertTransformRange(new Range(3, 1, 3, 2), new Range(3, 1, 3, 2));

			diff.assertTransformRange(new Range(9, 1, 9, 2), new Range(9, 1, 9, 2));
			diff.assertTransformRange(new Range(10, 1, 10, 2), undefined);
			diff.assertTransformRange(new Range(11, 1, 11, 2), undefined);
			diff.assertTransformRange(new Range(12, 1, 12, 2), new Range(12, 1, 12, 2));

			diff.assertTransformRange(new Range(18, 1, 18, 2), new Range(18, 1, 18, 2));
			diff.assertTransformRange(new Range(19, 1, 19, 2), undefined);
			diff.assertTransformRange(new Range(20, 1, 20, 2), undefined);
			diff.assertTransformRange(new Range(21, 1, 21, 2), new Range(21, 1, 21, 2));

			diff.assertTransformRange(new Range(1, 1, 20, 2), new Range(3, 1, 18, 16), new Range(3, 1, 19, 1));
		});

		test('net add lines in multiple hunks', () => {
			const diff = new TestDiff(`
@@ -1,4 +1,5 @@
-this is line 1
+added line
+added line
 this is line 2
 this is line 3
 this is line 4
@@ -7,7 +8,8 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
+added line
+added line
 this is line 11
 this is line 12
 this is line 13
@@ -17,4 +19,5 @@ this is line 16
 this is line 17
 this is line 18
 this is line 19
-this is line 20
+added line
+added line
`, `
@@ -1 +1,2 @@
-this is line 1
+added line
+added line
@@ -10 +11,2 @@ this is line 9
-this is line 10
+added line
+added line
@@ -20 +22,2 @@ this is line 19
-this is line 20
+added line
+added line
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), undefined);
			diff.assertTransformRange(new Range(2, 1, 2, 2), new Range(3, 1, 3, 2));

			diff.assertTransformRange(new Range(9, 1, 9, 2), new Range(10, 1, 10, 2));
			diff.assertTransformRange(new Range(10, 1, 10, 2), undefined);
			diff.assertTransformRange(new Range(11, 1, 11, 2), new Range(13, 1, 13, 2));

			diff.assertTransformRange(new Range(19, 1, 19, 2), new Range(21, 1, 21, 2));
			diff.assertTransformRange(new Range(20, 1, 20, 2), undefined);
			diff.assertTransformRange(new Range(21, 1, 21, 2), new Range(24, 1, 24, 2));

			diff.assertTransformRange(new Range(1, 1, 20, 2), new Range(3, 1, 21, 16), new Range(3, 1, 22, 1));
		});

		test('net delete lines in multiple hunks', () => {
			const diff = new TestDiff(`
@@ -1,5 +1,4 @@
-this is line 1
-this is line 2
+added line
 this is line 3
 this is line 4
 this is line 5
@@ -7,8 +6,7 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
-this is line 11
+added line
 this is line 12
 this is line 13
 this is line 14
@@ -16,5 +14,4 @@ this is line 15
 this is line 16
 this is line 17
 this is line 18
-this is line 19
-this is line 20
+added line
`, `
@@ -1,2 +1 @@
-this is line 1
-this is line 2
+added line
@@ -10,2 +9 @@ this is line 9
-this is line 10
-this is line 11
+added line
@@ -19,2 +17 @@ this is line 18
-this is line 19
-this is line 20
+added line
`);
			diff.assertTransformRange(new Range(1, 1, 1, 2), undefined);
			diff.assertTransformRange(new Range(2, 1, 2, 2), undefined);
			diff.assertTransformRange(new Range(3, 1, 3, 2), new Range(2, 1, 2, 2));

			diff.assertTransformRange(new Range(9, 1, 9, 2), new Range(8, 1, 8, 2));
			diff.assertTransformRange(new Range(10, 1, 10, 2), undefined);
			diff.assertTransformRange(new Range(11, 1, 11, 2), undefined);
			diff.assertTransformRange(new Range(12, 1, 12, 2), new Range(10, 1, 10, 2));

			diff.assertTransformRange(new Range(18, 1, 18, 2), new Range(16, 1, 16, 2));
			diff.assertTransformRange(new Range(19, 1, 19, 2), undefined);
			diff.assertTransformRange(new Range(20, 1, 20, 2), undefined);
			diff.assertTransformRange(new Range(21, 1, 21, 2), new Range(18, 1, 18, 2));

			diff.assertTransformRange(new Range(1, 1, 20, 2), new Range(2, 1, 16, 16), new Range(2, 1, 17, 1));
		});

		test('move first line forward one', () => {
			const diff = new TestDiff(`
@@ -1,5 +1,5 @@
-this is line 1
 this is line 2
+this is line 1
 this is line 3
 this is line 4
 this is line 5
`, `
@@ -1 +0,0 @@
-this is line 1
@@ -2,0 +2 @@ this is line 2
+this is line 1
`);
			diff.assertTransformRange(new Range(1, 1, 1, 15), new Range(2, 1, 2, 15));
			diff.assertTransformRange(new Range(1, 6, 1, 15), new Range(2, 6, 2, 15));
			diff.assertTransformRange(new Range(1, 6, 1, 8), new Range(2, 6, 2, 8));
		});

		test('move first line forward two', () => {
			const diff = new TestDiff(`
@@ -1,6 +1,6 @@
-this is line 1
 this is line 2
 this is line 3
+this is line 1
 this is line 4
 this is line 5
 this is line 6
`, `
@@ -1 +0,0 @@
-this is line 1
@@ -3,0 +3 @@ this is line 3
+this is line 1
`);
			diff.assertTransformRange(new Range(1, 1, 1, 15), new Range(3, 1, 3, 15));
			diff.assertTransformRange(new Range(1, 6, 1, 15), new Range(3, 6, 3, 15));
			diff.assertTransformRange(new Range(1, 6, 1, 8), new Range(3, 6, 3, 8));
		});

		test('move middle line forward one', () => {
			const diff = new TestDiff(`
@@ -7,8 +7,8 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
 this is line 11
+this is line 10
 this is line 12
 this is line 13
 this is line 14
`, `
@@ -10 +9,0 @@ this is line 9
-this is line 10
@@ -11,0 +11 @@ this is line 11
+this is line 10
`);
			diff.assertTransformRange(new Range(10, 1, 10, 16), new Range(11, 1, 11, 16));
			diff.assertTransformRange(new Range(10, 6, 10, 16), new Range(11, 6, 11, 16));
			diff.assertTransformRange(new Range(10, 6, 10, 8), new Range(11, 6, 11, 8));
		});

		test('move middle line forward two', () => {
			const diff = new TestDiff(`
@@ -7,9 +7,9 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
 this is line 11
 this is line 12
+this is line 10
 this is line 13
 this is line 14
 this is line 15
`, `
@@ -10 +9,0 @@ this is line 9
-this is line 10
@@ -12,0 +12 @@ this is line 12
+this is line 10
`);
			diff.assertTransformRange(new Range(10, 1, 10, 16), new Range(12, 1, 12, 16));
			diff.assertTransformRange(new Range(10, 6, 10, 16), new Range(12, 6, 12, 16));
			diff.assertTransformRange(new Range(10, 6, 10, 8), new Range(12, 6, 12, 8));
		});

		test('move middle line back to first line', () => {
			const diff = new TestDiff(`
@@ -1,6 +1,6 @@
+this is line 3
 this is line 1
 this is line 2
-this is line 3
 this is line 4
 this is line 5
 this is line 6
`, `
@@ -0,0 +1 @@
+this is line 3
@@ -3 +3,0 @@ this is line 2
-this is line 3
`);
			diff.assertTransformRange(new Range(3, 1, 3, 15), new Range(1, 1, 1, 15));
			diff.assertTransformRange(new Range(3, 6, 3, 15), new Range(1, 6, 1, 15));
			diff.assertTransformRange(new Range(3, 6, 3, 8), new Range(1, 6, 1, 8));
		});

		test('move middle line back to middle line', () => {
			const diff = new TestDiff(`
@@ -4,9 +4,9 @@ this is line 3
 this is line 4
 this is line 5
 this is line 6
+this is line 9
 this is line 7
 this is line 8
-this is line 9
 this is line 10
 this is line 11
 this is line 12
`, `
@@ -6,0 +7 @@ this is line 6
+this is line 9
@@ -9 +9,0 @@ this is line 8
-this is line 9
`);
			diff.assertTransformRange(new Range(9, 1, 9, 15), new Range(7, 1, 7, 15));
			diff.assertTransformRange(new Range(9, 6, 9, 15), new Range(7, 6, 7, 15));
			diff.assertTransformRange(new Range(9, 6, 9, 8), new Range(7, 6, 7, 8));
		});

		test('move and duplicate', () => {
			const diff = new TestDiff(`
@@ -1,10 +1,11 @@
 this is line 1
 this is line 2
+this is line 5
 this is line 3
 this is line 4
-this is line 5
 this is line 6
 this is line 7
+this is line 5
 this is line 8
 this is line 9
 this is line 10
`, `
@@ -2,0 +3 @@ this is line 2
+this is line 5
@@ -5 +5,0 @@ this is line 4
-this is line 5
@@ -7,0 +8 @@ this is line 7
+this is line 5
`);
			// Either line (3 or 8) would be acceptible, but our implementation chooses the last line.
			// Ideally it would return both but that requires cascading API changes.
			diff.assertTransformRange(new Range(5, 1, 5, 15), new Range(8, 1, 8, 15));
			diff.assertTransformRange(new Range(5, 6, 5, 15), new Range(8, 6, 8, 15));
			diff.assertTransformRange(new Range(5, 6, 5, 8), new Range(8, 6, 8, 8));
		});

		test('move three lines contiguous', () => {
			const diff = new TestDiff(`
@@ -1,12 +1,12 @@
 this is line 1
-this is line 2
-this is line 3
-this is line 4
 this is line 5
 this is line 6
 this is line 7
 this is line 8
 this is line 9
+this is line 2
+this is line 3
+this is line 4
 this is line 10
 this is line 11
 this is line 12
`, `
@@ -2,3 +1,0 @@ this is line 1
-this is line 2
-this is line 3
-this is line 4
@@ -9,0 +7,3 @@ this is line 9
+this is line 2
+this is line 3
+this is line 4
`);
			diff.assertTransformRange(new Range(2, 6, 3, 8), new Range(7, 6, 8, 8));
			diff.assertTransformRange(new Range(2, 6, 4, 8), new Range(7, 6, 9, 8));
			diff.assertTransformRange(new Range(3, 6, 4, 8), new Range(8, 6, 9, 8));
		});

		test('move not contiguous', () => {
			const diff = new TestDiff(`
@@ -1,12 +1,12 @@
 this is line 1
-this is line 2
-this is line 3
-this is line 4
 this is line 5
 this is line 6
 this is line 7
 this is line 8
+this is line 2
+this is line 3
 this is line 9
+this is line 4
 this is line 10
 this is line 11
 this is line 12
`, `
@@ -2,3 +1,0 @@ this is line 1
-this is line 2
-this is line 3
-this is line 4
@@ -8,0 +6,2 @@ this is line 8
+this is line 2
+this is line 3
@@ -9,0 +9 @@ this is line 9
+this is line 4
`);
			// Ideally we would split the range into two.
			diff.assertTransformRange(new Range(2, 6, 3, 8), new Range(6, 6, 7, 8));
			diff.assertTransformRange(new Range(2, 6, 4, 8), new Range(6, 6, 7, 15));
			diff.assertTransformRange(new Range(3, 6, 4, 8), new Range(7, 6, 7, 15));
		});

		test('move and add', () => {
			const diff = new TestDiff(`
@@ -1,12 +1,13 @@
 this is line 1
-this is line 2
-this is line 3
-this is line 4
 this is line 5
 this is line 6
 this is line 7
 this is line 8
 this is line 9
+this is line 2
+this is line 3
+new line
+this is line 4
 this is line 10
 this is line 11
 this is line 12
`, `
@@ -2,3 +1,0 @@ this is line 1
-this is line 2
-this is line 3
-this is line 4
@@ -9,0 +7,4 @@ this is line 9
+this is line 2
+this is line 3
+new line
+this is line 4
`);
			// Ideally we would split the range into two.
			diff.assertTransformRange(new Range(2, 6, 3, 8), new Range(7, 6, 8, 8));
			diff.assertTransformRange(new Range(2, 6, 4, 8), new Range(7, 6, 8, 15));
			diff.assertTransformRange(new Range(3, 6, 4, 8), new Range(8, 6, 8, 15));
		});

		test('indent lines', () => {
			const diff = new TestDiff(`
@@ -4,9 +4,9 @@ this is line 3
 this is line 4
 this is line 5
 this is line 6
-this is line 7
-this is line 8
-this is line 9
+  this is line 7
+  this is line 8
+  this is line 9
 this is line 10
 this is line 11
 this is line 12
`, `
@@ -7,3 +7,3 @@ this is line 6
-this is line 7
-this is line 8
-this is line 9
+  this is line 7
+  this is line 8
+  this is line 9
`);
			diff.assertTransformRange(new Range(7, 1, 7, 8), new Range(7, 3, 7, 10));
			diff.assertTransformRange(new Range(7, 1, 7, 15), new Range(7, 3, 7, 17));
			diff.assertTransformRange(new Range(7, 1, 8, 8), new Range(7, 3, 8, 10));
			diff.assertTransformRange(new Range(7, 1, 8, 15), new Range(7, 3, 8, 17));
			diff.assertTransformRange(new Range(7, 1, 9, 8), new Range(7, 3, 9, 10));

			diff.assertTransformRange(new Range(8, 1, 8, 8), new Range(8, 3, 8, 10));
			diff.assertTransformRange(new Range(8, 1, 8, 15), new Range(8, 3, 8, 17));
			diff.assertTransformRange(new Range(8, 1, 9, 8), new Range(8, 3, 9, 10));
			diff.assertTransformRange(new Range(9, 1, 9, 8), new Range(9, 3, 9, 10));
		});

		test('unindent lines', () => {
			const diff = new TestDiff(`
@@ -4,9 +4,9 @@ this is line 3
 this is line 4
 this is line 5
 this is line 6
-  this is line 7
-  this is line 8
-  this is line 9
+this is line 7
+this is line 8
+this is line 9
 this is line 10
 this is line 11
 this is line 12
`, `
@@ -7,3 +7,3 @@ this is line 6
-  this is line 7
-  this is line 8
-  this is line 9
+this is line 7
+this is line 8
+this is line 9
`);
			diff.assertTransformRange(new Range(7, 1, 7, 10), new Range(7, 1, 7, 8));
			diff.assertTransformRange(new Range(7, 2, 7, 10), new Range(7, 1, 7, 8));
			diff.assertTransformRange(new Range(7, 3, 7, 10), new Range(7, 1, 7, 8));
			diff.assertTransformRange(new Range(7, 4, 7, 10), new Range(7, 2, 7, 8));

			diff.assertTransformRange(new Range(7, 3, 8, 10), new Range(7, 1, 8, 8));
			diff.assertTransformRange(new Range(7, 3, 9, 10), new Range(7, 1, 9, 8));
			diff.assertTransformRange(new Range(8, 3, 9, 10), new Range(8, 1, 9, 8));
			diff.assertTransformRange(new Range(9, 3, 9, 10), new Range(9, 1, 9, 8));
		});

		test('move line and add similar line below', () => {
			const diff = new TestDiff(`
@@ -1,10 +1,11 @@
 this is line 1
-this is line 2
 this is line 3
 this is line 4
 this is line 5
+this is line 2
 this is line 6
 this is line 7
+  this is line 2
 this is line 8
 this is line 9
 this is line 10
`, `
@@ -2 +1,0 @@ this is line 1
-this is line 2
@@ -5,0 +5 @@ this is line 5
+this is line 2
@@ -7,0 +8 @@ this is line 7
+  this is line 2
`);
			// Expect match of exact line.
			diff.assertTransformRange(new Range(2, 1, 2, 2), new Range(5, 1, 5, 2));
		});

		test('move line and add similar line above', () => {
			const diff = new TestDiff(`
@@ -1,10 +1,11 @@
 this is line 1
-this is line 2
 this is line 3
 this is line 4
 this is line 5
+  this is line 2
 this is line 6
 this is line 7
+this is line 2
 this is line 8
 this is line 9
 this is line 10
`, `
@@ -2 +1,0 @@ this is line 1
-this is line 2
@@ -5,0 +5 @@ this is line 5
+  this is line 2
@@ -7,0 +8 @@ this is line 7
+this is line 2
`);
			// Expect match of exact line.
			diff.assertTransformRange(new Range(2, 1, 2, 2), new Range(8, 1, 8, 2));
		});
	});
});
