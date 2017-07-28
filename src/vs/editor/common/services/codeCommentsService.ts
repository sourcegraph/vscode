/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Position } from 'vs/editor/common/core/position';
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
	createThread(file: URI, range: Range, comment: string): Promise<IThread>;

	/**
	 * Returns all threads that are attached to the current revision of the file.
	 */
	getThreads(file: URI): Promise<IThread[]>;

	/**
	 * Returns all threads on ranges that intersect the given range.
	 */
	getThreadsForRange(file: URI, range: Range): Promise<IThread[]>;

	/**
	 * Returns all threads on ranges that contain the given position.
	 */
	getThreadsForPosition(file: URI, position: Position): Promise<IThread[]>;

}

export interface CommentsDidChangeEvent {
	/**
	 * The file that comments changed on.
	 */
	file: URI;
}

/**
 * A thread contains one or more comments.
 */
export interface IThread {
	readonly repo: string;
	readonly revision: string;
	readonly file: string;
	readonly range: Range;
	readonly comments: IComment[];
}

export interface IComment {
	readonly authorName: string;
	readonly authorEmail: string;
	// readonly authorImage: vscode.Uri;
	readonly text: string;
}