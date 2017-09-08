/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Range } from 'vs/editor/common/core/range';
import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';

export const ID = 'codeCommentsService';

export const ICodeCommentsService = createDecorator<ICodeCommentsService>(ID);

export interface ICodeCommentsService {
	_serviceBrand: any;

	/**
	 * Returns a model for the comments on a file.
	 */
	getFileComments(file: URI): IFileComments;
}

/**
 * Model for comments on a file.
 */
export interface IFileComments extends IDisposable {

	/**
	 * A promise that resolves when comments
	 * are done refreshing on the file.
	 */
	readonly refreshing: TPromise<void>;

	/**
	 * Returns all threads on the file.
	 * Threads are ordered by the timestamp of the most recent comment descending.
	 */
	readonly threads: IThreadComments[];

	/**
	 * Event that is fired when threads change.
	 */
	readonly onDidChangeThreads: Event<void>;

	/**
	 * Returns all draft threads on the file in the order that they were created.
	 */
	readonly draftThreads: IDraftThreadComments[];

	/**
	 * Event that is fired when draft threads change.
	 */
	readonly onDidChangeDraftThreads: Event<void>;

	/**
	 * Returns the thread on the file with a matching id.
	 */
	getThread(id: number): IThreadComments | undefined;

	/**
	 * Returns the draft thread on the file with a matching id.
	 */
	getDraftThread(id: number): IDraftThreadComments | undefined;

	/**
	 * Creates a new thread and comment on the file at the given range.
	 */
	createDraftThread(editor: ICommonCodeEditor): IDraftThreadComments;

	/**
	 * Refreshes threads from the network.
	 * onDidChangeThreads will fire after the threads load.
	 */
	refreshThreads(): TPromise<void>;
}

/**
 * Model for a new thread that the user has not submitted.
 */
export interface IDraftThreadComments extends IDisposable {

	/**
	 * A client-local idendifier for the new thread.
	 */
	id: number;

	/**
	 * The content of the draft.
	 * It will be parsed as markdown.
	 */
	content: string;
	readonly onDidChangeContent: Event<void>;

	/**
	 * The range that the draft should be displayed at.
	 */
	readonly displayRange: Range;
	readonly onDidChangeDisplayRange: Event<void>;

	/**
	 * True if the draft is being submitted.
	 */
	readonly submitting: boolean;
	readonly onDidChangeSubmitting: Event<void>;

	/**
	 * Event that is fired after the draft is successfully submitted.
	 */
	readonly onDidSubmit: Event<IThreadComments>;

	/**
	 * Submit the draft.
	 */
	submit(): TPromise<IThreadComments>;
}

/**
 * Model for comment threads on a file.
 */
export interface IThreadComments extends IDisposable {
	/**
	 * Auto increment id for the thread.
	 */
	readonly id: number;

	/**
	 * The relative path of the file inside of the repo.
	 */
	readonly file: string;

	/**
	 * An absolute revision that the comment is attached to.
	 * (e.g. SHA-1 for Git).
	 */
	readonly revision: string;

	/**
	 * The range that the comment is attached to on the file at the revision.
	 */
	readonly range: Range;

	/**
	 * The date the thread was created.
	 */
	readonly createdAt: Date;

	/**
	 * The comments in the thread.
	 */
	readonly comments: ReadonlyArray<IComment>;
	readonly onDidChangeComments: Event<void>;

	/**
	 * The most recent comment in the thread.
	 */
	readonly mostRecentComment: IComment;

	/**
	 * The range adjusted for the current state of the file.
	 * It is undefined if the range can not be transformed to
	 * the current state of the file or if the computation of
	 * that transformation has not finished yet.
	 */
	readonly displayRange?: Range;
	readonly onDidChangeDisplayRange: Event<void>;

	/**
	 * The content of a pending reply to the thread.
	 */
	draftReply: string;
	readonly onDidChangeDraftReply: Event<void>;

	/**
	 * True if the draftReply is being submitted.
	 */
	readonly submittingDraftReply: boolean;
	readonly onDidChangeSubmittingDraftReply: Event<void>;

	/**
	 * Adds a new comment to a thread with the content of draftReply.
	 */
	submitDraftReply(): TPromise<void>;
}

/**
 * Model for a single comment.
 */
export interface IComment {
	id: number;
	contents: string;
	createdAt: Date;
	updatedAt: Date;
	authorName: string;
	authorEmail: string;
}