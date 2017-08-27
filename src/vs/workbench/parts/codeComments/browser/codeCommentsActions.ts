/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { CREATE_CODE_COMMENT_ACTION_LABEL, VIEWLET_ID } from 'vs/workbench/parts/codeComments/common/constants';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ServicesAccessor, editorAction, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { Range } from 'vs/editor/common/core/range';
import { ICodeCommentsViewlet } from 'vs/workbench/parts/codeComments/common/codeComments';

/**
 * Action to open the code comments viewlet.
 */
export class OpenCodeCommentsViewletAction extends ToggleViewletAction {
	public static ID = VIEWLET_ID;
	public static LABEL = localize('showCodeCommentsViewlet', "Show Code Comments");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

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
			alias: 'Comment',
			precondition: null,
			menuOpts: {
				group: '3_codecomments',
				order: 3.1,
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		const viewletService = accessor.get(IViewletService);
		const file = editor.getModel().uri;
		const range = this.getCommentRange(editor);
		return viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as ICodeCommentsViewlet)
			.then(viewlet => {
				viewlet.createThread(file, range);
			});
	}

	/**
	 * Returns the range that the new comment should be attached to.
	 * It guarantees the returned range is not empty.
	 */
	private getCommentRange(editor: ICommonCodeEditor): Range {
		let selection: Range = editor.getSelection();
		if (selection.isEmpty()) {
			// The user has not selected any text (just a cursor on a line).
			// Select the entire line.
			const line = selection.startLineNumber;
			selection = new Range(line, 1, line + 1, 1);

			// Update editor selection to reflect the comment range.
			editor.setSelection(selection);
		}

		if (selection.endColumn === 1) {
			// A range that selects an entire line (either from the logic above, or
			// because the user tripple clicked in a location) will have an end position
			// at the first column of the next line (e.g. [4, 1] => [5, 1]).
			// Convert the range to be a single line (e.g. [4, 1] => [4, 10])
			// because that is more natural and we don't care about including the newline
			// character in the comment range.
			const line = selection.endLineNumber - 1;
			const endColumn = editor.getModel().getLineContent(line).length + 1;
			const trimmedSelection = selection.setEndPosition(selection.endLineNumber - 1, endColumn);
			// Only use the trimmedSelection if it isn't empty.
			// If the trimmed selection is empty it means that the user
			// commented on a newline character, which is fine, so we keep
			// their original range.
			if (!trimmedSelection.isEmpty()) {
				selection = trimmedSelection;
				editor.setSelection(selection);
			}
		}
		return selection;
	}
}