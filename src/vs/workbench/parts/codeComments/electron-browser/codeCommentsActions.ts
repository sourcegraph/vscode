/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { CREATE_CODE_COMMENT_ACTION_LABEL, SHARE_SNIPPET_ACTION_LABEL, VIEWLET_ID, CREATE_COMMENT_ACTION_ID } from 'vs/workbench/parts/codeComments/common/constants';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeCommentsService, DraftThreadKind } from 'vs/editor/browser/services/codeCommentsService';
import { CodeCommentsController } from 'vs/workbench/parts/codeComments/electron-browser/codeCommentsController';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { CommentsContextKeys } from 'vs/workbench/parts/codeComments/browser/commentsContextKeys';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
import { IMessageService, Severity, CancelAction } from 'vs/platform/message/common/message';
import { EditorAction, ServicesAccessor, registerEditorAction } from 'vs/editor/browser/editorExtensions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Action } from 'vs/base/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { urlToCreateOrg } from 'vs/platform/auth/node/authService';
import { IAuthService } from 'vs/platform/auth/common/auth';
import URI from 'vs/base/common/uri';

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

	private static ID = CREATE_COMMENT_ACTION_ID;

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

	public run(accessor: ServicesAccessor, editor: ICodeEditor): TPromise<any> {
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
 * Editor action that exposes the "Comment" action to the quick open menu
 * and to the editor context menu. This action is responsible for notifying the user
 * that they need to 1) Sign up or sign in 2) Create or join an organization
 * in order to use comments. This action is only exposed when CommentsContextKeys.canComment.toNegated().
 */
export class CodeCommentSignInAction extends EditorAction {
	private static ID = 'workbench.action.codeCommentSignInAction';

	constructor() {
		super({
			id: CodeCommentSignInAction.ID,
			alias: 'Comment',
			label: CREATE_CODE_COMMENT_ACTION_LABEL,
			precondition: CommentsContextKeys.canComment.toNegated(),
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

	public run(accessor: ServicesAccessor, editor: ICodeEditor): TPromise<any> {
		const messageService = accessor.get(IMessageService);
		const openerService = accessor.get(IOpenerService);
		const configService = accessor.get(IConfigurationService);
		const authService = accessor.get(IAuthService);
		const signInAction = new Action('signIn.message', localize('signIn', "Sign in"), null, true, () => {
			authService.showSignInFlow();
			return TPromise.wrap(true);
		});
		const orgAction = new Action('close.message', localize('createOrJoin', "Create or join"), null, true, () => {
			const url = urlToCreateOrg(configService);
			openerService.open(url);
			return TPromise.wrap(true);
		});

		const learnMore = new Action('learnMore.message', localize('comments.learnMore', "Learn More"), null, true, () => {
			openerService.open(URI.parse('https://about.sourcegraph.com/products/editor/'));
			return TPromise.wrap(true);
		});

		const message = authService.currentUser ?
			localize('comment.joinOrgMessage', "Create or join an organization to start using code comments.") :
			localize('comment.signInMessage', "Sign in or create an account to start using code comments.");
		const action = authService.currentUser ? orgAction : signInAction;

		messageService.show(Severity.Info, {
			message: message, actions: [
				action,
				learnMore,
				CancelAction
			]
		});

		return TPromise.wrap(true);
	}
}
registerEditorAction(CodeCommentSignInAction);

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

	public run(accessor: ServicesAccessor, editor: ICodeEditor): TPromise<any> {
		return TPromise.wrap(this.runAsync(accessor, editor));
	}

	private async runAsync(accessor: ServicesAccessor, editor: ICodeEditor): Promise<any> {
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
