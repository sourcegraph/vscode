/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { findContainingFolder } from 'vs/platform/folder/common/folderContainment';

function findContainingFolderString(resource: string): string | undefined {
	const folder = findContainingFolder(URI.parse(resource));
	return folder ? folder.toString() : undefined;
}

suite('findContainingFolder', () => {
	test('repo scheme', () => {
		assert.deepEqual(
			findContainingFolderString('repo://a/b/c/d/f'),
			'repo://a/b/c',
		);
	});

	test('repo+version scheme', () => {
		assert.deepEqual(
			findContainingFolderString('repo+version://a/b/c/d/f'),
			'repo+version://a/b/c',
		);
	});

	test('other scheme', () => {
		assert.equal(
			findContainingFolderString('file:///a/b/c/d/f'),
			undefined,
		);
	});

	test('with revision', () => {
		assert.deepEqual(
			findContainingFolderString('repo+version://a/b/c/d/f?v'),
			'repo+version://a/b/c?v',
		);
	});

	test('with URL-encoded path', () => {
		assert.deepEqual(
			findContainingFolderString('repo://a/b/c/d/f%3Ag'),
			'repo://a/b/c',
		);
	});

	test('with URL-encoded revision', () => {
		assert.deepEqual(
			findContainingFolderString('repo+version://a/b/c/d/f?v%2Fw'),
			'repo+version://a/b/c?v%2Fw',
		);
	});
});