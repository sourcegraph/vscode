/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IModel, OverviewRulerLane, IDecorationOptions, IEditorContribution } from 'vs/editor/common/editorCommon';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeCommentsService, Thread } from 'vs/editor/common/services/codeCommentsService';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import URI from 'vs/base/common/uri';
import { isFileLikeResource } from 'vs/platform/files/common/files';
import * as colors from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ICodeCommentsViewlet } from 'vs/workbench/parts/codeComments/common/codeComments';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { VIEWLET_ID as CODE_COMMENTS_VIEWLET_ID } from 'vs/workbench/parts/codeComments/common/constants';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

/**
 * Decoration key for highlighting a comment range.
 */
const HIGHLIGHT_DECORATION_KEY = 'codeCommentHighlight';

/**
 * Decoration key for the gutter icon that indicates a comment exists on a line.
 */
const GUTTER_ICON_DECORATION_KEY = 'codeCommentGutterIcon';

/**
 * DecorationRenderer is responsible for decorating the text editor
 * with indications of comments. This may include highlighting ranges
 * as well as a comment icon in the left gutter or glyph margin.
 */
@editorContribution
export class CodeCommentsDecorationRenderer extends Disposable implements IEditorContribution {

	/**
	 * Map of threads by starting line number of their range.
	 * There may be more than one thread on a given line but we only store one.
	 * This is used to detect if the user is clicking on a gutter icon.
	 */
	private gutterIconLines = new Map<number, Thread>();

	/**
	 * Objects that need to be disposed when the editor's model changes.
	 */
	private disposeOnModelChange: IDisposable[] = [];

	constructor(
		private editor: ICodeEditor,
		@IViewletService viewletService: IViewletService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ISCMService scmService: ISCMService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@IThemeService private themeService: IThemeService,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
	) {
		super();

		this._register(themeService.onThemeChange(t => this.onThemeChange()));
		this.onThemeChange();

		const gutterIconPath = URI.parse(require.toUrl('./media/comment.svg')).fsPath;
		codeEditorService.registerDecorationType(GUTTER_ICON_DECORATION_KEY, {
			gutterIconPath: gutterIconPath,
			gutterIconSize: 'contain',
		});

		this._register(editor.onMouseDown(e => {
			if (!e.target.position) {
				return;
			}

			// TODO(nick): this doesn't handle the case of multiple threads on a single line.
			// If so, we should either open a context menu to select which one (e.g. lightBulbWidget.ts -> quickFixWidget.ts),
			// or filter the threads list down to the threads that are on this line.
			const thread = this.gutterIconLines.get(e.target.position.lineNumber);
			if (!thread || e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN) {
				return;
			}

			// Open the code comments viewlet to a specific thread when the user clicks
			// on a code comments gutter icon.
			viewletService.openViewlet(CODE_COMMENTS_VIEWLET_ID, true)
				.then(viewlet => viewlet as ICodeCommentsViewlet)
				.then(viewlet => viewlet.viewThread(thread.id));
		}));

		// Re-render decorations when the scm service changes because
		// it may not have been ready yet on previous renders and the
		// scm data is necessary for rendering code comments correctly.
		// TODO(nick): it would be nice if ICodeCommentsService abstracted this away.
		scmService.onDidAddRepository(e => this.renderCurrentModelDecorations());
		scmService.onDidRemoveRepository(e => this.renderCurrentModelDecorations());
		scmService.onDidChangeRepository(e => this.renderCurrentModelDecorations());

		// Render decorations any time comments change (e.g. one was created, data was fetched from network).
		this._register(codeCommentsService.onCommentsDidChange(() => this.renderCurrentModelDecorations()));

		// Render decorations on each model change, and do first render.
		this._register(editor.onDidChangeModel(e => this.onDidChangeModel()));
		this.onDidChangeModel();
	}

	public getId(): string {
		return 'sg.codeComments.decorationRenderer';
	}

	private onThemeChange(): void {
		const color = this.getColor(colors.buttonForeground);
		const backgroundColor = this.getColor(colors.buttonBackground);
		const borderColor = this.getColor(colors.contrastBorder);
		const border = borderColor ? `1px solid ${borderColor}` : undefined;

		// We have to re-register the decoration for the new styles to take effect.
		this.codeEditorService.removeDecorationType(HIGHLIGHT_DECORATION_KEY);
		this.codeEditorService.registerDecorationType(HIGHLIGHT_DECORATION_KEY, {
			color,
			backgroundColor,
			border,
			overviewRulerLane: OverviewRulerLane.Full,
			overviewRulerColor: backgroundColor,
		});
		this.renderCurrentModelDecorations();
	}

	/**
	 * Returns the string representation of the theme's color
	 * or undefined if the theme doesn't have that color.
	 */
	private getColor(id: string): string | undefined {
		const theme = this.themeService.getTheme();
		const color = theme.getColor(id);
		return color && color.toString();
	}

	/**
	 * Renders decorations for the current editor model.
	 */
	private onDidChangeModel(): void {
		this.disposeOnModelChange = dispose(this.disposeOnModelChange);
		const model = this.getEditorModel();
		if (model) {
			// Any time an editors model changes, initiate a refresh of the data.
			this.codeCommentsService.refreshThreads(model.uri);

			const fileCommentsModel = this.codeCommentsService.getModel(model.uri);
			fileCommentsModel.onSelectedThreadDidChange(() => {
				// Update the highlighted range.
				this.renderDecorations(model);

				// If there is a selected thread, scroll the user to that part of the active editor.
				// The user can have the same file open in multiple editors, so we only want to
				// scroll the editor that is active.
				const activeEditor = this.editorService.getActiveEditor();
				const control = activeEditor && activeEditor.getControl();
				if (fileCommentsModel.selectedThread && control && this.editor === control) {
					this.editor.revealRangeInCenter(fileCommentsModel.selectedThread.range);
				}
			}, this, this.disposeOnModelChange);
			this.renderDecorations(model);
		}
	}

	/**
	 * Returns the current editor model to decorate,
	 * or undefined if there is none.
	 */
	private getEditorModel(): IModel | undefined {
		const model = this.editor.getModel();
		return model && model.getLineCount() > 0 && isFileLikeResource(model.uri) && model;
	}

	/**
	 * Renders decorations for the current editor model (if there is one).
	 */
	private renderCurrentModelDecorations(): void {
		const model = this.getEditorModel();
		if (model) {
			this.renderDecorations(model);
		}
	}

	/**
	 * Renders a gutter icon on lines that have comment threads, and
	 * renders a highlight of the range for the currently selected thread (if there is one).
	 */
	private renderDecorations(model: IModel): void {
		const threads = this.codeCommentsService.getThreads(model.uri);
		const selectedThread = this.codeCommentsService.getModel(model.uri).selectedThread;

		this.gutterIconLines = threads.reduce((lines, thread) => {
			lines.set(thread.range.startLineNumber, thread);
			return lines;
		}, new Map<number, Thread>());

		const highlights: IDecorationOptions[] = selectedThread ? [{ range: selectedThread.range }] : [];
		this.editor.setDecorations(HIGHLIGHT_DECORATION_KEY, highlights);

		const gutterIcons: IDecorationOptions[] = threads.map(thread => ({ range: thread.range.collapseToStart() }));
		this.editor.setDecorations(GUTTER_ICON_DECORATION_KEY, gutterIcons);
	}
}