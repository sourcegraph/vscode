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
	createThread(file: URI, range: Range, content: string): Promise<Thread>;

	/**
	 * Adds a new comment to a thread.
	 */
	replyToThread(file: URI, thread: Thread, content: string): Promise<void>;

	/**
	 * Returns all threads that are attached to the current revision of the file.
	 * Threads are ordered by the timestamp of the most recent comment descending.
	 *
	 * TODO: separate api that fetches from network from api that returns cached state.
	 */
	getThreads(file: URI, skipCache: boolean): Promise<Thread[]>;
}

export interface CommentsDidChangeEvent {
	/**
	 * The file that comments changed on.
	 */
	file: URI;

	/**
	 * The threads that changed on the file.
	 */
	threads: Thread[];
}

export interface IThread {
	id: number;
	file: string;
	revision: string;
	range: Range;
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
		this.range = thread.range;
		this.createdAt = thread.createdAt;
		this.comments = thread.comments;
		this.mostRecentComment = thread.mostRecentComment;
	}

	public static fromGraphQL(thread: GQL.IThread): Thread {
		const comments = thread.comments.map(comment => new Comment(comment));
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

export class Comment {
	public readonly id: number;
	public readonly contents: string;
	public readonly createdAt: Date;
	public readonly updatedAt: Date;
	public readonly authorName: string;
	public readonly authorEmail: string;

	constructor(comment: GQL.IComment) {
		this.id = comment.id;
		this.contents = comment.contents;
		this.createdAt = new Date(comment.createdAt);
		this.updatedAt = new Date(comment.updatedAt);
		this.authorName = comment.authorName;
		this.authorEmail = comment.authorEmail;
	}
}