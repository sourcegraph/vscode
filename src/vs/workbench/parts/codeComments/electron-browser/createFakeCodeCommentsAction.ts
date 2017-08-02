/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeCommentsService } from 'vs/editor/common/services/codeCommentsService';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ServicesAccessor, editorAction, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { Range } from 'vs/editor/common/core/range';

/**
 * Populates some fake comments for debugging purposes.
 */
@editorAction
export class CreateFakeCodeCommentsAction extends EditorAction {

	private static ID = 'workbench.action.createFakeCodeComments';

	constructor() {
		super({
			id: CreateFakeCodeCommentsAction.ID,
			label: 'Create fake code comments',
			alias: 'Create fake code comments',
			precondition: null,
			menuOpts: {
				group: '3_codecomments',
				order: 3.2,
			}
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		const codeCommentsService = accessor.get(ICodeCommentsService);
		const range = this.getCommentRange(editor);
		// const selection = editor.getModel().getValueInRange(range);

		// We don't have a UI for creating comments yet, so just pre-populate some fake content.
		const file = editor.getModel().uri;
		// const comment = `This is a comment in ${file} at ${range} on text ${selection}`;
		return new TPromise((complete, error) => {
			// codeCommentsService.createThread(editor.getModel().uri, range, comment).then(complete, error);

			let promise = Promise.resolve<any>();
			for (var i = 1; i < 10; i++) {
				const fakeRange = new Range(range.startLineNumber + i, 1, range.endLineNumber + i, 2);
				promise = promise.then(() => codeCommentsService.createThread(file, fakeRange, `first comment in thread ${fakeRange.toString()} plus some other text to take up vertical space asd fas fasdf asdf asd fasd fasd fasd fdfs `))
					.then(thread => {
						let promise = Promise.resolve<any>();
						for (let j = 1; j < 10; j++) {
							const comment = `comment ${j} in thread ${fakeRange.toString()}`;
							promise = promise.then(() => {
								return codeCommentsService.replyToThread(file, thread, comment);
							});
						}
						return promise;
					});
			}
			promise.then(complete, error);
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