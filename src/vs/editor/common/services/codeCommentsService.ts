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
	 * The comment thread that the user has selected to look at.
	 */
	selectedThread: IThreadComments | undefined;

	/**
	 * Event that is fired when selectedThread changes.
	 */
	readonly onSelectedThreadDidChange: Event<void>;

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
	readonly onThreadsDidChange: Event<void>;

	/**
	 * Returns all draft threads on the file in the order that they were created.
	 */
	readonly draftThreads: IDraftThreadComments[];

	/**
	 * Event that is fired when draft threads change.
	 */
	readonly onDraftThreadsDidChange: Event<void>;

	/**
	 * Returns the thread on the file with a matching id.
	 */
	getThread(id: number): IThreadComments | undefined;

	/**
	 * Creates a new thread and comment on the file at the given range.
	 */
	createDraftThread(editor: ICommonCodeEditor): IDraftThreadComments;

	/**
	 * Refreshes threads from the network.
	 * onThreadsDidChange will fire after the threads load.
	 */
	refreshThreads(): TPromise<void>;
}

/**
 * Model for a new thread that the user has not submitted.
 */
export interface IDraftThreadComments extends IDisposable {
	/**
	 * The content of the draft.
	 */
	content: string;

	/**
	 * Event that is fired when content changes.
	 */
	readonly onContentDidChange: Event<void>;

	/**
	 * Event that is fired after the draft is successfully submitted.
	 */
	readonly onDidSubmit: Event<IThreadComments>;

	/**
	 * Submit the draft.
	 */
	submit(): TPromise<IThreadComments>;
}

export interface IThreadComments extends IDisposable {
	readonly id: number;
	readonly file: string;
	readonly revision: string;
	readonly range: Range;
	readonly createdAt: Date;
	readonly comments: ReadonlyArray<IComment>;
	readonly mostRecentComment: IComment;

	/**
	 * The range adjusted for the current state of the file.
	 * It is undefined if the range can not be transformed to
	 * the current state of the file or if the computation of
	 * that transformation has not finished yet.
	 */
	readonly displayRange?: Range;

	/**
	 * The content of a pending reply to the thread.
	 */
	draftReply: string;

	readonly onDraftReplyDidChange: Event<void>;
	readonly onCommentsDidChange: Event<void>;
	readonly onDisplayRangeDidChange: Event<void>;

	/**
	 * Adds a new comment to a thread with the content of draftReply.
	 */
	submitDraftReply(): TPromise<void>;
}

export interface IComment {
	id: number;
	contents: string;
	createdAt: Date;
	updatedAt: Date;
	authorName: string;
	authorEmail: string;
}