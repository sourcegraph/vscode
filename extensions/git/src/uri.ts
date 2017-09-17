/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri } from 'vscode';

export function fromGitUri(uri: Uri): { path: string; ref: string; } {
	return JSON.parse(uri.query);
}

// As a mitigation for extensions like ESLint showing warnings and errors
// for git URIs, let's change the file extension of these uris to .git,
// when `replaceFileExtension` is true.
export function toGitUri(uri: Uri, ref: string, replaceFileExtension = false): Uri {
	return uri.with({
		scheme: 'git',
		path: replaceFileExtension ? `${uri.path}.git` : uri.path,
		query: JSON.stringify({
			path: uri.fsPath,
			ref
		})
	});
}

/**
 * Canonicalize git like URIs. If two different git URIs point to the same
 * resource, but using a different protocol they should canonicalize to the
 * same string.
 */
export function canonicalRemote(remote: string): string | undefined {
	let uri: Uri;
	try {
		uri = parseGitURL(remote);
	} catch (e) {
		return undefined;
	}

	let authority = uri.authority;
	const idx = authority.indexOf('@');
	if (idx !== -1) {
		authority = authority.slice(idx + 1);
	}

	const canonical = authority.toLowerCase() + uri.path.replace(/\.(git|hg|svn)$/i, '').toLowerCase();
	return canonical ? canonical : undefined;
}

/**
 * Parses the URLs that git can return.
 *
 * Git doesn't always return well-formed URLs. For example it is common for
 * git to return SCP strings instead of ssh URLs.
 */
function parseGitURL(gitURL: string): Uri {
	gitURL = decodeURIComponent(gitURL);
	// Parse ssh procotol (e.g. user@company.com:foo/bar)
	const sshMatch = gitURL.match(/^([^/@:]+@)?([^:/]+):([^/].*)$/);
	if (sshMatch) {
		gitURL = 'ssh://' + (sshMatch[1] || '') + sshMatch[2] + '/' + sshMatch[3];
	}
	const uri = Uri.parse(gitURL);
	return uri.with({ scheme: 'git+' + uri.scheme });
}

// embedded extension tests in vscode currently don't have access to the vscode module.
// As such the test below can't be run as a normal mocha test. So for now we have this
// hacky solution of just uncommenting this code. - keegan
/*
function check(url: string, expected: string): void {
	const actual = canonicalRemote(url);
	if (actual !== expected) {
		console.error('canonicalRemote failed on ' + url, actual, expected);
	}
};

check(
	'https://github.com/foo/bar.git',
	'github.com/foo/bar',
);
check(
	'git+ssh://git@github.com/foo/bar.git',
	'github.com/foo/bar',
);
check(
	'git+ssh://github.com/foo/bar.git',
	'github.com/foo/bar',
);
check(
	'github.com:foo/bar.git',
	'github.com/foo/bar',
);
check(
	'git@github.com:foo/bar.git',
	'github.com/foo/bar',
);
check(
	'git%40github.com:foo/bar.git',
	'github.com/foo/bar',
);
check(
	'giTHub.com/foo/bAr',
	'github.com/foo/bar',
);
console.log('git extension test done');
*/