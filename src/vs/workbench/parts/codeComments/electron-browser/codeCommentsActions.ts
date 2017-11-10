/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { CREATE_CODE_COMMENT_ACTION_LABEL, SHARE_SNIPPET_ACTION_LABEL, VIEWLET_ID } from 'vs/workbench/parts/codeComments/common/constants';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { ServicesAccessor, registerEditorAction, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeCommentsService, DraftThreadKind } from 'vs/editor/common/services/codeCommentsService';
import { CodeCommentsController } from 'vs/workbench/parts/codeComments/electron-browser/codeCommentsController';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CommentsContextKeys } from 'vs/workbench/parts/codeComments/browser/commentsContextKeys';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IMessageService, Severity } from 'vs/platform/message/common/message';

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
export class CreateCodeCommentAction extends EditorAction {

	private static ID = 'workbench.action.createCodeComment';

	constructor() {
		super({
			id: CreateCodeCommentAction.ID,
			label: CREATE_CODE_COMMENT_ACTION_LABEL,
			alias: 'Comment',
			precondition: CommentsContextKeys.canComment,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_M,
			},
			menuOpts: {
				group: '1_codecomments',
				order: 1.1,
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		const codeCommentsService = accessor.get(ICodeCommentsService);
		const model = editor.getModel();
		const fileComments = codeCommentsService.getFileComments(model.uri);
		const draftThread = fileComments.createDraftThread(editor, DraftThreadKind.Comment);
		CodeCommentsController.get(editor).showDraftThreadWidget(draftThread, true);
		return TPromise.wrap(true);
	}
}
registerEditorAction(CreateCodeCommentAction);

/**
 * Editor action that shares the current text selection.
 */
export class ShareSnippetAction extends EditorAction {

	private static ID = 'workbench.action.shareSnippet';

	constructor() {
		super({
			id: ShareSnippetAction.ID,
			label: SHARE_SNIPPET_ACTION_LABEL,
			alias: 'Share Snippet',
			precondition: CommentsContextKeys.canComment,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.Alt | KeyCode.KEY_S,
			},
			menuOpts: {
				group: '1_codecomments',
				order: 1.2,
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		return TPromise.wrap(this.runAsync(accessor, editor));
	}

	private async runAsync(accessor: ServicesAccessor, editor: ICommonCodeEditor): Promise<any> {
		const clipboardService = accessor.get(IClipboardService);
		const codeCommentsService = accessor.get(ICodeCommentsService);
		const messageService = accessor.get(IMessageService);

		const model = editor.getModel();
		const fileComments = codeCommentsService.getFileComments(model.uri);
		const draftThread = fileComments.createDraftThread(editor, DraftThreadKind.ShareLink);
		try {
			const threadComments = await draftThread.submit();
			if (!threadComments) {
				return;
			}
			const sharedUrl = await codeCommentsService.shareThread(threadComments.id);
			clipboardService.writeText(sharedUrl);
			const dismiss = messageService.show(Severity.Info, localize('shareSnippet.copied-to-clipboard', 'Sharable link copied to clipboard!'));
			setTimeout(dismiss, 1500);
		} catch (e) {
			console.error(e);
			draftThread.dispose();
		}
	}
}
registerEditorAction(ShareSnippetAction);
