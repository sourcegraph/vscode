/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ServicesAccessor, editorAction, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { Range } from 'vs/editor/common/core/range';
import { CREATE_CODE_COMMENT_ACTION_LABEL, VIEWLET_ID } from 'vs/workbench/parts/codeComments/common/constants';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ICodeCommentsViewlet } from 'vs/workbench/parts/codeComments/common/codeComments';

/**
 * Editor action that opens the code comments viewlet
 * to create a new comment for the current text selection or line.
 */
@editorAction
export class CreateCodeCommentAction extends EditorAction {

	private static ID = 'workbench.action.createCodeComment';

	constructor() {
		super({
			id: CreateCodeCommentAction.ID,
			label: CREATE_CODE_COMMENT_ACTION_LABEL,
			alias: 'Comment on This Code',
			precondition: null,
			menuOpts: {
				group: '3_codecomments',
				order: 3.1,
			}
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		const viewletService = accessor.get(IViewletService);
		const file = editor.getModel().uri;
		const range = this.getCommentRange(editor);
		viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as ICodeCommentsViewlet)
			.then(viewlet => {
				viewlet.createThread(file, range);
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
			const first = model.getLineFirstNonWhitespaceColumn(line);
			const last = model.getLineLastNonWhitespaceColumn(line);
			if (first !== last) {
				return new Range(line, first, line, last);
			}
			return new Range(line, 0, line, model.getLineMaxColumn(line));
		}
		return selection;
	}
}