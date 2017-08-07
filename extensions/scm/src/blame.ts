/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { BlameHunk } from './repository';
import * as date from 'date-fns';

export function formatBlameDecorationHoverMessage(hunk: BlameHunk): vscode.MarkedString {
	// The `[](scm)` is used as a comment for
	// modesContentHover.ts/sourcegraphHoverWidget.ts to not render Go to
	// Definition/etc. buttons on SCM-only hovers. The vscode Markdown library does not
	// support <!-- --> comments.
	return `[](scm)\`${hunk.commit.sha.slice(0, 7)}\` ${hunk.commit.summary}

— ${hunk.commit.author} ${hunk.commit.authorMail || ''} on ${date.format(hunk.commit.authorTime, 'MMM D, YYYY, h:mm A')}`;
}