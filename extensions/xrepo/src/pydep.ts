/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { execFile, pathExists } from './nodeutil';
import * as path from 'path';
import * as os from 'os';

const toolsDir = path.join(os.homedir(), '.sourcegraph', 'tools');
const pythonEnvDir = path.join(toolsDir, 'pythonEnv');

export interface SetupPy {
	scripts: string[] | null;
	repo_url: string | null;
	py_modules: string[] | null;
	project_name?: string;
	name?: string;
	description: string | null;
	rootdir: string;
	version: string | null;
	packages?: string[];
	author: string | null;
}

export async function pyDepList(dir: string): Promise<SetupPy[]> {
	let out: string;
	const pydep = await getPyDep();
	[out] = await execFile(pydep, ['list', dir]);
	try {
		return JSON.parse(out!) as SetupPy[];
	} catch {
		return [];
	}
}

let pydep_: Promise<string> | null = null;

async function getPyDep(): Promise<string> {
	if (pydep_) {
		return pydep_;
	}
	const p = await ensurePyDep();
	pydep_ = Promise.resolve(p);
	return p;
}

async function ensurePyDep(): Promise<string> {
	await execFile(await getPython(), ['-m', 'pip', 'install', 'git+git://github.com/sourcegraph/pydep']);
	return path.join(pythonEnvDir, 'bin', 'pydep-run.py');
}

let python_: Promise<string> | null = null;

async function getPython(): Promise<string> {
	if (python_) {
		return python_;
	}
	const p = await ensurePython();
	python_ = Promise.resolve(p);
	return p;
}

/**
 * ensurePython should be called once to get (and initialize if necessary) the Python CLI
 * used to run pydep.
 */
async function ensurePython(): Promise<string> {
	const pythonPath = path.join(pythonEnvDir, 'bin', 'python');
	if (!await pathExists(pythonPath)) {
		await execFile('virtualenv', [pythonEnvDir]);
	}
	return pythonPath;
}

getPyDep();