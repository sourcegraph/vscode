/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { parseGitURL } from 'vs/workbench/services/workspace/node/workspaceSharingService';

suite('Workbench - WorkspaceSharingService', () => {

	test('parseGitURL', function () {
		const check = (gitURL: string, expected: string | null) => {
			const actual = parseGitURL(gitURL);
			assert.equal(actual ? actual.toString() : null, expected, 'parseGitURL failed on ' + gitURL);
		};
		check(
			'https://github.com/foo/bar.git',
			'git+https://github.com/foo/bar.git',
		);
		check(
			'github.com:foo/bar.git',
			'git+ssh://github.com/foo/bar.git',
		);
		check(
			'git@github.com:foo/bar.git',
			'git+ssh://git%40github.com/foo/bar.git',
		);
		check(
			'git%40github.com:foo/bar.git',
			'git+ssh://git%40github.com/foo/bar.git',
		);
	});

});
