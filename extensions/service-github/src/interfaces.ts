/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export interface Discussion {
	comments: DiscussionComment[];
}

export interface DiscussionComment {
	id: string;
	contents: string;
	createdAt: Date;
	author: User;
}

export interface User {
	login: string;
}

/**
 * Message sent from the webview to the extension.
 */
export type MessageFromWebView = SubmitCommentMessage;

/**
 * The user submitted the comment form.
 */
export interface SubmitCommentMessage {
	type: 'submitComment';
	body: string;
}

/**
 * Message sent from the extension to the webview.
 */
export type MessageFromExtension = RenderDiscussionMessage | SubmitCommentSuccessMessage | SubmitCommentErrorMessage;

export interface RenderDiscussionMessage {
	type: 'renderDiscussion';
	discussion?: Discussion;
}

export interface SubmitCommentSuccessMessage {
	type: 'submitCommentSuccess';

	/**
	 * The new discussion that was created.
	 */
	discussion: Discussion;
}

export interface SubmitCommentErrorMessage {
	type: 'submitCommentError';
	message: string;
}
