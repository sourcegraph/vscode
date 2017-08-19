/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { parse as parseGitBlame, RawBlameHunk } from './gitBlameParser';
import { parse as parseGitLog } from './gitLogParser';
import { Repository, Commit, BlameHunk } from './repository';
import { OperationManager } from './operationManager';
import { loggingCommandExecutor } from './commandExecutor';

/**
 * A Git SCM repository.
 */
export class GitRepository implements Repository {
	public readonly root: vscode.Uri;

	private manager = new OperationManager();
	private commandExecutor: vscode.CommandExecutor;

	constructor(
		public readonly sourceControl: vscode.SourceControl,
	) {
		const root = sourceControl.rootFolder;
		if (!root) {
			throw new Error(`source control ${sourceControl.id} has no root`);
		}
		this.root = root;

		const commandExecutor = sourceControl.commandExecutor;
		if (!commandExecutor) {
			throw new Error(`source control ${sourceControl.id} has no command executor`);
		}
		this.commandExecutor = loggingCommandExecutor(this.root.toString(), commandExecutor);
	}

	public resolveCommit(revision: string, token?: vscode.CancellationToken): Thenable<Commit | undefined> {
		const key = JSON.stringify(['resolveCommit', revision]);
		return this.manager.performOperation<Commit>(key, () => {
			return this.commandExecutor.executeCommand([
				'log', '-n1', '--raw',
				'--name-status', '--full-history',
				'-M', '--no-merges',
				'--format=%H -%nauthor %an%nauthor-date %at%nparents %P%nsummary %B%nfilename ?',
				revision,
			]).then(raw => {
				const log = parseGitLog(raw, 'file', undefined, false, undefined);
				if (!log || !log.entries || !log.entries[0]) {
					throw new Error(`error resolving commit: ${revision}`);
				}
				const entry = log.entries[0];
				return {
					id: entry.sha,
					author: {
						name: entry.author,
						timestamp: Date.now(),
					},
					message: entry.summary!,
					parents: entry.parentShas!,
				};
			});
		});
	}

	public blame(revision: string | undefined, path: string, range?: vscode.Range, token?: vscode.CancellationToken): Thenable<BlameHunk[]> {
		let cacheKey: string;
		let runCommand: () => Thenable<string>;
		if (revision) {
			// For immutable documents, we blame the whole file instead of using the `git
			// blame -L123,456` flag to blame only a specific range because (1) it's
			// faster if we compute it for the whole file in one operation because we
			// usually need results for other lines and (2) our Git command whitelist
			// doesn't easily support whitelisting -L because it has no long form with
			// '='.
			cacheKey = JSON.stringify(['blame', revision, path]);
			runCommand = () => this.commandExecutor.executeCommand(['blame', '--root', '--incremental', revision, '--', path]);
		} else {
			// For mutable documents, we only blame the lines in the given range, because
			// we're unlikely to be able to cache blame data of the whole file for very
			// long (it would be invalidated upon the next edit).
			cacheKey = JSON.stringify(['blame', path, Math.random()]);
			const args = ['blame', '--root', '--incremental'];
			if (range) {
				args.push('-L', `${range.start.line + 1},${range.end.line + 1}`);
			}
			runCommand = () => this.commandExecutor.executeCommand(args.concat('--', path));
		}

		const fileHunks = this.manager.performOperation<RawBlameHunk[]>(cacheKey, () => {
			return runCommand().then(raw => {
				if (token && token.isCancellationRequested) {
					return [];
				}

				return parseGitBlame(raw);
			});
		}, token);

		// TODO(sqs): can speed this up by filtering before we transform RawBlameHunk ->
		// BlameHunk.
		return fileHunks.then(fileHunks => {
			if (!fileHunks || (token && token.isCancellationRequested)) {
				return [];
			}

			return fileHunks.map(hunk => ({
				...hunk,
				range: new vscode.Range(
					hunk.line,
					0,
					hunk.line + hunk.lineCount - 1,
					Number.MAX_SAFE_INTEGER, // means "end of line" without needing to know line length
				),
			}))
				.filter(hunk => {
					if (range) {
						// Filter to only hunks that overlap the range.
						return !!hunk.range.intersection(range);
					}
					return true;
				});
		});
	}

	public dispose(): void {

	}
}
