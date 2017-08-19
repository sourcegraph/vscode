/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { RawBlameHunk } from './gitBlameParser';

/**
 * An SCM repository. This interface wraps a source control with methods for answering
 * other types of queries beyond what the builtin vscode.SourceControl interface offers.
 */
export interface Repository extends vscode.Disposable {
	/**
	 * The source control that this repository represents.
	 */
	sourceControl: vscode.SourceControl;

	/**
	 * Returns information about the commit specified by the revision.
	 */
	resolveCommit(revision: string, token?: vscode.CancellationToken): Thenable<Commit | undefined>;

	/**
	 * Blames a document or ranges within a document.
	 *
	 * Use the resolveCommit method to look up information about commits that the result
	 * refers to.
	 */
	blame(doc: vscode.TextDocument, ranges?: vscode.Range[], token?: vscode.CancellationToken): Thenable<BlameHunk[]>;
}

/**
 * A commit.
 */
export interface Commit {
	/**
	 * The unique identifer of the commit (e.g., the Git commit SHA-1 hex digest).
	 */
	id: string;

	/**
	 * The author of the commit.
	 */
	author: Signature;

	/**
	 * The committer, if one exists.
	 */
	committer?: Signature;

	/**
	 * The commit message.
	 */
	message: string;

	/**
	 * The commit IDs of this commit's parents.
	 */
	parents: string[];
}

/**
 * An author or committer signature.
 */
export interface Signature {
	/**
	 * The name of the signer (committer or author).
	 */
	name: string;

	/**
	 * The email address of the signer.
	 */
	email?: string;

	/**
	 * The timestamp of the signature.
	 */
	timestamp: number;
}

/**
 * A set of contiguous lines that originate from the same commit.
 */
export interface BlameHunk extends RawBlameHunk {
	range: vscode.Range;
}