/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Range } from 'vs/editor/common/core/range';
import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';

export const ID = 'codeCommentsService';

export const ICodeCommentsService = createDecorator<ICodeCommentsService>(ID);

export interface ICodeCommentsService {
	_serviceBrand: any;

	/**
	 * An event that is fired when comments change.
	 */
	readonly onCommentsDidChange: Event<CommentsDidChangeEvent>;

	/**
	 * Creates a new thread and comment on the file at the given range.
	 */
	createThread(file: URI, range: Range, content: string): Promise<IThread>;

	/**
	 * Adds a new comment to a thread.
	 */
	replyToThread(file: URI, thread: IThread, content: string): Promise<IThread>;

	/**
	 * Returns all threads that are attached to the current revision of the file.
	 * Threads are ordered by the timestamp of the most recent comment descending.
	 */
	getThreads(file: URI): Promise<IThread[]>;
}

export interface CommentsDidChangeEvent {
	/**
	 * The file that comments changed on.
	 */
	file: URI;

	/**
	 * The threads that changed on the file.
	 */
	threads: IThread[];
}

/**
 * A thread contains one or more comments.
 */
export interface IThread {
	readonly id: number;
	readonly repo: string;
	readonly revision: string;
	readonly file: string;
	readonly range: Range;
	readonly comments: IComment[];
}

export interface IComment {
	readonly id: number;
	readonly authorName: string;
	readonly authorEmail: string;
	// readonly authorImage: vscode.Uri;
	readonly content: string;
	readonly createdAt: Date;
}