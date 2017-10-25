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
import { StringDecoder } from 'string_decoder';
import { EventEmitter } from 'events';
import { Memento } from 'vscode';
import { uniqBy } from './util';

/**
 * Maintains an index from git remotes to repositories on disk.
 * The main use of this class is to allow the 'repo' quick open to use a users existing clones,
 * rather than clone a fresh copy.
 */
export class GlobalRepositories {
	private static MEMENTO_KEY = 'git.globalrepositories.map.v2';

	private operation = 0;
	private walker: FolderWalker | null;

	/**
	 * canonical remote -> paths.
	 * eg 'github.com/gorilla/mux' -> ['/home/user/mux', '/home/user/src/mux']
	 */
	private currentEntries = new Map<string, string[]>();
	private newEntries = new Map<string, string[]>();

	private _onOutput = new EventEmitter();
	get onOutput(): EventEmitter { return this._onOutput; }

	constructor(
		private git: Git,
		private globalState: Memento,
	) {
		const mapEntries = globalState.get<[string, string[]][]>(GlobalRepositories.MEMENTO_KEY);
		if (mapEntries) {
			this.currentEntries = new Map<string, string[]>(mapEntries);
		}
	}

	/**
	 * Returns a list of paths to repositories which have remote as a git remote.
	 * @param remote A git remote (eg https://github.com/gorilla/mux.git) to look up.
	 */
	public resolveRemotes(remote: string): string[] {
		const key = canonicalRemote(remote);
		if (!key) {
			return [];
		}
		const entries = (this.newEntries.get(key) || []).concat(this.currentEntries.get(key) || []);
		entries.sort((a, b) => {
			// We prefer shorter strings
			if (a.length !== b.length) {
				return a.length - b.length;
			}
			if (a === b) {
				return 0;
			}
			return a < b ? -1 : 1;
		});
		return uniqBy(entries, v => v);
	}

	/**
	 * scan searches recursively dir for all git repositories and indexes them by the git remotes.
	 * @param dir The root directory to scan from
	 */
	public scan(dir: string): Promise<void> {
		if (!FolderWalker.available()) {
			return Promise.resolve();
		}

		this.cancel();
		const operation = ++this.operation;

		const walker = new FolderWalker();
		this.walker = walker;

		return new Promise<void>((resolve, reject) => {
			this.log('Starting home directory scan');
			const map = new Map<string, string[]>();
			this.newEntries = map;
			const remotePromises: Promise<void>[] = [];
			walker.search(dir, path => {
				remotePromises.push(this.git.exec(path, ['remote', '--verbose'], { log: false }).then(result => {
					for (const key of extractCanonicalRemotes(result.stdout)) {
						const paths = map.get(key);
						if (!paths) {
							map.set(key, [path]);
						} else {
							paths.push(path);
						}
					}
				}, () => { }));
			}, err => {
				this.walker = null;
				if (err) {
					this.log('Home directory scan failed: ' + err.message);
					reject(err);
					return;
				}

				resolve(Promise.all(remotePromises).then(() => {
					const canceled = operation !== this.operation;
					if (canceled) {
						return;
					}

					const count = map.size - this.currentEntries.size;
					this.log(`Home directory scan found ${count} new remotes (total ${map.size})`);
					this.currentEntries = map;
					this.newEntries = new Map<string, string[]>();

					return this.globalState.update(GlobalRepositories.MEMENTO_KEY, [...map]);
				}));
			});
		});
	}

	private cancel(): void {
		this.operation++;
		if (this.walker) {
			this.walker.cancel();
		}
	}

	private log(msg: string): void {
		this._onOutput.emit('log', msg + '\n');
	}

	public dispose(): void {
		this.cancel();
	}
}

/**
 * Recursively finds git directories
 */
export class FolderWalker {

	private isCanceled = false;
	private proc: cp.ChildProcess;

	public search(dir: string, onCandidatePath: (path: string) => void, done: (error?: Error) => void): void {
		const proc = this.spawnFindCmd(dir);
		this.proc = proc;

		const processLines = (data: string) => {
			for (const gitDir of data.split(os.EOL)) {
				const candidate = path.dirname(gitDir);
				if (candidate.length > 0) {
					onCandidatePath(candidate);
				}
			}
		};

		const decoder = new StringDecoder('utf8');
		let linebuf = '';
		proc.stdout.on('data', (b: Buffer) => {
			const data = linebuf + decoder.write(b);
			const idx = data.lastIndexOf(os.EOL);
			if (idx < 0) {
				// we haven't seen EOL, so just keep building up linebuf
				linebuf = data;
				return;
			}
			linebuf = data.substr(idx + os.EOL.length);
			processLines(data.substr(0, idx));
		});

		proc.on('error', (err: Error) => {
			if (this.isCanceled) {
				done();
			}

			done(err);
		});

		proc.on('close', (code: number) => {
			if (this.isCanceled) {
				done();
			}

			if (code !== 0) {
				done(new Error(`find failed with error code ${code}`));
				return;
			}

			linebuf = linebuf + decoder.end();
			processLines(linebuf);
			done();
		});
	}

	public cancel() {
		this.isCanceled = true;
		this.proc.kill();
	}

	private spawnFindCmd(rootPath: string): cp.ChildProcess {
		// find $HOME -maxdepth 10 -type d -name .git -print -o \( -name '.*' -o -name 'node_modules' \) -prune
		const args = [rootPath].concat('-maxdepth 10 -type d -name .git -print'.split(' '));

		const ignore = ['.*', 'node_modules'];
		args.push('-o', '(');
		for (const name of ignore) {
			args.push('-name', name, '-o');
		}
		args.pop(); // Remove last -o
		args.push(')', '-prune');

		return cp.spawn('find', args, {
			cwd: rootPath,
			stdio: ['ignore', 'pipe', 'ignore'], // only care about stdout
		});
	}

	public static available(): boolean {
		return process.platform !== 'win32'; // we do not have find on windows
	}
}

/**
 * Finds and canonicalizes all remotes in the output of 'git remote'.
 */
function extractCanonicalRemotes(stdout: string): string[] {
	const regex = /^[^\s]+\s+([^\s]+)\s/;
	return stdout.trim().split(os.EOL)
		.filter(b => !!b)
		.map(line => regex.exec(line))
		.filter(g => !!g)
		.map((groups: RegExpExecArray) => {
			const r = canonicalRemote(groups[1]);
			return r || '';
		})
		.filter(s => s.length > 0);
}