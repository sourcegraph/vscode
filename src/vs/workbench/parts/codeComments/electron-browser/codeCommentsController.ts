/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { ICommonCodeEditor, IModel, OverviewRulerLane, IDecorationOptions, IEditorContribution, TrackedRangeStickiness } from 'vs/editor/common/editorCommon';
import { IDisposable, Disposable, dispose } from 'vs/base/common/lifecycle';
import { ICodeCommentsService, IThreadComments, IFileComments, IDraftThreadComments, EDITOR_CONTRIBUTION_ID } from 'vs/editor/common/services/codeCommentsService';
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
import { Action } from 'vs/base/common/actions';
import { once } from 'vs/base/common/event';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModelWithDecorations';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { ServicesAccessor, CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { IContextKey, IContextKeyService, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { getOuterEditor } from 'vs/editor/contrib/referenceSearch/browser/peekViewWidget';

/**
 * Decoration key for highlighting a comment range.
 */
const HIGHLIGHT_DECORATION_KEY = 'codeCommentHighlight';

/**
 * Decoration key for the gutter icon that indicates a comment exists on a line.
 */
const GUTTER_ICON_DECORATION_OPTIONS = ModelDecorationOptions.register({
	glyphMarginClassName: 'code-comments-gutter-icon',
	stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
});

/**
 * Responsible for decorating the editor with indications of comments
 * and rendering comment thread widgets inside of editors.
 */
@editorContribution
export class CodeCommentsController extends Disposable implements IEditorContribution {

