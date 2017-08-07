/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface RawBlameHunk {
	commit: HunkCommit;

	line: number;
	originalLine: number;
	lineCount: number;

	filename?: string;
}

export interface HunkCommit {
	sha: string;
	author: string;
	authorMail?: string;
	authorTime: number;
	authorTz?: string;
	previousCommit?: string;
	previousPath?: string;
	summary?: string;
}

export function parse(raw: string): RawBlameHunk[] {
	const entries: RawBlameHunk[] = [];
	let entry: RawBlameHunk | undefined = undefined;
	let sha: string | undefined = undefined;

	const lines = raw.split('\n');
	for (const line of lines) {
		const lineParts = line.split(' ');
		if (lineParts.length < 2) {
			continue;
		}

		if (!entry) {
			sha = lineParts[0];
			entry = {
				originalLine: parseInt(lineParts[1], 10) - 1,
				line: parseInt(lineParts[2], 10) - 1,
				lineCount: parseInt(lineParts[3], 10),
			} as RawBlameHunk;

			continue;
		}

		switch (lineParts[0]) {
			case 'author':
				if (!entry.commit) { entry.commit = {} as HunkCommit; }
				entry.commit.author = lineParts.slice(1).join(' ').trim();
				break;

			case 'author-mail':
				if (!entry.commit) { entry.commit = {} as HunkCommit; }
				entry.commit.authorMail = lineParts.slice(1).join(' ').trim();
				break;

			case 'author-time':
				if (!entry.commit) { entry.commit = {} as HunkCommit; }
				entry.commit.authorTime = parseInt(lineParts[1], 10) * 1000;
				break;

			case 'author-tz':
				if (!entry.commit) { entry.commit = {} as HunkCommit; }
				entry.commit.authorTz = lineParts[1];
				break;

			case 'summary':
				if (!entry.commit) { entry.commit = {} as HunkCommit; }
				entry.commit.summary = lineParts.slice(1).join(' ').trim();
				break;

			case 'previous':
				if (!entry.commit) { entry.commit = {} as HunkCommit; }
				entry.commit.previousCommit = lineParts[1];
				entry.commit.previousPath = lineParts.slice(2).join(' ');
				break;

			case 'filename':
				entry.filename = lineParts.slice(1).join(' ');

				// Done with this entry.
				if (entry.commit) {
					entry.commit.sha = sha!;
				} else {
					setCommitFieldsFromPreviousHunk(entries, entry, sha!);
				}
				entries.push(entry);
				sha = undefined;
				entry = undefined;
				break;

			default:
				break;
		}
	}

	return entries;
}

/**
 * Sets entry's commit fields (author, committer, summary, previous, etc.) based on the
 * commit information that is present in the first element in entries that is for the same
 * commit. The output of `git blame --incremental` only includes this commit information
 * for the first hunk from that commit.
*/
function setCommitFieldsFromPreviousHunk(entries: RawBlameHunk[], entry: RawBlameHunk, entrySHA: string): void {
	for (const e of entries) {
		if (e.commit.sha === entrySHA) {
			entry.commit = e.commit;
		}
	}
}