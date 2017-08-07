/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as vscode from 'vscode';

export interface GitLog {
	entries: LogEntry[];

	maxCount: number | undefined;
	range: vscode.Range;
	truncated: boolean;
}

export interface LogEntry {
	sha: string;

	author: string;
	authorDate?: string;

	parentShas?: string[];

	fileName?: string;
	originalFileName?: string;
	fileStatuses?: IGitStatusFile[];

	status?: GitStatusFileStatus;

	summary?: string;
}

export type GitCommitType = 'blame' | 'branch' | 'file' | 'stash';

export declare type GitStatusFileStatus = '!' | '?' | 'A' | 'C' | 'D' | 'M' | 'R' | 'U';

export interface IGitStatusFile {
	status: GitStatusFileStatus;
	fileName: string;
	originalFileName?: string;
}

const diffRegex = /diff --git a\/(.*) b\/(.*)/;

export function parse(data: string, type: GitCommitType, maxCount: number | undefined, reverse: boolean, range: vscode.Range | undefined): GitLog {
	const entries: LogEntry[] = [];
	let entry: LogEntry | undefined = undefined;

	let i = -1;
	let skip = false;

	const lines = data.split('\n')[Symbol.iterator]();
	let line: string;
	while (true) {
		if (skip) {
			skip = false;
		} else {
			const next = lines.next();
			if (next.done) {
				break;
			}

			line = next.value;
			i++;
		}

		// Since log --reverse doesn't properly honor a max count, enforce it here.
		if (reverse && maxCount && (i >= maxCount)) {
			break;
		}

		const lineParts = line!.split(' ');
		if (lineParts.length < 2) {
			continue;
		}

		if (entry === undefined) {
			if (!isGitSHA(lineParts[0])) {
				continue;
			}

			entry = { sha: lineParts[0] } as LogEntry;

			continue;
		}

		switch (lineParts[0]) {
			case 'author':
				entry.author = lineParts.slice(1).join(' ').trim();
				break;

			case 'author-date':
				entry.authorDate = `${lineParts[1]}T${lineParts[2]}${lineParts[3]}`;
				break;

			case 'parents':
				entry.parentShas = lineParts.slice(1);
				break;

			case 'summary':
				entry.summary = lineParts.slice(1).join(' ').trim();
				while (true) {
					const next = lines.next();
					if (next.done) {
						break;
					}

					i++;
					line = next.value;
					if (!line) {
						break;
					}

					if (line === 'filename ?') {
						skip = true;
						break;
					}

					entry.summary += `\n${line}`;
				}
				break;

			case 'filename':
				if (type === 'branch') {
					const next = lines.next();
					if (next.done) {
						break;
					}

					i++;
					line = next.value;

					// If the next line isn't blank, make sure it isn't starting a new commit
					if (line && isGitSHA(line)) {
						skip = true;
						continue;
					}

					let diff = false;
					while (true) {
						const next = lines.next();
						if (next.done) {
							break;
						}

						i++;
						line = next.value;
						const lineParts = line.split(' ');

						if (isGitSHA(lineParts[0])) {
							skip = true;
							break;
						}

						if (diff) {
							continue;
						}

						if (lineParts[0] === 'diff') {
							diff = true;
							const matches = diffRegex.exec(line);
							if (matches !== null) {
								entry.fileName = matches[1];
								const originalFileName = matches[2];
								if (entry.fileName !== originalFileName) {
									entry.originalFileName = originalFileName;
								}
							}
							continue;
						}

						if (!entry.fileStatuses) {
							entry.fileStatuses = [];
						}

						const status = {
							status: line[0] as GitStatusFileStatus,
							fileName: line.substring(1),
							originalFileName: undefined
						} as IGitStatusFile;
						_parseFileName(status);

						entry.fileStatuses.push(status);
					}

					if (entry.fileStatuses) {
						entry.fileName = entry.fileStatuses.filter(_ => !!_.fileName).map(_ => _.fileName).join(', ');
					}
				} else {
					let next = lines.next();
					next = lines.next();

					i += 2;
					line = next.value;

					entry.status = line[0] as GitStatusFileStatus;
					entry.fileName = line.substring(1);
					_parseFileName(entry);
				}

				entries.push(entry);
				entry = undefined;
				break;
		}
	}

	return {
		entries,
		maxCount,
		range,
		truncated: !!(maxCount && i >= maxCount)
	} as GitLog;
}

function _parseFileName(entry: { fileName?: string, originalFileName?: string }): void {
	if (entry.fileName === undefined) {
		return;
	}

	const index = entry.fileName.indexOf('\t') + 1;
	if (index > 0) {
		const next = entry.fileName.indexOf('\t', index) + 1;
		if (next > 0) {
			entry.originalFileName = entry.fileName.substring(index, next - 1);
			entry.fileName = entry.fileName.substring(next);
		}
		else {
			entry.fileName = entry.fileName.substring(index);
		}
	}
}

function isGitSHA(s: string): boolean {
	return /^[0-9a-f]{40}( -)?$/.test(s);
}