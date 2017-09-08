/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { ICommonCodeEditor, IModel, OverviewRulerLane, IDecorationOptions, IEditorContribution } from 'vs/editor/common/editorCommon';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeCommentsService, IThreadComments, IFileComments, IDraftThreadComments } from 'vs/editor/common/services/codeCommentsService';
import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import * as colors from 'vs/platform/theme/common/colorRegistry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ICodeEditor, MouseTargetType } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ThreadCommentsWidget } from 'vs/workbench/parts/codeComments/electron-browser/threadCommentsWidget';
import { keys } from 'vs/base/common/map';
import { DraftThreadCommentsWidget } from 'vs/workbench/parts/codeComments/electron-browser/draftThreadCommentsWidget';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

/**
 * Decoration key for highlighting a comment range.
 */
const HIGHLIGHT_DECORATION_KEY = 'codeCommentHighlight';

/**
 * Decoration key for the gutter icon that indicates a comment exists on a line.
 */
const GUTTER_ICON_DECORATION_KEY = 'codeCommentGutterIcon';

/**
 * Responsible for decorating the editor with indications of comments
 * and rendering comment thread widgets inside of editors.
 */
@editorContribution
export class CodeCommentsController extends Disposable implements IEditorContribution {
	private static readonly ID = 'editor.contrib.codeCommentsController';

	public static get(editor: ICommonCodeEditor): CodeCommentsController {
		return editor.getContribution<CodeCommentsController>(CodeCommentsController.ID);
	}

	/**
	 * Map of threads by the starting line number of their range.
	 */
	private threadsByLine = new Map<number, IThreadComments[]>();

	/**
	 * Map of draftThreads by the starting line number of their range.
	 */
	private draftThreadsByLine = new Map<number, IDraftThreadComments[]>();

	/**
	 * Objects that need to be disposed when the editor's model changes.
	 */
	private toDisposeOnModelChange: IDisposable[] = [];

	/**
	 * The comment model for this editor.
	 */
	private fileComments: IFileComments;

	/**
	 * Map of open thread widgets by thread id.
	 */
	private openThreadWidgets = new Map<number, ThreadCommentsWidget>();

	/**
	 * Map of open draft thread widgets by thread id.
	 */
	private openDraftThreadWidgets = new Map<number, DraftThreadCommentsWidget>();

