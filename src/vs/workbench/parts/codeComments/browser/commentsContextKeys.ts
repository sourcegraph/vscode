/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { Disposable } from 'vs/base/common/lifecycle';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { anyEvent } from 'vs/base/common/event';
import { IAuthService } from 'vs/platform/auth/common/auth';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';

export namespace CommentsContextKeys {
	/**
	 * True if code comments are available in the current context.
	 */
	export const canComment = new RawContextKey<boolean>('canComment', false);
}

/**
 * Manages the state of code comments context keys.
 */
export class CommentsContextKeyManager extends Disposable implements IEditorContribution {

	public getId(): string {
		return 'editor.contrib.codeCommentsContextKeys';
	}

	private canComment: IContextKey<boolean>;

	public constructor(
		private editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ISCMService private scmService: ISCMService,
		@IAuthService private authService: IAuthService,
	) {
		super();
		this.canComment = CommentsContextKeys.canComment.bindTo(contextKeyService);

		this._register(authService.onDidChangeCurrentUser(() => this.checkCanComment()));
		this._register(editor.onDidChangeModel(() => this.checkCanComment()));
		this._register(anyEvent(
			scmService.onDidAddRepository,
			scmService.onDidRemoveRepository,
			scmService.onDidChangeRepository
		)(this.checkCanComment, this));
		this.checkCanComment();
	}

	private checkCanComment(): void {
		this.canComment.set(this.getCanComment());
	}

	private getCanComment(): boolean {
		const authed = this.authService.currentUser && this.authService.currentUser.currentOrgMember;
		if (!authed) {
			return false;
		}
		const model = this.editor.getModel();
		if (!model) {
			return false;
		}
		const repository = this.scmService.getRepositoryForResource(model.uri);
		// TODO(nick): also prevent code comments for selections that contain code that hasn't been pushed.
		return !!repository && !!repository.provider && repository.provider.contextValue === 'git';
	}
}
registerEditorContribution(CommentsContextKeyManager);