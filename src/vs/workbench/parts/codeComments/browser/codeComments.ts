/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IThreadComments } from 'vs/editor/browser/services/codeCommentsService';

/**
 * Copied from sourcegraph/sourcegraph/cmd/frontend/internal/graphqlbackend/comments.go
 */
const USERNAME_MENTION_REGEX = new RegExp(`@([a-zA-Z0-9]([a-zA-Z0-9-]{0,36}[a-zA-Z0-9])?)`, 'gi');

/**
 * Returns telementry data for a comment.
 */
export function getCommentTelemetryData(params: { thread?: IThreadComments, content: string, error: boolean }): ITelemetryData {
	const threadId = params.thread && params.thread.id;
	const lineCount = params.thread && params.thread.range.endLineNumber - params.thread.range.startLineNumber + 1;
	const contentLength = params.content && params.content.length;
	const mentionCount = params.content && (params.content.match(USERNAME_MENTION_REGEX) || []).length;
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