	constructor(
		private editor: ICodeEditor,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ICodeEditorService private codeEditorService: ICodeEditorService,
		@IThemeService private themeService: IThemeService,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@ITelemetryService private telemetryService: ITelemetryService,
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
			if (e.target.type !== MouseTargetType.GUTTER_GLYPH_MARGIN) {
				// Not clicking on the gutter.
				return;
			}

			const threads = this.threadsByLine.get(e.target.position.lineNumber) || [];
			const draftThreads = this.draftThreadsByLine.get(e.target.position.lineNumber) || [];
			const matches = threads.length + draftThreads.length;
			if (!matches) {
				return;
			}
			if (matches > 1) {
				console.warn('multiple matches; choosing one');
				// TODO(nick): show a context menu to select which thread to open.
				// For now we can just fall through and arbitrarily show the first one.
				// contextMenuService.showContextMenu({
				// });
			}

			if (draftThreads.length) {
				const draftThread = draftThreads[0];
				const draftThreadWidget = this.openDraftThreadWidgets.get(draftThread.id);
				if (!draftThreadWidget) {
					this.showDraftThreadWidget(draftThread, true);
				} else {
					this.hideDraftThreadWidget(draftThread, draftThreadWidget);
				}
			} else {
				const thread = threads[0];
				const threadWidget = this.openThreadWidgets.get(thread.id);
				if (!threadWidget) {
					this.showThreadWidget(thread, true);
				} else {
					this.hideThreadWidget(thread, threadWidget);
				}
			}
		}));

		// Render decorations on each model change, and do first render.
		this._register(editor.onDidChangeModel(e => this.onDidChangeModel()));
		this.onDidChangeModel();
	}

	public showThreadWidget(thread: IThreadComments, reveal: boolean): void {
		const openThreadWidget = this.openThreadWidgets.get(thread.id);
		if (openThreadWidget) {
			openThreadWidget.expand(reveal);
			return;
		}
		this.telemetryService.publicLog('codeComments.viewThread', { codeComments: { commentCount: thread.comments.length } });
		const threadWidget = this.instantiationService.createInstance(ThreadCommentsWidget, this.editor, thread);
		this.openThreadWidgets.set(thread.id, threadWidget);
		threadWidget.expand(reveal);

		// Update highlights.
		this.renderCurrentModelDecorations();
	}

	private hideThreadWidget(thread: IThreadComments, threadWidget: ThreadCommentsWidget): void {
		this.openThreadWidgets.delete(thread.id);
		threadWidget.dispose();
		// Update highlights.
		this.renderCurrentModelDecorations();
	}

	public showDraftThreadWidget(draftThread: IDraftThreadComments, reveal: boolean): void {
		const openDraftThreadWidget = this.openDraftThreadWidgets.get(draftThread.id);
		if (openDraftThreadWidget) {
			openDraftThreadWidget.expand(reveal);
			return;
		}
		const draftThreadWidget = this.instantiationService.createInstance(DraftThreadCommentsWidget, this.editor, draftThread);
		const disposable = draftThread.onDidSubmit(thread => {
			this.hideDraftThreadWidget(draftThread, draftThreadWidget);
			this.showThreadWidget(thread, true);
		});
		draftThreadWidget.onWillDispose(() => {
			disposable.dispose();
		});
		this.openDraftThreadWidgets.set(draftThread.id, draftThreadWidget);
		draftThreadWidget.expand(reveal);

		// Update highlights.
		this.renderCurrentModelDecorations();
	}

	private hideDraftThreadWidget(draftThread: IDraftThreadComments, draftThreadWidget: DraftThreadCommentsWidget): void {
		this.openDraftThreadWidgets.delete(draftThread.id);
		draftThreadWidget.dispose();
		// Update highlights.
		this.renderCurrentModelDecorations();
	}

	public dispose() {
		this.disposeOnModelChange();
		super.dispose();
	}

	private disposeOnModelChange(): void {
		this.toDisposeOnModelChange = dispose(this.toDisposeOnModelChange);
		this.openThreadWidgets.forEach(w => w.dispose());
		this.openDraftThreadWidgets.forEach(w => w.dispose());
	}

	public getId(): string {
		return CodeCommentsController.ID;
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
		this.disposeOnModelChange();
		const model = this.getEditorModel();
		if (model) {
			this.fileComments = this.codeCommentsService.getFileComments(model.uri);
			// Any time an editors model changes, initiate a refresh of the data.
			this.fileComments.refreshThreads();
			// Render decorations any time threads change (e.g. one was created, or data was fetched from network).
			this.toDisposeOnModelChange.push(this.fileComments.onDidChangeThreads(() => this.renderDecorations(model)));
			this.toDisposeOnModelChange.push(this.fileComments.onDidChangeDraftThreads(() => this.renderDecorations(model)));
			this.renderDecorations(model);
		}
	}

	/**
	 * Returns the current editor model to decorate,
	 * or undefined if there is none.
	 */
	private getEditorModel(): IModel | undefined {
		const model = this.editor.getModel();
		return model && model.getLineCount() > 0 && model.uri.scheme === Schemas.file && model;
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
		const threads = this.fileComments.threads.filter(t => !!t.displayRange);
		const draftThreads = this.fileComments.draftThreads;

		this.threadsByLine = index(threads, thread => thread.displayRange.startLineNumber);
		this.draftThreadsByLine = index(draftThreads, thread => thread.displayRange.startLineNumber);

		const expandedThreadRanges = threads.filter(thread => this.openThreadWidgets.has(thread.id)).map(thread => thread.displayRange);
		const expandedDraftThreadRanges = draftThreads.filter(thread => this.openDraftThreadWidgets.has(thread.id)).map(thread => thread.displayRange);

		const highlights: IDecorationOptions[] = expandedThreadRanges.concat(expandedDraftThreadRanges).map(range => ({ range }));
		this.editor.setDecorations(HIGHLIGHT_DECORATION_KEY, highlights);

		const threadRanges = threads.map(thread => thread.displayRange.collapseToStart());
		const draftThreadRanges = draftThreads.map(thread => thread.displayRange.collapseToStart());

		const gutterIcons: IDecorationOptions[] = threadRanges.concat(draftThreadRanges).map(range => ({ range }));
		this.editor.setDecorations(GUTTER_ICON_DECORATION_KEY, gutterIcons);
	}

	public saveViewState(): ViewState {
		return {
			openThreadIds: keys(this.openThreadWidgets),
			openDraftThreadIds: keys(this.openDraftThreadWidgets),
		};
	}

	public restoreViewState(state?: ViewState): void {
		const openThreadIds = (state && state.openThreadIds) || [];
		for (const threadId of openThreadIds) {
			const thread = this.fileComments.getThread(threadId);
			if (thread) {
				this.showThreadWidget(thread, false);
				continue;
			}
		}

		const openDraftThreadIds = (state && state.openDraftThreadIds) || [];
		for (const threadId of openDraftThreadIds) {
			const thread = this.fileComments.getDraftThread(threadId);
			if (thread) {
				this.showDraftThreadWidget(thread, false);
			}
		}
	}
}

/**
 * Returns a map that indexes the elements of an array by a key.
 */
function index<K, V>(values: V[], getKey: (value: V) => K): Map<K, V[]> {
	return values.reduce((indexedValues, value) => {
		const key = getKey(value);
		let values = indexedValues.get(key);
		if (!values) {
			values = [];
			indexedValues.set(key, values);
		}
		values.push(value);
		return indexedValues;
	}, new Map<K, V[]>());
}

export interface ViewState {
	openThreadIds?: number[];
	openDraftThreadIds?: number[];
}