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
import { ICodeCommentsService } from 'vs/editor/common/services/codeCommentsService';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';

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
		const messageService = accessor.get(IMessageService);
		const file = editor.getModel().uri;
		const range = this.getCommentRange(editor);
		if (range.isEmpty()) {
			messageService.show(Severity.Error, localize('selectTextToCommentOn', "Select some text to comment on."));
			return TPromise.wrap(undefined);
		}
		return viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as ICodeCommentsViewlet)
			.then(viewlet => {
				viewlet.createThread(file, range);
			});
	}

	/**
	 * Returns the range that the new comment should be attached to.
	 */
	private getCommentRange(editor: ICommonCodeEditor): Range {
		let selection: Range = editor.getSelection();
		if (selection.isEmpty()) {
			// The user has not selected any text (just a cursor on a line).
			// Select the entire line with all whitespace trimmed.
			const model = editor.getModel();
			const line = selection.startLineNumber;
			const first = model.getLineFirstNonWhitespaceColumn(line);
			const last = model.getLineLastNonWhitespaceColumn(line);
			selection = new Range(line, first, line, last);

			// Update editor selection to reflect the comment range.
			editor.setSelection(selection);
		} else if (selection.endColumn === 1) {
			// A range that selects an entire line will have an end position
			// at the first column of the next line (e.g. [4, 1] => [5, 1]).
			// Convert the range to be a single line (e.g. [4, 1] => [4, 10])
			// because that is more natural and we don't care about including the newline
			// character in the comment range.
			const line = selection.endLineNumber - 1;
			const endColumn = editor.getModel().getLineContent(line).length + 1;
			selection = selection.setEndPosition(selection.endLineNumber - 1, endColumn);
		}
		return selection;
	}
}