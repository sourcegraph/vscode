/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { globToString } from 'vs/workbench/services/search/node/remoteSearchService';

suite('RemoteSearchService', () => {
	test('globToString', () => {
		assert.deepEqual(
			globToString({ 'a/**/b': true, 'c/*.txt': true }),
			'{a/**/b,c/*.txt}',
		);
	});

	test('globToString - handle leading slash', () => {
		assert.deepEqual(
			globToString({ '**/foo': true }),
			'{foo,**/foo}',
		);
	});
});
