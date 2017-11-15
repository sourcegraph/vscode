/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export const commentFieldsFragment = `fragment CommentFields on Comment {
	id
	body
	createdAt
	author {
		avatarUrl
		login
		url
	}
}`;

export const pullRequestReviewFieldsFragment = `fragment PullRequestReviewFields on PullRequestReview {
	...CommentFields
	state
	url
	comments(first: 100) {
		totalCount
		nodes {
			...CommentFields
			position
			url
			replyTo {
				id
			}
		}
	}
}`;