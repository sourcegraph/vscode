/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import assert = require('assert');
import * as vscode from 'vscode';
import { toFileStat } from './fileStat';

suite('fileStat', () => {
	test('toFileStat with no parentPath', () => {
		const files = [
			'a1',
			'd1/a2',
			'd1/d2/f3',
			'd1/f4',
			'd2/f5',
			'f6',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, {})!;

		assert.ok(root);
		assert.equal(root.resource.toString(), 'repo://example.com/foo/bar');
		assert.equal(root.name, 'bar');
		assert.equal(root.isDirectory, true);
		assert.equal(root.hasChildren, true);

		assert.ok(root.children);
		assert.deepEqual(root.children!.map(c => c.name), ['a1', 'd1', 'd2', 'f6']);
		const [a1, d1, d2, f6] = root.children!;

		assert.equal(a1.resource.toString(), 'repo://example.com/foo/bar/a1');
		assert.equal(a1.isDirectory, false);

		assert.equal(d1.resource.toString(), 'repo://example.com/foo/bar/d1');
		assert.equal(d1.isDirectory, true);
		assert.equal(d1.hasChildren, true);
		assert.equal(d1.children, undefined); // lazily loaded

		assert.equal(d2.resource.toString(), 'repo://example.com/foo/bar/d2');
		assert.equal(d2.isDirectory, true);
		assert.equal(d2.hasChildren, true);
		assert.equal(d2.children, undefined); // lazily loaded

		assert.equal(f6.resource.toString(), 'repo://example.com/foo/bar/f6');
		assert.equal(f6.isDirectory, false);
	});

	test('toFileStat with parentPath', () => {
		const files = [
			'a1',
			'd1/a2',
			'd1/d2/f3',
			'd1/f4',
			'd2/f5',
			'f6',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { parentPath: 'd1' })!;

		assert.ok(root);
		assert.equal(root.resource.toString(), 'repo://example.com/foo/bar/d1');
		assert.equal(root.name, 'd1');
		assert.equal(root.isDirectory, true);
		assert.equal(root.hasChildren, true);

		assert.ok(root.children);
		assert.deepEqual(root.children!.map(c => c.name), ['a2', 'd2', 'f4']);
		const [a2, d2, f4] = root.children!;

		assert.equal(a2.resource.toString(), 'repo://example.com/foo/bar/d1/a2');
		assert.equal(a2.isDirectory, false);

		assert.equal(d2.resource.toString(), 'repo://example.com/foo/bar/d1/d2');
		assert.equal(d2.isDirectory, true);
		assert.equal(d2.hasChildren, true);
		assert.equal(d2.children, undefined); // lazily loaded

		assert.equal(f4.resource.toString(), 'repo://example.com/foo/bar/d1/f4');
		assert.equal(f4.isDirectory, false);
	});

	test('toFileStat with parentPath file (not dir)', () => {
		const files = ['a1'];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { parentPath: 'a1' })!;

		assert.ok(root);
		assert.equal(root.resource.toString(), 'repo://example.com/foo/bar/a1');
		assert.equal(root.name, 'a1');
		assert.equal(root.isDirectory, false);
		assert.equal(root.hasChildren, false);
	});

	test('toFileStat with parentPath of nested file (not dir)', () => {
		const files = [
			'd1/a1',
			'd2/a3',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { parentPath: 'd2/a3' })!;

		assert.ok(root);
		assert.equal(root.resource.toString(), 'repo://example.com/foo/bar/d2/a3');
		assert.equal(root.name, 'a3');
		assert.equal(root.isDirectory, false);
		assert.equal(root.hasChildren, false);
	});

	test('toFileStat with 2-level-deep parentPath', () => {
		const files = [
			'a1',
			'd1/a2',
			'd1/d2/f3',
			'd1/f4',
			'd2/f5',
			'f6',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { parentPath: 'd1/d2' })!;

		assert.ok(root);
		assert.equal(root.resource.toString(), 'repo://example.com/foo/bar/d1/d2');
		assert.equal(root.name, 'd2');
		assert.equal(root.isDirectory, true);
		assert.equal(root.hasChildren, true);

		assert.ok(root.children);
		assert.deepEqual(root.children!.map(c => c.name), ['f3']);

		const f3 = root.children![0];
		assert.equal(f3.resource.toString(), 'repo://example.com/foo/bar/d1/d2/f3');
		assert.equal(f3.isDirectory, false);
	});

	test('toFileStat path prefix bug', () => {
		const files = [
			'd1/f1',
			'd11/f11',
			'd2/f2',
		];

		const d1 = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { parentPath: 'd1' })!;
		assert.ok(d1);
		assert.equal(d1.resource.toString(), 'repo://example.com/foo/bar/d1');
		assert.equal(d1.name, 'd1');
		assert.equal(d1.isDirectory, true);
		assert.equal(d1.hasChildren, true);
		assert.ok(d1.children);
		assert.deepEqual(d1.children!.map(c => c.name), ['f1']);

		const d11 = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { parentPath: 'd11' })!;
		assert.ok(d11);
		assert.equal(d11.resource.toString(), 'repo://example.com/foo/bar/d11');
		assert.equal(d11.name, 'd11');
		assert.equal(d11.isDirectory, true);
		assert.equal(d11.hasChildren, true);
		assert.ok(d11.children);
		assert.deepEqual(d11.children!.map(c => c.name), ['f11']);

		const d2 = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { parentPath: 'd2' })!;
		assert.ok(d2);
		assert.equal(d2.resource.toString(), 'repo://example.com/foo/bar/d2');
		assert.equal(d2.name, 'd2');
		assert.equal(d2.isDirectory, true);
		assert.equal(d2.hasChildren, true);
		assert.ok(d2.children);
		assert.deepEqual(d2.children!.map(c => c.name), ['f2']);
	});

	test('toFileStat for nonexistent subdirectory', () => {
		const files = [
			'f1',
			'd1/f2',
		];
		assert.equal(toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { parentPath: 'd2' }), null);
	});

	test('toFileStat for nonexistent file', () => {
		const files = [
			'f1',
		];
		assert.equal(toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { parentPath: 'f2' }), null);
	});

	test('toFileStat with resolveTo', () => {
		const files = [
			'd1/d2/f2',
			'd1/d2/f3',
			'd4/d5/f6',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, {
			resolveTo: ['d1/d2/f3'],
		})!;
		assert.deepEqual(root.children!.map(c => c.name), ['d1', 'd4']);
		const f3 = root.children![0].children![0].children![1];
		assert.equal(f3.resource.toString(), 'repo://example.com/foo/bar/d1/d2/f3');
		assert.equal(f3.name, 'f3');
		assert.equal(f3.isDirectory, false);
		assert.equal(root.children![1].children, undefined); // not yet resolved because not in resolveTo
	});

	test('toFileStat with resolveTo dir', () => {
		const files = [
			'd1/d2/f2',
			'd1/d2/f3',
			'd1/d4/f5',
			'd6/f7',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, {
			resolveTo: ['d1'],
		})!;
		assert.deepEqual(root.children!.map(c => c.name), ['d1', 'd6']);
		const d1 = root.children![0];
		assert.deepEqual(d1.children!.map(c => c.name), ['d2', 'd4']);
		assert.equal(d1.resource.toString(), 'repo://example.com/foo/bar/d1');
		assert.equal(d1.name, 'd1');
		assert.equal(d1.isDirectory, true);
		assert.equal(d1.children![0].children, undefined);
		assert.equal(d1.children![1].children, undefined);
	});

	test('toFileStat with resolveTo on nonexistent file does not poison dir', () => {
		const files = [
			'd1/d2/f2',
			'd1/d2/f3',
			'd1/d3/f5',
			'd4/d5/f4',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, {
			resolveTo: ['d1/d2/zz'],
		})!;
		assert.deepEqual(root.children!.map(c => c.name), ['d1', 'd4']);
		assert.deepEqual(root.children![0].children![0].children!.map(c => c.name), ['f2', 'f3']);
		assert.equal(root.children![0].children![1].children, undefined);
		assert.equal(root.children![1].children, undefined);
	});

	test('toFileStat with resolveSingleChildDescendants', () => {
		const files = [
			'd/x/f',
			'd/y/f',
			'd2/z/f',
			'd3/x',
			'd3/y',
			'd4/z/f',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, {
			resolveSingleChildDescendants: true,
		})!;
		assert.equal(root.children!.length, 4);

		assert.equal(root.children![0].children, undefined); // not yet resolved because not single-child
		assert.equal(root.children![2].children, undefined); // not yet resolved because not single-child

		const d2zf = root.children![1].children![0].children![0];
		assert.equal(d2zf.resource.toString(), 'repo://example.com/foo/bar/d2/z/f');
		assert.equal(d2zf.name, 'f');
		assert.equal(d2zf.isDirectory, false);

		const d4zf = root.children![3].children![0].children![0];
		assert.equal(d4zf.resource.toString(), 'repo://example.com/foo/bar/d4/z/f');
		assert.equal(d4zf.name, 'f');
		assert.equal(d4zf.isDirectory, false);
	});

	test('toFileStat with resolveSingleChildDescendants - at end', () => {
		const files = [
			'd/x/f',
			'd/y/f',
			'd2/z/f',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, {
			resolveSingleChildDescendants: true,
		})!;
		assert.equal(root.children!.length, 2);
		assert.equal(root.children![0].children, undefined); // not yet resolved because not single-child
		const d2zf = root.children![1].children![0].children![0];
		assert.equal(d2zf.resource.toString(), 'repo://example.com/foo/bar/d2/z/f');
		assert.equal(d2zf.name, 'f');
		assert.equal(d2zf.isDirectory, false);
	});

	test('toFileStat with resolveAllDescendants', () => {
		const files = [
			'a1',
			'd1/a2',
			'd1/d2/f3',
			'd1/f4',
			'd2/f5',
			'f6',
		];
		const root = toFileStat(vscode.Uri.parse('repo://example.com/foo/bar'), files, { resolveAllDescendants: true })!;

		assert.ok(root);
		assert.equal(root.resource.toString(), 'repo://example.com/foo/bar');
		assert.equal(root.name, 'bar');
		assert.equal(root.isDirectory, true);
		assert.equal(root.hasChildren, true);

		assert.ok(root.children);
		assert.deepEqual(root.children!.map(c => c.name), ['a1', 'a2', 'f3', 'f4', 'f5', 'f6']);
		const [a1, a2, f3, f4, f5, f6] = root.children!;

		assert.equal(a1.resource.toString(), 'repo://example.com/foo/bar/a1');
		assert.equal(a2.resource.toString(), 'repo://example.com/foo/bar/d1/a2');
		assert.equal(f3.resource.toString(), 'repo://example.com/foo/bar/d1/d2/f3');
		assert.equal(f4.resource.toString(), 'repo://example.com/foo/bar/d1/f4');
		assert.equal(f5.resource.toString(), 'repo://example.com/foo/bar/d2/f5');
		assert.equal(f6.resource.toString(), 'repo://example.com/foo/bar/f6');
	});
});
