/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Range, IRange } from 'vs/editor/common/core/range';
import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';

export const ID = 'codeCommentsService';

export const ICodeCommentsService = createDecorator<ICodeCommentsService>(ID);

export interface IFileCommentsModel {
	/**
	 * The comment thread that the user has selected to look at.
	 */
	selectedThread: Thread | undefined;

	/**
	 * Event that is fired when selectedThread changes.
	 */
	readonly onSelectedThreadDidChange: Event<void>;
}

export interface ICodeCommentsService {
	_serviceBrand: any;

	/**
	 * Event that is fired when comments change.
	 */
	readonly onCommentsDidChange: Event<CommentsDidChangeEvent>;

	/**
	 * Returns the code comments model for a file.
	 * TODO: might want to move most of the other methods and properties onto the model.
	 */
	getModel(file: URI): IFileCommentsModel;

	/**
	 * Creates a new thread and comment on the file at the given range.
	 */
	createThread(file: URI, range: Range, content: string): TPromise<Thread>;

	/**
	 * Adds a new comment to a thread.
	 */
	replyToThread(file: URI, thread: Thread, content: string): TPromise<void>;

	/**
	 * Returns all threads that are attached to the current revision of the file.
	 * Threads are ordered by the timestamp of the most recent comment descending.
	 */
	getThreads(file: URI): Thread[];

	/**
	 * Returns the thread on the file with a matching id.
	 */
	getThread(file: URI, id: number): Thread | undefined;

	/**
	 * Refreshes threads from the network.
	 * onCommentDidChange will fire after the threads load.
	 */
	refreshThreads(file: URI): TPromise<void>;

	/**
	 * Returns a promise that resolves when comments
	 * are done refreshing on the file.
	 */
	refreshing(file: URI): TPromise<void>;
}

export interface CommentsDidChangeEvent {
	/**
	 * The file that comments changed on.
	 */
	file: URI;
}

export interface IThread {
	id: number;
	file: string;
	revision: string;
	range: IRange;
	createdAt: Date;
	comments: ReadonlyArray<Comment>;
	mostRecentComment: Comment;
}

export class Thread implements IThread {
	public readonly id: number;
	public readonly file: string;
	public readonly revision: string;
	public readonly range: Range;
	public readonly createdAt: Date;
	public readonly comments: ReadonlyArray<Comment>;
	public readonly mostRecentComment: Comment;

	constructor(thread: IThread) {
		this.id = thread.id;
		this.file = thread.file;
		this.revision = thread.revision;
		this.range = Range.lift(thread.range);
		this.createdAt = thread.createdAt;
		this.comments = thread.comments;
		this.mostRecentComment = thread.mostRecentComment;
	}

	public static fromGraphQL(thread: GQL.IThread): Thread {
		const comments = thread.comments.map(comment => Comment.fromGraphQL(comment));
		const mostRecentComment = comments[comments.length - 1];
		if (!mostRecentComment) {
			throw new Error(`expected thread ${thread.id} to have at least one comment`);
		}
		return new Thread({
			id: thread.id,
			file: thread.file,
			revision: thread.revision,
			range: new Range(thread.startLine, thread.startCharacter, thread.endLine, thread.endCharacter),
			createdAt: new Date(thread.createdAt),
			comments,
			mostRecentComment,
		});
	}

	public with(partial: Partial<IThread>): Thread {
		const thread: Thread = this;
		return new Thread({ ...thread, ...partial });
	}
}

export interface IComment {
	id: number;
	contents: string;
	createdAt: Date;
	updatedAt: Date;
	authorName: string;
	authorEmail: string;
}

export class Comment implements IComment {
	public readonly id: number;
	public readonly contents: string;
	public readonly createdAt: Date;
	public readonly updatedAt: Date;
	public readonly authorName: string;
	public readonly authorEmail: string;

	constructor(comment: IComment) {
		this.id = comment.id;
		this.contents = comment.contents;
		this.createdAt = comment.createdAt;
		this.updatedAt = comment.updatedAt;
		this.authorName = comment.authorName;
		this.authorEmail = comment.authorEmail;
	}

	public static fromGraphQL(comment: GQL.IComment): Comment {
		return new Comment({
			id: comment.id,
			contents: comment.contents,
			createdAt: new Date(comment.createdAt),
			updatedAt: new Date(comment.updatedAt),
			authorName: comment.authorName,
			authorEmail: comment.authorEmail,
		});
	}
}