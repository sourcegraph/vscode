/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as os from 'os';
import * as cp from 'child_process';
import * as path from 'path';
import { canonicalRemote } from './uri';
import { Git } from './git';

export class GlobalRepositories {
	private operation = 0;
	private walker: FolderWalker | null;

	/** canonical remote -> path */
	private map = new Map<string, string>();

	constructor(
		private git: Git,
	) {
	}

	public resolveRemote(remote: string): string | undefined {
		return this.map.get(canonicalRemote(remote));
	}

	public build(): void {
		this.cancel();
		const operation = ++this.operation;

		const walker = new FolderWalker();
		this.walker = walker;

		const map = new Map<string, string>();
		walker.search(path => {
			this.git.exec(path, ['remote', '--verbose']).then(result => {
				for (const key of extractCanonicalRemotes(result.stdout)) {
					map.set(key, path);
				}
			});
		}, err => {
			this.walker = null;
			if (err) {
				console.error(err);
				return;
			}

			// Canceled
			if (operation !== this.operation) {
				return;
			}

			// TODO childProcess.exec may still be running
			this.map = map;
		});
	}

	private cancel(): void {
		this.operation++;
		if (this.walker) {
			this.walker.cancel();
		}
	}

	public dispose(): void {
		this.cancel();
		this.map.clear();
	}
}

export class FolderWalker {

	private isCanceled = false;
	private proc: cp.ChildProcess;

	public search(onCandidatePath: (path: string) => void, done: (error?: Error) => void): void {
		// TODO stream out results
		this.proc = cp.execFile('find', this.buildFindArgs(os.homedir()), (error, stdout, stderr) => {
			if (this.isCanceled) {
				done();
			}
			for (const gitDir of (stdout || '').split(os.EOL)) {
				onCandidatePath(path.dirname(gitDir));
			}
			done(error);
		});
	}

	public cancel() {
		this.isCanceled = true;
		this.proc.kill();
	}

	private buildFindArgs(rootPath: string): string[] {
		// find $HOME -maxdepth 10 -type d -name .git -print -o \( -name '.*' -o -name 'node_modules' \) -prune
		const args = [rootPath].concat('-maxdepth 10 -type d -name .git -print'.split(' '));

		const ignore = ['.*', 'node_modules'];
		args.push('-o', '(');
		for (const name of ignore) {
			args.push('-name', name, '-o');
		}
		args.pop(); // Remove last -o
		args.push(')', '-prune');

		return args;
	}
}

function extractCanonicalRemotes(stdout: string): string[] {
	const regex = /^[^\s]+\s+([^\s]+)\s/;
	return stdout.trim().split(os.EOL)
		.filter(b => !!b)
		.map(line => regex.exec(line))
		.filter(g => !!g)
		.map((groups: RegExpExecArray) => canonicalRemote(groups[1]))
		.filter(s => s.length > 0);
}