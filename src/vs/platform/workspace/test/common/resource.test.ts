/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { extractResourceInfo } from 'vs/platform/workspace/common/resource';
import URI from 'vs/base/common/uri';

suite('extractResourceInfo', () => {
	test('repo scheme', () => {
		assert.deepEqual(
			extractResourceInfo('repo://a/b/c/d/f'),
			{ workspace: URI.parse('repo://a/b/c'), repo: 'a/b/c', relativePath: 'd/f' },
		);
	});

	test('repo+version scheme', () => {
		assert.deepEqual(
			extractResourceInfo('repo+version://a/b/c/d/f'),
			{ workspace: URI.parse('repo+version://a/b/c'), repo: 'a/b/c', relativePath: 'd/f' },
		);
	});

	test('other scheme', () => {
		assert.equal(
			extractResourceInfo('file:///a/b/c/d/f'),
			undefined,
		);
	});

	test('with revision', () => {
		assert.deepEqual(
			extractResourceInfo('repo://a/b/c/d/f?v'),
			{ workspace: URI.parse('repo://a/b/c'), repo: 'a/b/c', revisionSpecifier: 'v', relativePath: 'd/f' },
		);
	});

	test('with URL-encoded path', () => {
		assert.deepEqual(
			extractResourceInfo('repo://a/b/c/d/f%3Ag'),
			{ workspace: URI.parse('repo://a/b/c'), repo: 'a/b/c', relativePath: 'd/f:g' },
		);
	});

	test('with URL-encoded revision', () => {
		assert.deepEqual(
			extractResourceInfo('repo://a/b/c/d/f?v%2Fw'),
			{ workspace: URI.parse('repo://a/b/c'), repo: 'a/b/c', revisionSpecifier: 'v/w', relativePath: 'd/f' },
		);
	});
});