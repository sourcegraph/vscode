/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import * as assert from 'assert';
import labels = require('vs/base/common/labels');
import platform = require('vs/base/common/platform');
import { nativeSep } from 'vs/base/common/paths';

class MockWorkspaceFolderProvider {
	constructor(private folders: { uri: URI }[]) { }
	public getWorkspaceFolder(resource: URI): { uri: URI } {
		for (const folder of this.folders) {
			if (resource.fsPath === folder.uri.fsPath || resource.fsPath.indexOf(folder.uri.fsPath + nativeSep) === 0) {
				return folder;
			}
		}
		return null;
	}
	public getWorkspace(): { folders: { uri: URI }[] } {
		return { folders: this.folders };
	}
}

suite('Labels', () => {
	test('path label, multiple roots - not windows', () => {
		if (platform.isWindows) {
			assert.ok(true);
			return;
		}

		const ws = new MockWorkspaceFolderProvider([
			{ uri: URI.file('/home/a/b/c') },
			{ uri: URI.file('/home/x/c') },
			{ uri: URI.file('/home/a/b/d') },
			{ uri: URI.file('/home/x/b/c/d/e/f') },
			{ uri: URI.file('/home/y/b/c/d/e/f') },
			{ uri: URI.file('/nothome/a/b/c') },
		]);
		const home = { userHome: '/home' };
		assert.deepEqual(labels.getPathLabel(URI.file('/home/a/b/c/file'), ws, home), 'home/a/b/c/file');
		assert.deepEqual(labels.getPathLabel(URI.file('/home/x/c/file'), ws, home), 'x/c/file');
		assert.deepEqual(labels.getPathLabel(URI.file('/home/a/b/d/file'), ws, home), 'd/file');
		assert.deepEqual(labels.getPathLabel(URI.file('/home/x/b/c/d/e/f/file'), ws, home), 'x/b/c/d/e/f/file');
		assert.deepEqual(labels.getPathLabel(URI.file('/home/x/b/c/d/e/f/file'), ws, home), 'x/b/c/d/e/f/file');
		assert.deepEqual(labels.getPathLabel(URI.file('/nothome/a/b/c/file'), ws, home), 'nothome/a/b/c/file');
		assert.deepEqual(labels.getPathLabel(URI.file('/home/notinworkspace/file'), ws, home), '~/notinworkspace/file');
	});

	test('path label, multiple roots - windows', () => {
		if (!platform.isWindows) {
			assert.ok(true);
			return;
		}

		const ws = new MockWorkspaceFolderProvider([
			{ uri: URI.file('c:\\home\\a\\b\\c') },
			{ uri: URI.file('c:\\home\\x\\c') },
			{ uri: URI.file('c:\\home\\a\\b\\d') },
			{ uri: URI.file('c:\\home\\x\\b\\c\\d\\e\\f') },
			{ uri: URI.file('c:\\home\\y\\b\\c\\d\\e\\f') },
			{ uri: URI.file('c:\\nothome\\a\\b\\c') },
		]);
		const home = { userHome: 'c:\\home' };
		assert.deepEqual(labels.getPathLabel(URI.file('c:\\home\\a\\b\\c\\file'), ws, home), 'home\\a\\b\\c\\file');
		assert.deepEqual(labels.getPathLabel(URI.file('c:\\home\\x\\c\\file'), ws, home), 'x\\c\\file');
		assert.deepEqual(labels.getPathLabel(URI.file('c:\\home\\a\\b\\d\\file'), ws, home), 'd\\file');
		assert.deepEqual(labels.getPathLabel(URI.file('c:\\home\\x\\b\\c\\d\\e\\f\\file'), ws, home), 'x\\b\\c\\d\\e\\f\\file');
		assert.deepEqual(labels.getPathLabel(URI.file('c:\\home\\x\\b\\c\\d\\e\\f\\file'), ws, home), 'x\\b\\c\\d\\e\\f\\file');
		assert.deepEqual(labels.getPathLabel(URI.file('c:\\nothome\\a\\b\\c\\file'), ws, home), 'nothome\\a\\b\\c\\file');
		assert.deepEqual(labels.getPathLabel(URI.file('c:\\home\\notinworkspace\\file'), ws, home), 'c:\\home\\notinworkspace\\file');
	});

	test('shorten - windows', () => {
		if (!platform.isWindows) {
			assert.ok(true);
			return;
		}

		// nothing to shorten
		assert.deepEqual(labels.shorten(['a']), ['a']);
		assert.deepEqual(labels.shorten(['a', 'b']), ['a', 'b']);
		assert.deepEqual(labels.shorten(['a', 'b', 'c']), ['a', 'b', 'c']);

		// completely different paths
		assert.deepEqual(labels.shorten(['a\\b', 'c\\d', 'e\\f']), ['…\\b', '…\\d', '…\\f']);

		// same beginning
		assert.deepEqual(labels.shorten(['a', 'a\\b']), ['a', '…\\b']);
		assert.deepEqual(labels.shorten(['a\\b', 'a\\b\\c']), ['…\\b', '…\\c']);
		assert.deepEqual(labels.shorten(['a', 'a\\b', 'a\\b\\c']), ['a', '…\\b', '…\\c']);
		assert.deepEqual(labels.shorten(['x:\\a\\b', 'x:\\a\\c']), ['x:\\…\\b', 'x:\\…\\c']);
		assert.deepEqual(labels.shorten(['\\\\a\\b', '\\\\a\\c']), ['\\\\a\\b', '\\\\a\\c']);

		// same ending
		assert.deepEqual(labels.shorten(['a', 'b\\a']), ['a', 'b\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\c', 'd\\b\\c']), ['a\\…', 'd\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\c\\d', 'f\\b\\c\\d']), ['a\\…', 'f\\…']);
		assert.deepEqual(labels.shorten(['d\\e\\a\\b\\c', 'd\\b\\c']), ['…\\a\\…', 'd\\b\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\c\\d', 'a\\f\\b\\c\\d']), ['a\\b\\…', '…\\f\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\a', 'b\\b\\a']), ['a\\b\\…', 'b\\b\\…']);
		assert.deepEqual(labels.shorten(['d\\f\\a\\b\\c', 'h\\d\\b\\c']), ['…\\a\\…', 'h\\…']);
		assert.deepEqual(labels.shorten(['a\\b\\c', 'x:\\0\\a\\b\\c']), ['a\\b\\c', 'x:\\0\\…']);
		assert.deepEqual(labels.shorten(['x:\\a\\b\\c', 'x:\\0\\a\\b\\c']), ['x:\\a\\…', 'x:\\0\\…']);
		assert.deepEqual(labels.shorten(['x:\\a\\b', 'y:\\a\\b']), ['x:\\…', 'y:\\…']);
		assert.deepEqual(labels.shorten(['x:\\a', 'x:\\c']), ['x:\\a', 'x:\\c']);
		assert.deepEqual(labels.shorten(['x:\\a\\b', 'y:\\x\\a\\b']), ['x:\\…', 'y:\\…']);
		assert.deepEqual(labels.shorten(['\\\\x\\b', '\\\\y\\b']), ['\\\\x\\…', '\\\\y\\…']);
		assert.deepEqual(labels.shorten(['\\\\x\\a', '\\\\x\\b']), ['\\\\x\\a', '\\\\x\\b']);

		// same name ending
		assert.deepEqual(labels.shorten(['a\\b', 'a\\c', 'a\\e-b']), ['…\\b', '…\\c', '…\\e-b']);

		// same in the middle
		assert.deepEqual(labels.shorten(['a\\b\\c', 'd\\b\\e']), ['…\\c', '…\\e']);

		// case-sensetive
		assert.deepEqual(labels.shorten(['a\\b\\c', 'd\\b\\C']), ['…\\c', '…\\C']);

		// empty or null
		assert.deepEqual(labels.shorten(['', null]), ['.\\', null]);

		assert.deepEqual(labels.shorten(['a', 'a\\b', 'a\\b\\c', 'd\\b\\c', 'd\\b']), ['a', 'a\\b', 'a\\b\\c', 'd\\b\\c', 'd\\b']);
		assert.deepEqual(labels.shorten(['a', 'a\\b', 'b']), ['a', 'a\\b', 'b']);
		assert.deepEqual(labels.shorten(['', 'a', 'b', 'b\\c', 'a\\c']), ['.\\', 'a', 'b', 'b\\c', 'a\\c']);
		assert.deepEqual(labels.shorten(['src\\vs\\workbench\\parts\\execution\\electron-browser', 'src\\vs\\workbench\\parts\\execution\\electron-browser\\something', 'src\\vs\\workbench\\parts\\terminal\\electron-browser']), ['…\\execution\\electron-browser', '…\\something', '…\\terminal\\…']);
	});

	test('shorten - not windows', () => {
		if (platform.isWindows) {
			assert.ok(true);
			return;
		}

		// nothing to shorten
		assert.deepEqual(labels.shorten(['a']), ['a']);
		assert.deepEqual(labels.shorten(['a', 'b']), ['a', 'b']);
		assert.deepEqual(labels.shorten(['a', 'b', 'c']), ['a', 'b', 'c']);

		// completely different paths
		assert.deepEqual(labels.shorten(['a/b', 'c/d', 'e/f']), ['…/b', '…/d', '…/f']);

		// same beginning
		assert.deepEqual(labels.shorten(['a', 'a/b']), ['a', '…/b']);
		assert.deepEqual(labels.shorten(['a/b', 'a/b/c']), ['…/b', '…/c']);
		assert.deepEqual(labels.shorten(['a', 'a/b', 'a/b/c']), ['a', '…/b', '…/c']);
		assert.deepEqual(labels.shorten(['/a/b', '/a/c']), ['/a/b', '/a/c']);

		// same ending
		assert.deepEqual(labels.shorten(['a', 'b/a']), ['a', 'b/…']);
		assert.deepEqual(labels.shorten(['a/b/c', 'd/b/c']), ['a/…', 'd/…']);
		assert.deepEqual(labels.shorten(['a/b/c/d', 'f/b/c/d']), ['a/…', 'f/…']);
		assert.deepEqual(labels.shorten(['d/e/a/b/c', 'd/b/c']), ['…/a/…', 'd/b/…']);
		assert.deepEqual(labels.shorten(['a/b/c/d', 'a/f/b/c/d']), ['a/b/…', '…/f/…']);
		assert.deepEqual(labels.shorten(['a/b/a', 'b/b/a']), ['a/b/…', 'b/b/…']);
		assert.deepEqual(labels.shorten(['d/f/a/b/c', 'h/d/b/c']), ['…/a/…', 'h/…']);
		assert.deepEqual(labels.shorten(['/x/b', '/y/b']), ['/x/…', '/y/…']);

		// same name ending
		assert.deepEqual(labels.shorten(['a/b', 'a/c', 'a/e-b']), ['…/b', '…/c', '…/e-b']);

		// same in the middle
		assert.deepEqual(labels.shorten(['a/b/c', 'd/b/e']), ['…/c', '…/e']);

		// case-sensitive
		assert.deepEqual(labels.shorten(['a/b/c', 'd/b/C']), ['…/c', '…/C']);

		// empty or null
		assert.deepEqual(labels.shorten(['', null]), ['./', null]);

		assert.deepEqual(labels.shorten(['a', 'a/b', 'a/b/c', 'd/b/c', 'd/b']), ['a', 'a/b', 'a/b/c', 'd/b/c', 'd/b']);
		assert.deepEqual(labels.shorten(['a', 'a/b', 'b']), ['a', 'a/b', 'b']);
		assert.deepEqual(labels.shorten(['', 'a', 'b', 'b/c', 'a/c']), ['./', 'a', 'b', 'b/c', 'a/c']);
	});

	test('template', function () {

		// simple
		assert.strictEqual(labels.template('Foo Bar'), 'Foo Bar');
		assert.strictEqual(labels.template('Foo${}Bar'), 'FooBar');
		assert.strictEqual(labels.template('$FooBar'), '');
		assert.strictEqual(labels.template('}FooBar'), '}FooBar');
		assert.strictEqual(labels.template('Foo ${one} Bar', { one: 'value' }), 'Foo value Bar');
		assert.strictEqual(labels.template('Foo ${one} Bar ${two}', { one: 'value', two: 'other value' }), 'Foo value Bar other value');

		// conditional separator
		assert.strictEqual(labels.template('Foo${separator}Bar'), 'FooBar');
		assert.strictEqual(labels.template('Foo${separator}Bar', { separator: { label: ' - ' } }), 'FooBar');
		assert.strictEqual(labels.template('${separator}Foo${separator}Bar', { value: 'something', separator: { label: ' - ' } }), 'FooBar');
		assert.strictEqual(labels.template('${value} Foo${separator}Bar', { value: 'something', separator: { label: ' - ' } }), 'something FooBar');

		// // real world example (macOS)
		let t = '${activeEditorShort}${separator}${rootName}';
		assert.strictEqual(labels.template(t, { activeEditorShort: '', rootName: '', separator: { label: ' - ' } }), '');
		assert.strictEqual(labels.template(t, { activeEditorShort: '', rootName: 'root', separator: { label: ' - ' } }), 'root');
		assert.strictEqual(labels.template(t, { activeEditorShort: 'markdown.txt', rootName: 'root', separator: { label: ' - ' } }), 'markdown.txt - root');

		// // real world example (other)
		t = '${dirty}${activeEditorShort}${separator}${rootName}${separator}${appName}';
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: '', rootName: '', appName: '', separator: { label: ' - ' } }), '');
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: '', rootName: '', appName: 'Visual Studio Code', separator: { label: ' - ' } }), 'Visual Studio Code');
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: 'Untitled-1', rootName: '', appName: 'Visual Studio Code', separator: { label: ' - ' } }), 'Untitled-1 - Visual Studio Code');
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: '', rootName: 'monaco', appName: 'Visual Studio Code', separator: { label: ' - ' } }), 'monaco - Visual Studio Code');
		assert.strictEqual(labels.template(t, { dirty: '', activeEditorShort: 'somefile.txt', rootName: 'monaco', appName: 'Visual Studio Code', separator: { label: ' - ' } }), 'somefile.txt - monaco - Visual Studio Code');
		assert.strictEqual(labels.template(t, { dirty: '* ', activeEditorShort: 'somefile.txt', rootName: 'monaco', appName: 'Visual Studio Code', separator: { label: ' - ' } }), '* somefile.txt - monaco - Visual Studio Code');
	});
});