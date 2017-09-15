/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import * as cp from 'child_process';

export function readFile(filename: string, encoding: string): Promise<string> {
	return new Promise<string>((resolve, reject) => fs.readFile(filename, encoding, (err, data) => err ? reject(err) : resolve(data)));
}

export function writeFile(filename: string, data: any, encoding: string): Promise<void> {
	return new Promise((resolve, reject) => fs.writeFile(filename, data, 'utf8', err => err ? reject(err) : resolve()));
}

export function pathExists(filename: string): Promise<boolean> {
	return new Promise(resolve => fs.access(filename, fs.constants.F_OK, err => err ? resolve(false) : resolve(true)));
}

export function execFile(file: string, args?: string[], options?: cp.ExecFileOptions): Promise<[string, string]> {
	return new Promise((resolve, reject) => cp.execFile(file, args, options, (err, stdout, stderr) => err ? reject(err) : resolve([stdout, stderr])));
}