	public static get(editor: ICommonCodeEditor): CodeCommentsController {
		return editor.getContribution<CodeCommentsController>(EDITOR_CONTRIBUTION_ID);
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
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		this.hasOpenWidgets = hasOpenWidgets.bindTo(contextKeyService);

		this._register(themeService.onThemeChange(t => this.onThemeChange()));
		this.onThemeChange();

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

			// HACK to prevent debugEditorContribution from adding
			// a breakpoint when we remove a decoration from the line.
			// See https://github.com/sourcegraph/sourcegraph/issues/7381
			(e.target as any).type = MouseTargetType.UNKNOWN;

			// First attempt to close all widgets on this line.
			if (this.closeAllWidgetsOnLine(e.target.position.lineNumber)) {
				// We closed some widgets, so we are done.
				return;
			}

			// Since we didn't close any widgets, the user wants to open a widget.
			// If there is more than one we show a context menu.
			if (matches > 1) {
				const openDraftThreadActions = draftThreads.map(draftThread => {
					const label = `(Draft) ${draftThread.title}`;
					return new Action(`openDraftThread${draftThread.id}`, label, '', true, () => {
						this.showDraftThreadWidget(draftThread, true);
						return TPromise.as(true);
					});
				});
				const openThreadActions = threads.map(thread => {
					return new Action(`openThread${thread.id}`, thread.title, '', true, () => {
						this.showThreadWidget(thread, true);
						return TPromise.as(true);
					});
				});
				contextMenuService.showContextMenu({
					getAnchor: () => {
						return { x: e.event.posx, y: e.event.posy };
					},
					getActions: () => {
						return TPromise.as(openDraftThreadActions.concat(openThreadActions));
					},
				});
				return;
			}

			// There is only one widget to open on this line, so just open it.
			if (draftThreads.length) {
				const draftThread = draftThreads[0];
				const draftThreadWidget = this.openDraftThreadWidgets.get(draftThread.id);
				if (!draftThreadWidget) {
					this.showDraftThreadWidget(draftThread, true);
				} else {
					draftThreadWidget.dispose();
				}
			} else {
				const thread = threads[0];
				const threadWidget = this.openThreadWidgets.get(thread.id);
				if (!threadWidget) {
					this.showThreadWidget(thread, true);
				} else {
					threadWidget.dispose();
				}
			}
		}));

		// Render decorations on each model change, and do first render.
		this._register(editor.onDidChangeModel(e => this.onDidChangeModel()));
		this.onDidChangeModel();
	}

	public showThreadWidget(thread: IThreadComments, reveal: boolean): void {
		if (!thread.displayRange) {
			this._register(once(thread.onDidChangeDisplayRange)(() => {
				this.showThreadWidget(thread, reveal);
			}));
			return;
		}
		this.closeAllWidgetsOnLine(thread.displayRange.startLineNumber, { exceptThreadId: thread.id });

		const openThreadWidget = this.openThreadWidgets.get(thread.id);
		if (openThreadWidget) {
			openThreadWidget.expand(reveal);
			return;
		}
		this.telemetryService.publicLog('codeComments.viewThread', { codeComments: { commentCount: thread.comments.length } });
		const threadWidget = this.instantiationService.createInstance(ThreadCommentsWidget, this.editor, thread);
		const disposables: IDisposable[] = [];

		thread.onDidChangeArchived(() => {
			if (thread.archived) {
				threadWidget.dispose();
			}
		}, this, disposables);
		thread.onWillDispose(() => threadWidget.dispose(), this, disposables);

		threadWidget.onDidClose(() => {
			this.openThreadWidgets.delete(thread.id);
			this.updateHasOpenWidgets();
			dispose(disposables);
			this.renderCurrentModelDecorations();
			this.editor.focus();
		});

		this.openThreadWidgets.set(thread.id, threadWidget);
		threadWidget.expand(reveal);
		this.updateHasOpenWidgets();

		// Update highlights.
		this.renderCurrentModelDecorations();
	}

	public showDraftThreadWidget(draftThread: IDraftThreadComments, reveal: boolean): void {
		this.closeAllWidgetsOnLine(draftThread.displayRange.startLineNumber, { exceptThreadId: draftThread.id });
		const openDraftThreadWidget = this.openDraftThreadWidgets.get(draftThread.id);
		if (openDraftThreadWidget) {
			openDraftThreadWidget.expand(reveal);
			return;
		}
		const draftThreadWidget = this.instantiationService.createInstance(DraftThreadCommentsWidget, this.editor, draftThread);
		const disposables: IDisposable[] = [];

		draftThread.onDidSubmit(thread => this.showThreadWidget(thread, true), this, disposables);
		draftThread.onWillDispose(() => draftThreadWidget.dispose(), this, disposables);
		draftThreadWidget.onDidClose(() => {
			this.openDraftThreadWidgets.delete(draftThread.id);
			this.updateHasOpenWidgets();
			dispose(disposables);
			this.renderCurrentModelDecorations();
			this.editor.focus();
		});

		this.openDraftThreadWidgets.set(draftThread.id, draftThreadWidget);
		draftThreadWidget.expand(reveal);
		this.updateHasOpenWidgets();

		// Update highlights.
		this.renderCurrentModelDecorations();
	}

	/**
	 * Context key that is true if any widgets are open.
	 */
	private hasOpenWidgets: IContextKey<boolean>;

	private updateHasOpenWidgets(): void {
		this.hasOpenWidgets.set((this.openDraftThreadWidgets.size + this.openThreadWidgets.size) > 0);
	}

	/**
	 * Closes all widgets on the line and returns true if any were closed.
	 */
	private closeAllWidgetsOnLine(line: number, options?: { exceptThreadId?: number, exceptDraftThreadId?: number }): boolean {
		const threads = this.threadsByLine.get(line) || [];
		const draftThreads = this.draftThreadsByLine.get(line) || [];
		let closedWidgets = false;
		for (const thread of threads) {
			if (options && options.exceptThreadId && options.exceptThreadId === thread.id) {
				continue;
			}
			const threadWidget = this.openThreadWidgets.get(thread.id);
			if (threadWidget) {
				threadWidget.dispose();
				closedWidgets = true;
			}
		}
		for (const draftThread of draftThreads) {
			if (options && options.exceptDraftThreadId && options.exceptDraftThreadId === draftThread.id) {
				continue;
			}
			const draftThreadWidget = this.openDraftThreadWidgets.get(draftThread.id);
			if (draftThreadWidget) {
				draftThreadWidget.dispose();
				closedWidgets = true;
			}
		}
		return closedWidgets;
	}

	/**
	 * Closes all open widgets.
	 */
	public closeAllWidgets(): void {
		this.openDraftThreadWidgets.forEach(w => w.dispose());
		this.openThreadWidgets.forEach(w => w.dispose());
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
		return EDITOR_CONTRIBUTION_ID;
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
			this.toDisposeOnModelChange.push(model.onDidChangeContent(e => {
				this.renderDecorations(model);
			}));
			this.renderDecorations(model);
		} else {
			this.fileComments = undefined;
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

	private gutterIcons: string[] = [];

	/**
	 * Renders a gutter icon on lines that have comment threads, and
	 * renders a highlight of the range for the currently selected thread (if there is one).
	 */
	private renderDecorations(model: IModel): void {
		const threads = this.fileComments.threads.filter(t => {
			if (!t.displayRange) {
				// Display range not computed yet.
				return false;
			}
			if (this.openThreadWidgets.get(t.id)) {
				// It is already showing. We need to show the gutter because this is the close button.
				return true;
			}
			return !t.archived;
		});

		const draftThreads = this.fileComments.draftThreads;
		this.threadsByLine = index(threads, thread => thread.displayRange.startLineNumber);
		this.draftThreadsByLine = index(draftThreads, thread => thread.displayRange.startLineNumber);

		const expandedThreadRanges = threads.filter(thread => this.openThreadWidgets.has(thread.id)).map(thread => thread.displayRange);
		const expandedDraftThreadRanges = draftThreads.filter(thread => this.openDraftThreadWidgets.has(thread.id)).map(thread => thread.displayRange);

		const highlights: IDecorationOptions[] = expandedThreadRanges.concat(expandedDraftThreadRanges).map(range => ({ range }));
		// TODO(nick): use deltaDecorations here too
		this.editor.setDecorations(HIGHLIGHT_DECORATION_KEY, highlights);

		const threadRanges = threads.map(thread => thread.displayRange.collapseToStart());
		const draftThreadRanges = draftThreads.map(thread => thread.displayRange.collapseToStart());

		const gutterIcons = threadRanges.concat(draftThreadRanges).map(range => ({ range, options: GUTTER_ICON_DECORATION_OPTIONS }));
		this.gutterIcons = this.editor.deltaDecorations(this.gutterIcons, gutterIcons);
	}

	public saveViewState(): ViewState {
		return {
			openThreadIds: keys(this.openThreadWidgets),
			openDraftThreadIds: keys(this.openDraftThreadWidgets),
		};
	}

	public restoreViewState(state?: ViewState): void {
		if (!this.fileComments) {
			// No model (e.g. untitled file).
			return;
		}
		this.fileComments.refreshThreads().then(() => {
			const openThreadIds = (state && state.openThreadIds) || [];
			for (const threadId of openThreadIds) {
				const thread = this.fileComments.getThread(threadId);
				if (thread) {
					const reveal = thread.id === state.revealThreadId;
					this.showThreadWidget(thread, reveal);
				}
			}

			const openDraftThreadIds = (state && state.openDraftThreadIds) || [];
			for (const threadId of openDraftThreadIds) {
				const thread = this.fileComments.getDraftThread(threadId);
				if (thread) {
					this.showDraftThreadWidget(thread, false);
				}
			}
		});
	}
}

const hasOpenWidgets = new RawContextKey<boolean>('hasOpenWidgets', false);

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeCodeComments',
	weight: CommonEditorRegistry.commandWeight(500),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: hasOpenWidgets,
	handler: (accessor: ServicesAccessor) => {
		const editor = getOuterEditor(accessor);
		if (!editor) {
			return;
		}
		const controller = CodeCommentsController.get(editor);
		controller.closeAllWidgets();
	}
});

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
	revealThreadId?: number;
}