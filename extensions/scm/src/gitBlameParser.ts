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

	const lines = raw.split('\n');
	for (const line of lines) {
		const lineParts = line.split(' ');
		if (lineParts.length < 2) {
			continue;
		}

		if (!entry) {
			const sha = lineParts[0];
			entry = {
				originalLine: parseInt(lineParts[1], 10) - 1,
				line: parseInt(lineParts[2], 10) - 1,
				lineCount: parseInt(lineParts[3], 10),
			} as RawBlameHunk;

			// Associate with previous commit.
			const commitEntry = entries.find(e => e.commit.sha === sha);
			if (commitEntry) {
				entry.commit = commitEntry.commit;
			} else {
				entry.commit = {
					sha,
				} as HunkCommit;
			}

			continue;
		}

		switch (lineParts[0]) {
			case 'author':
				entry.commit.author = lineParts.slice(1).join(' ').trim();
				break;

			case 'author-mail':
				entry.commit.authorMail = lineParts.slice(1).join(' ').trim();
				break;

			case 'author-time':
				entry.commit.authorTime = parseInt(lineParts[1], 10) * 1000;
				break;

			case 'author-tz':
				entry.commit.authorTz = lineParts[1];
				break;

			case 'summary':
				entry.commit.summary = lineParts.slice(1).join(' ').trim();
				break;

			case 'previous':
				entry.commit.previousCommit = lineParts[1];
				entry.commit.previousPath = lineParts.slice(2).join(' ');
				break;

			case 'filename':
				entry.filename = lineParts.slice(1).join(' ');

				entries.push(entry);
				entry = undefined;
				break;

			default:
				break;
		}
	}

	console.log(entries);

	return entries;
}
