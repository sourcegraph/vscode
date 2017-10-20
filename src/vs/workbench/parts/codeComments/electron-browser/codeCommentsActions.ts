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
import { ServicesAccessor, editorAction, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { ICodeCommentsService } from 'vs/editor/common/services/codeCommentsService';
import { CodeCommentsController } from 'vs/workbench/parts/codeComments/electron-browser/codeCommentsController';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CommentsContextKeys } from 'vs/workbench/parts/codeComments/browser/commentsContextKeys';
import { IRemoteConfiguration } from 'vs/platform/remote/node/remote';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Action } from 'vs/base/common/actions';

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
			precondition: CommentsContextKeys.canComment,
			kbOpts: {
				kbExpr: EditorContextKeys.textFocus,
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KEY_M,
			},
			menuOpts: {
				group: '3_codecomments',
				order: 3.1,
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		const codeCommentsService = accessor.get(ICodeCommentsService);
		const model = editor.getModel();
		const fileComments = codeCommentsService.getFileComments(model.uri);
		const draftThread = fileComments.createDraftThread(editor);
		CodeCommentsController.get(editor).showDraftThreadWidget(draftThread, true);
		return TPromise.wrap(true);
	}
}

/**
 * Editor action that shares the current text selection.
 */
@editorAction
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
				group: '3_codecomments',
				order: 3.1,
			}
		});
	}

	public async run(accessor: ServicesAccessor, editor: ICommonCodeEditor): TPromise<any> {
		const clipboardService = accessor.get(IClipboardService);
		const codeCommentsService = accessor.get(ICodeCommentsService);
		const configurationService = accessor.get(IConfigurationService);
		const messageService = accessor.get(IMessageService);

		const model = editor.getModel();
		const fileComments = codeCommentsService.getFileComments(model.uri);
		const draftThread = fileComments.createDraftThread(editor);
		const config = configurationService.getConfiguration<IRemoteConfiguration>();
		if (!config.remote.shareContext) {
			messageService.show(Severity.Error, {
				message: localize('shareSnippet.sharing-not-enabled', 'You must set remote.shareContext = true to enable sharing code snippets.'),
				actions: [
					new Action('moreInfo', localize('shareSnippet.more-info', "More Info"), null, true, () => {
						window.open('https://about.sourcegraph.com/docs/editor/share-code');
						return TPromise.wrap(true);
					})
				]
			});
			return TPromise.wrap(false);
		}

		const threadComments = await draftThread.submit(true);
		return codeCommentsService.shareThread(threadComments.id).then(sharedURL => {
			clipboardService.writeText(sharedURL);
			const dismiss = messageService.show(Severity.Info, localize('shareSnippet.copied-to-clipboard', 'Sharable link copied to clipboard!'));
			setTimeout(dismiss, 1500);
		});
	}
}