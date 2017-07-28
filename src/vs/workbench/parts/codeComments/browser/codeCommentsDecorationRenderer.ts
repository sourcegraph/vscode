/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { OverviewRulerLane, ICommonCodeEditor, IDecorationOptions } from 'vs/editor/common/editorCommon';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ICodeCommentsService } from 'vs/editor/common/services/codeCommentsService';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';

const DECORATION_KEY = 'codeComment';

/**
 * DecorationRenderer is responsible for decorating the text editor
 * with indications of comments. This may include highlighting ranges
 * as well as a comment icon in the left gutter or glyph margin.
 */
export class CodeCommentsDecorationRenderer extends Disposable {

	private toDisposeOnEditorRemove = new Map<string, IDisposable>();

	constructor(
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@ISCMService private scmService: ISCMService,
	) {
		super();
		this._register(this.codeEditorService.onCodeEditorAdd(editor => {
			this.toDisposeOnEditorRemove.set(editor.getId(), editor.onDidChangeModel(e => this.renderEditorDecorations(editor)));
		}));
		this._register(this.codeEditorService.onCodeEditorRemove(e => {
			const sub = this.toDisposeOnEditorRemove.get(e.getId());
			if (sub) {
				this.toDisposeOnEditorRemove.delete(e.getId());
				sub.dispose();
			}
		}));

		this.scmService.onDidChangeProvider(e => this.renderDecorations());

		const gutterIconPath = URI.parse(require.toUrl('./media/comment.svg')).fsPath;
		codeEditorService.registerDecorationType(DECORATION_KEY, {
			backgroundColor: 'rgba(255, 0, 0, 0.5)',
			overviewRulerLane: OverviewRulerLane.Full,
			overviewRulerColor: 'rgba(255, 0, 0, 0.5)',
			gutterIconPath: gutterIconPath,
			gutterIconSize: 'contain',
		});

		// TODO: use event or remove it
		this._register(codeCommentsService.onCommentsDidChange(e => this.renderDecorations()));
	}

	public getId(): string {
		return 'sg.codeComments.decorationRenderer';
	}

	private renderDecorations(): void {
		this.codeEditorService.listCodeEditors().map(this.renderEditorDecorations, this);
	}

	private renderEditorDecorations(editor: ICommonCodeEditor) {
		const model = editor.getModel();
		if (!model) {
			return;
		}
		if (model.getLineCount() < 1) {
			return;
		}
		this.codeCommentsService.getThreads(model.uri).then(threads => {
			const decorations: IDecorationOptions[] = threads.map(thread => ({ range: thread.range }));
			editor.setDecorations(DECORATION_KEY, decorations);
		}, err => {
			// Ignore errors.
			// This commonly happens if decorations are requested before a scm provider is registered.
			// Decorations will be re-rendered when the scm provider becomes available.
		});
	}
}