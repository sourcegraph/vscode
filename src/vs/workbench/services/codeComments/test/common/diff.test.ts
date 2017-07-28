/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Diff } from 'vs/workbench/services/codeComments/common/diff';
import { Range } from 'vs/editor/common/core/range';
import * as assert from 'assert';

/**
 * These tests were originally written in VSCode's extension context
 * where vscode.Range is 0-indexed. The code and tests were then moved
 * inside of the core codebase where Range is 1-indexed. This shim was
 * created instead of manually transforming all the test cases.
 */
class ZeroIndexedRange extends Range {
	constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
		super(startLineNumber + 1, startColumn + 1, endLineNumber + 1, endColumn + 1);
	}
}

suite('diff', () => {
	suite('transformRange', () => {
		test('add one line at beginning', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1,3 +1,4 @@
+added line
 this is line 1
 this is line 2
 this is line 3
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), new ZeroIndexedRange(1, 0, 1, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(2, 0, 2, 1));
		});

		test('add one line at beginning -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -0,0 +1 @@
+added line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), new ZeroIndexedRange(1, 0, 1, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(2, 0, 2, 1));
		});

		test('add one line in middle', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..fe7fab6 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1,4 +1,5 @@
 this is line 1
+added line
 this is line 2
 this is line 3
 this is line 4
 `);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), new ZeroIndexedRange(0, 0, 0, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(2, 0, 2, 1));
		});

		test('add one line in middle -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..fe7fab6 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1,0 +2 @@ this is line 1
+added line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), new ZeroIndexedRange(0, 0, 0, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(2, 0, 2, 1));
		});

		test('add one line at end', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -18,3 +18,4 @@ this is line 17
 this is line 18
 this is line 19
 this is line 20
+added line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), new ZeroIndexedRange(19, 0, 19, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(21, 0, 21, 1));
		});

		test('add one line at end -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -20,0 +21 @@ this is line 20
+added line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), new ZeroIndexedRange(19, 0, 19, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(21, 0, 21, 1));
		});

		test('add two lines at beginning', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1,3 +1,5 @@
+added line a
+added line b
 this is line 1
 this is line 2
 this is line 3
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), new ZeroIndexedRange(2, 0, 2, 1));
		});

		test('add two lines at beginning -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -0,0 +1,2 @@
+added line a
+added line b
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), new ZeroIndexedRange(2, 0, 2, 1));
		});

		test('add two lines in middle', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -7,6 +7,8 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
+added line
+added line
 this is line 10
 this is line 11
 this is line 12
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), new ZeroIndexedRange(11, 0, 11, 1));
		});

		test('add two lines in middle -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -9,0 +10,2 @@ this is line 9
+added line
+added line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), new ZeroIndexedRange(11, 0, 11, 1));
		});

		test('add two lines at end', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -18,3 +18,5 @@ this is line 17
 this is line 18
 this is line 19
 this is line 20
+added line
+added line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), new ZeroIndexedRange(19, 0, 19, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(22, 0, 22, 1));
		});

		test('add two lines at end -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -20,0 +21,2 @@ this is line 20
+added line
+added line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), new ZeroIndexedRange(19, 0, 19, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(22, 0, 22, 1));
		});

		test('add one line in multiple hunks', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(2, 0, 2, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(3, 0, 3, 1)), new ZeroIndexedRange(4, 0, 4, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), new ZeroIndexedRange(10, 0, 10, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(12, 0, 12, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(16, 0, 16, 1)), new ZeroIndexedRange(18, 0, 18, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(20, 0, 20, 1));
		});

		test('add one line in multiple hunks -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -3,0 +4 @@ this is line 3
+added line
@@ -10,0 +12 @@ this is line 10
+added line
@@ -17,0 +20 @@ this is line 17
+added line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(2, 0, 2, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(3, 0, 3, 1)), new ZeroIndexedRange(4, 0, 4, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), new ZeroIndexedRange(10, 0, 10, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(12, 0, 12, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(16, 0, 16, 1)), new ZeroIndexedRange(18, 0, 18, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(20, 0, 20, 1));
		});

		test('add two lines in multiple hunks', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(2, 0, 2, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(3, 0, 3, 1)), new ZeroIndexedRange(5, 0, 5, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), new ZeroIndexedRange(11, 0, 11, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(14, 0, 14, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(16, 0, 16, 1)), new ZeroIndexedRange(20, 0, 20, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(23, 0, 23, 1));
		});

		test('add two lines in multiple hunks -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(2, 0, 2, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(3, 0, 3, 1)), new ZeroIndexedRange(5, 0, 5, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), new ZeroIndexedRange(11, 0, 11, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(14, 0, 14, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(16, 0, 16, 1)), new ZeroIndexedRange(20, 0, 20, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(23, 0, 23, 1));
		});

		test('delete one line at beginning', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1,4 +1,3 @@
-this is line 1
 this is line 2
 this is line 3
 this is line 4
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(0, 0, 0, 1));
		});

		test('delete one line at beginning -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1 +0,0 @@
-this is line 1
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(0, 0, 0, 1));
		});

		test('delete one line in middle', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -7,7 +7,6 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
 this is line 11
 this is line 12
 this is line 13
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(9, 0, 9, 1));
		});

		test('delete one line in middle -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -10 +9,0 @@ this is line 9
-this is line 10
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(9, 0, 9, 1));
		});

		test('delete one line at end', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -17,4 +17,3 @@ this is line 16
 this is line 17
 this is line 18
 this is line 19
-this is line 20
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), new ZeroIndexedRange(18, 0, 18, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(19, 0, 19, 1));
		});

		test('delete one line at end -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -20 +19,0 @@ this is line 19
-this is line 20
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), new ZeroIndexedRange(18, 0, 18, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(19, 0, 19, 1));
		});

		test('delete two lines at beginning', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1,5 +1,3 @@
-this is line 1
-this is line 2
 this is line 3
 this is line 4
 this is line 5
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(0, 0, 0, 1));
		});

		test('delete two lines at beginning -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1,2 +0,0 @@
-this is line 1
-this is line 2
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(0, 0, 0, 1));
		});

		test('delete two lines in middle', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -7,8 +7,6 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
-this is line 11
 this is line 12
 this is line 13
 this is line 14
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(9, 0, 9, 1));
		});

		test('delete two lines in middle -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -10,2 +9,0 @@ this is line 9
-this is line 10
-this is line 11
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(9, 0, 9, 1));
		});

		test('delete two lines at end', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -16,5 +16,3 @@ this is line 15
 this is line 16
 this is line 17
 this is line 18
-this is line 19
-this is line 20
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(17, 0, 17, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(18, 0, 18, 1));
		});

		test('delete two lines at end -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -19,2 +18,0 @@ this is line 18
-this is line 19
-this is line 20
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(17, 0, 17, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(18, 0, 18, 1));
		});

		test('delete one line in multiple hunks', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(9, 0, 9, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(15, 0, 15, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), new ZeroIndexedRange(16, 0, 16, 1));
		});

		test('delete one line in multiple hunks -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -2 +1,0 @@ this is line 1
-this is line 2
@@ -11 +9,0 @@ this is line 10
-this is line 11
@@ -19 +16,0 @@ this is line 18
-this is line 19
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(9, 0, 9, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(15, 0, 15, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), new ZeroIndexedRange(16, 0, 16, 1));
		});

		test('delete two lines in multiple hunks', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(0, 0, 0, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(6, 0, 6, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(7, 0, 7, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(13, 0, 13, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(14, 0, 14, 1));
		});

		test('delete two lines in multiple hunks -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(0, 0, 0, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(6, 0, 6, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(7, 0, 7, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(13, 0, 13, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(14, 0, 14, 1));
		});

		test('edit one line at beginning', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1,4 +1,4 @@
-this is line 1
+edited line
 this is line 2
 this is line 3
 this is line 4
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(1, 0, 1, 1));
		});

		test('edit one line at beginning -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -1 +1 @@
-this is line 1
+edited line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(1, 0, 1, 1));
		});

		test('edit one line in middle', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -7,7 +7,7 @@ this is line 6
 this is line 7
 this is line 8
 this is line 9
-this is line 10
+edited line
 this is line 11
 this is line 12
 this is line 13
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(10, 0, 10, 1));
		});

		test('edit one line in middle -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
@@ -10 +10 @@ this is line 9
-this is line 10
+edited line
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(10, 0, 10, 1));
		});

		test('edit one line in multiple hunks', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(2, 0, 2, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(10, 0, 10, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(17, 0, 17, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), new ZeroIndexedRange(19, 0, 19, 1));
		});

		test('edit one line in multiple hunks -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(2, 0, 2, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(10, 0, 10, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), new ZeroIndexedRange(19, 0, 19, 1));
		});

		test('edit two lines in multiple hunks', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(2, 0, 2, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(11, 0, 11, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(17, 0, 17, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(20, 0, 20, 1));
		});

		test('edit two lines in multiple hunks -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(2, 0, 2, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(8, 0, 8, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(11, 0, 11, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(17, 0, 17, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(20, 0, 20, 1));
		});

		test('net add lines in multiple hunks', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(2, 0, 2, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(9, 0, 9, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(12, 0, 12, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), new ZeroIndexedRange(20, 0, 20, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(23, 0, 23, 1));
		});

		test('net add lines in multiple hunks -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), new ZeroIndexedRange(2, 0, 2, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(9, 0, 9, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), new ZeroIndexedRange(12, 0, 12, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), new ZeroIndexedRange(20, 0, 20, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(23, 0, 23, 1));
		});

		test('net delete lines in multiple hunks', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
`);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(1, 0, 1, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(7, 0, 7, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(9, 0, 9, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(15, 0, 15, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(17, 0, 17, 1));
		});

		test('net delete lines in multiple hunks -U0', () => {
			const diff = new Diff(`diff --git a/comments.txt b/comments.txt
index 63ef680..47010db 100644
--- a/comments.txt
+++ b/comments.txt
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
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(0, 0, 0, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(1, 0, 1, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(2, 0, 2, 1)), new ZeroIndexedRange(1, 0, 1, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(8, 0, 8, 1)), new ZeroIndexedRange(7, 0, 7, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(9, 0, 9, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(10, 0, 10, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(11, 0, 11, 1)), new ZeroIndexedRange(9, 0, 9, 1));

			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(17, 0, 17, 1)), new ZeroIndexedRange(15, 0, 15, 1));
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(18, 0, 18, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(19, 0, 19, 1)), undefined);
			assert.deepEqual(diff.transformRange(new ZeroIndexedRange(20, 0, 20, 1)), new ZeroIndexedRange(17, 0, 17, 1));
		});
	});
});
