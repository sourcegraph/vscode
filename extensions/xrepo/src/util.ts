/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Note: This is copied from ../../extensions/git/src/util.ts

'use strict';

import * as fs from 'fs';
import { dirname, join } from 'path';

export function nfcall<R>(fn: Function, ...args: any[]): Promise<R> {
	return new Promise<R>((c, e) => fn(...args, (err: any, r: any) => err ? e(err) : c(r)));
}

export async function mkdirp(path: string, mode?: number): Promise<boolean> {
	const mkdir = async () => {
		try {
			await nfcall(fs.mkdir, path, mode);
		} catch (err) {
			if (err.code === 'EEXIST') {
				const stat = await nfcall<fs.Stats>(fs.stat, path);

				if (stat.isDirectory) {
					return;
				}

				throw new Error(`'${path}' exists and is not a directory.`);
			}

			throw err;
		}
	};

	// is root?
	if (path === dirname(path)) {
		return true;
	}

	try {
		await mkdir();
	} catch (err) {
		if (err.code !== 'ENOENT') {
			throw err;
		}

		await mkdirp(dirname(path), mode);
		await mkdir();
	}

	return true;
}

export async function walk(root: string, visit: (filepath: string, stats: fs.Stats) => boolean): Promise<void> {
	const stats = await new Promise<fs.Stats>((resolve, reject) => fs.lstat(root, (err, stats) => err ? reject(err) : resolve(stats)));
	const descend = visit(root, stats);
	if (!descend) {
		return;
	}
	if (stats.isSymbolicLink()) {
		return;
	}
	if (!stats.isDirectory()) {
		return;
	}
	const children = await new Promise<string[]>((resolve, reject) => fs.readdir(root, (err, files) => err ? reject(err) : resolve(files)));
	await Promise.all(children.map(c => walk(join(root, c), visit)));
}