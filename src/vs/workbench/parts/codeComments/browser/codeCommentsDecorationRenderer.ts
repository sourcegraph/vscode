/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { OverviewRulerLane, IDecorationOptions, IEditorContribution } from 'vs/editor/common/editorCommon';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeCommentsService, Thread, IThread } from 'vs/editor/common/services/codeCommentsService';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';
import { isFileLikeResource } from 'vs/platform/files/common/files';
import { buttonBackground } from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';

const HIGHLIGHT_DECORATION_KEY = 'codeCommentHighlight';
const GUTTER_ICON_DECORATION_KEY = 'codeCommentGutterIcon';

/**
 * DecorationRenderer is responsible for decorating the text editor
 * with indications of comments. This may include highlighting ranges
 * as well as a comment icon in the left gutter or glyph margin.
 */
@editorContribution
export class CodeCommentsDecorationRenderer extends Disposable implements IEditorContribution {

	private threads: Thread[] = [];

	constructor(
		private editor: ICodeEditor,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@ISCMService scmService: ISCMService,
		@IThemeService themeService: IThemeService,
	) {
		super();

		const color = themeService.getTheme().getColor(buttonBackground).toString();
		codeEditorService.registerDecorationType(HIGHLIGHT_DECORATION_KEY, {
			backgroundColor: color,
			overviewRulerLane: OverviewRulerLane.Full,
			overviewRulerColor: color,
		});

		const gutterIconPath = URI.parse(require.toUrl('./media/comment.svg')).fsPath;
		codeEditorService.registerDecorationType(GUTTER_ICON_DECORATION_KEY, {
			gutterIconPath: gutterIconPath,
			gutterIconSize: 'contain',
		});

		scmService.onDidChangeProvider(e => this.renderDecorations());
		this._register(editor.onDidChangeModel(e => this.renderDecorations()));
		this._register(codeCommentsService.onCommentsDidChange(() => this.renderDecorations()));
		this.renderDecorations();
	}

	public getId(): string {
		return 'sg.codeComments.decorationRenderer';
	}

	private renderDecorations(): void {
		const model = this.editor.getModel();
		if (!model) {
			return;
		}
		if (model.getLineCount() < 1) {
			return;
		}
		if (!isFileLikeResource(model.uri)) {
			return;
		}
		this.codeCommentsService.getThreads(model.uri, false).then(threads => {
			this.renderThreads(threads);
		}, err => {
			// Ignore errors.
			// This commonly happens if decorations are requested before a scm provider is registered.
			// Decorations will be re-rendered when the scm provider becomes available.
		});
	}

	private renderThreads(threads: Thread[]): void {
		this.threads = threads;

		const highlights: IDecorationOptions[] = threads.map(thread => ({ range: thread.range }));
		this.editor.setDecorations(HIGHLIGHT_DECORATION_KEY, highlights);

		const gutterIcons: IDecorationOptions[] = threads.map(thread => ({ range: thread.range.collapseToStart() }));
		this.editor.setDecorations(GUTTER_ICON_DECORATION_KEY, gutterIcons);
	}

	public saveViewState?(): ViewState {
		return {
			threads: this.threads,
		};
	}

	public restoreViewState?(state: ViewState): void {
		if (state && state.threads) {
			this.renderThreads(state.threads.map(thread => new Thread(thread)));
		}
	}
}

export interface ViewState {
	threads?: IThread[];
}