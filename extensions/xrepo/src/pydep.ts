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

/**
 * SetupPy represents a setup.py configuration as read by the pydep-run.py command.
 */
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

let pydep: Promise<string> | null = null;

function getPyDep(): Promise<string> {
	if (pydep) {
		return pydep;
	}

	const p = ensurePyDep();
	pydep = p;
	p.then(undefined, () => {
		if (pydep === p) {
			pydep = null;
		}
	});
	return p;
}

async function ensurePyDep(): Promise<string> {
	await execFile(await getPython(), ['-m', 'pip', 'install', 'git+git://github.com/sourcegraph/pydep']);
	return path.join(pythonEnvDir, 'bin', 'pydep-run.py');
}

let pythonInterpreter: Promise<string> | null = null;

function getPython(): Promise<string> {
	if (pythonInterpreter) {
		return pythonInterpreter;
	}

	const p = ensurePython();
	pythonInterpreter = p;
	p.then(undefined, () => {
		if (pythonInterpreter === p) {
			pythonInterpreter = null;
		}
	});
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