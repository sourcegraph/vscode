/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';

export function readFile(filename: string, encoding: string): Promise<string> {
	return new Promise<string>((resolve, reject) => fs.readFile(filename, encoding, (err, data) => err ? reject(err) : resolve(data)));
}
