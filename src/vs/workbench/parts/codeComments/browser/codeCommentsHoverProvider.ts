/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { registerHoverProvider } from 'vs/editor/standalone/browser/standaloneLanguages';
import { HoverProvider, Hover } from 'vs/editor/common/modes';
import { Position } from 'vs/editor/common/core/position';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { ICodeCommentsService } from 'vs/editor/common/services/codeCommentsService';

/**
 * Completely temporary interface to view existing comments.
 * For debugging.
 * Will be replaced by a viewlet.
 */
export class CodeCommentsHoverProvider implements HoverProvider {
	constructor(
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
	) {
		registerHoverProvider('*', this);
	}

	public getId(): string {
		return 'sg.codeComments.hoverProvider';
	}

	public provideHover(model: IReadOnlyModel, position: Position, token: CancellationToken): Promise<Hover> {
		return this.codeCommentsService.getThreadsForPosition(model.uri, position).then(threads => {
			const comments = threads.map(thread => {
				return thread.comments.map(comment => {
					return localize('formattedHoverComment', "{0} ({1}): {2}", comment.authorName, comment.authorEmail, comment.text);
				}).join('\n---\n');
			});
			return {
				contents: comments,
				range: undefined,
			};
		});
	}
}