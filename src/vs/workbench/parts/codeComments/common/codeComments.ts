/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IViewlet } from 'vs/workbench/common/viewlet';
import { Range } from 'vs/editor/common/core/range';
import URI from 'vs/base/common/uri';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { Thread } from 'vs/editor/common/services/codeCommentsService';

export interface ICodeCommentsViewlet extends IViewlet {
	/**
	 * Renders a UI to create a new comment thread on the line or selection of the current editor.
	 */
	createThread(file: URI, range: Range): void;

	/**
	 * Renders a UI to display the specified thread and comment.
	 */
	viewThread(threadID: number, commentID?: number): void;
}

/**
 * Copied from sourcegraph/sourcegraph/cmd/frontend/internal/graphqlbackend/comments.go
 */
const EMAIL_MENTION_REGEX = /\B\+[^\s]+@[^\s]+\.[A-Za-z0-9]+/g;

/**
 * Returns telementry data for a comment.
 */
export function getCommentTelemetryData(params: { range: Range, thread?: Thread, content?: string, error?: boolean }): ITelemetryData {
	const threadId = params.thread && params.thread.id;
	const lineCount = params.range.endLineNumber - params.range.startLineNumber + 1;
	const contentLength = params.content && params.content.length;
	const mentionCount = params.content && (params.content.match(EMAIL_MENTION_REGEX) || []).length;
	const error = params.error;
	return {
		codeComments: {
			threadId,
			lineCount,
			contentLength,
			mentionCount,
			error,
		}
	};
}