/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeCommentsService } from 'vs/editor/common/services/codeCommentsService';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ServicesAccessor, editorAction, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { Range } from 'vs/editor/common/core/range';

/**
 * Editor action that opens UI to create a comment
 * for the current text selection or line.
 */
@editorAction
export class CreateCodeCommentAction extends EditorAction {

	private static ID = 'workbench.action.createCodeComment';
	private static LABEL = localize('createCodeCommentActionLabel', "Comment on this code");

	constructor() {
		super({
			id: CreateCodeCommentAction.ID,
			label: CreateCodeCommentAction.LABEL,
			alias: 'Comment on this code',
			precondition: null,
			menuOpts: {
				group: '3_codecomments',
				order: 3.1,
			}
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		const codeCommentsService = accessor.get(ICodeCommentsService);
		const range = this.getCommentRange(editor);
		const selection = editor.getModel().getValueInRange(range);

		// We don't have a UI for creating comments yet, so just pre-populate some fake content.
		const file = editor.getModel().uri;
		const comment = `This is a comment in ${file} at ${range} on text ${selection}`;
		return new TPromise((complete, error) => {
			codeCommentsService.createThread(editor.getModel().uri, range, comment).then(complete, error);
		});
	}

	/**
	 * Returns the range that the new comment should be attached to.
	 */
	private getCommentRange(editor: ICommonCodeEditor): Range {
		const selection = editor.getSelection();
		const start = selection.getStartPosition();
		if (start.equals(selection.getEndPosition())) {
			// The user has not selected any text (just a cursor on a line)
			// and we don't want a zero width range, so default to the whole line.
			const model = editor.getModel();
			const line = start.lineNumber;
			return new Range(line, model.getLineFirstNonWhitespaceColumn(line), line, model.getLineLastNonWhitespaceColumn(line));
		}
		return selection;
	}
}