/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { BlameHunk } from './repository';
import { getResourceInfo } from './repositoryMap';
import { Disposable } from './util/lifecycle';
import * as date from 'date-fns';
import { padRightOrTruncate, SELECTION_DEBOUNCE_WAIT_MSEC } from './util';
import { formatBlameDecorationHoverMessage } from './blame';
import { debounce } from 'lodash';

export const toggleFileBlameCommand = 'scm.action.blame.toggleFile';

/**
 * Creates the blame file decoration and associated listeners.
 */
export function create(): vscode.Disposable {
	return new BlameFileDecorator();
}

type Decoration = {
	editor: vscode.TextEditor;
	hunks: BlameHunk[];
	selections: vscode.Selection[];
};

/**
 * Displays a decoration before each line in the file with blame information.
 */
class BlameFileDecorator extends Disposable {

	/**
	 * The number of columns for the before-line decoration to be displayed in.
	 */
	private static DECORATION_LENGTH = 50;

	private static blameFileDecorationCommon: vscode.DecorationRenderOptions = {
		isWholeLine: true,
		before: {
			margin: '0 10px 0 10px',
			height: '100%',
			textDecoration: 'none',
		},
	};

	private blameFileActiveDecoration = this._register(vscode.window.createTextEditorDecorationType({
		...BlameFileDecorator.blameFileDecorationCommon,
		dark: {
			before: {
				backgroundColor: 'rgba(45, 185, 210, 0.3)',
				color: 'rgba(255, 255, 255, 0.7)',
			},
		},
		light: {
			before: {
				backgroundColor: 'rgba(45, 185, 210, 0.3)',
				color: 'rgba(0, 0, 0, 0.7)',
			},
		},
		overviewRulerLane: vscode.OverviewRulerLane.Right,
		overviewRulerColor: 'rgba(45, 185, 210, 0.8)',
	}));

	private blameFileInactiveDecoration = this._register(vscode.window.createTextEditorDecorationType({
		...BlameFileDecorator.blameFileDecorationCommon,
		dark: {
			before: {
				backgroundColor: 'rgba(45, 185, 210, 0.15)',
				color: 'rgba(255, 255, 255, 0.5)',
			},
		},
		light: {
			before: {
				backgroundColor: 'rgba(45, 185, 210, 0.15)',
				color: 'rgba(0, 0, 0, 0.5)',
			},
		},
	}));

	/**
	 * Editors that we have set decorations on. Managing this list is not necessary for
	 * correctness but it does let us improve performance by skipping
	 * TextEditor.setDecorations calls when they're not needed.
	 */
	private visibleDecorations: Decoration[] = [];

	private enabled: boolean;

	constructor() {
		super();

		this.debouncedUpdate = debounce(this.debouncedUpdate, SELECTION_DEBOUNCE_WAIT_MSEC, { leading: true, trailing: true });

		this.registerListeners();

		this.onDidChangeConfiguration();

		this._register(vscode.commands.registerCommand(toggleFileBlameCommand, () => {
			const config = vscode.workspace.getConfiguration('scm');
			config.update('blame.file', !config.get<boolean>('blame.file'), vscode.ConfigurationTarget.Global);
		}));
	}

	private registerListeners(): void {
		this._register(vscode.workspace.onDidChangeConfiguration(() => this.onDidChangeConfiguration()));
		this._register(vscode.window.onDidChangeVisibleTextEditors(editors => this.onDidChangeVisibleEditors(editors)));
		this._register(vscode.window.onDidChangeTextEditorSelection(event => this.onDidChangeSelection(event)));
		this._register(vscode.workspace.onDidChangeTextDocument(event => this.onDidChangeTextDocument(event)));
	}

	private onDidChangeConfiguration(): void {
		const enabled = !!vscode.workspace.getConfiguration('scm').get<boolean>('blame.file');
		if (this.enabled === enabled) {
			return;
		}
		this.enabled = enabled;

		this.decorateAll();
	}

	private onDidChangeSelection(event: vscode.TextEditorSelectionChangeEvent): void {
		if (this.shouldDecorate(event.textEditor) && this.decorationSelectionIsStale(event.textEditor)) {
			this.debouncedUpdate(event.textEditor);
		}
	}

	private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
		if (this.shouldDecorate(event.document)) {
			const editor = vscode.window.visibleTextEditors.find(editor => editor.document === event.document && editor.viewColumn !== undefined);
			if (editor) {
				this.debouncedUpdate(editor, true);
			}
		}
	}

	private debouncedUpdate(editor: vscode.TextEditor, force?: boolean): void {
		if (!this.shouldDecorate(editor)) {
			return;
		}

		// Confirm again that the decoration is stale; it might have become fresh during
		// our debounce delay.
		if (!force && !this.decorationSelectionIsStale(editor)) {
			return;
		}

		this.decorate(editor);
	}

	/**
	 * Returns whether the rendered decoration for the editor needs to be updated to
	 * reflect the current selection.
	 */
	private decorationSelectionIsStale(editor: vscode.TextEditor): boolean {
		const decorations = this.visibleDecorations.filter(d => d.editor === editor);
		return decorations.length === 0 || decorations.some(d => !selectionsContainSameLineSet(d.selections, editor.selections));
	}

	/**
	 * Returns whether this editor or document should be decorated with file blame
	 * information.
	 */
	private shouldDecorate(editor: vscode.TextEditor): boolean;
	private shouldDecorate(doc: vscode.TextDocument): boolean;
	private shouldDecorate(arg: any): boolean {
		if (arg.document) {
			const editor = arg as vscode.TextEditor;
			return vscode.window.visibleTextEditors.includes(editor) && editor.viewColumn !== undefined;
		}

		const doc = arg as vscode.TextDocument;
		return vscode.window.visibleTextEditors.some(editor => editor.document === doc && editor.viewColumn !== undefined);
	}

	private onDidChangeVisibleEditors(editors: vscode.TextEditor[]): void {
		this.visibleDecorations = this.visibleDecorations.filter(d => this.shouldDecorate(d.editor));
		this.decorateAll();
	}

	private decorateAll(token?: vscode.CancellationToken): Thenable<void> {
		if (!this.enabled) {
			for (const editor of vscode.window.visibleTextEditors) {
				this.setDecorations(editor, undefined);
			}
			return Promise.resolve();
		}

		return Promise.all(
			vscode.window.visibleTextEditors
				.filter(editor => this.shouldDecorate(editor))
				.map(editor => this.decorate(editor, token)),
		).then(() => { });
	}

	private decorate(editor: vscode.TextEditor, token?: vscode.CancellationToken): Thenable<void> {
		return this.computeDecorationsForEditor(editor, token).then(decoration => {
			if (token && token.isCancellationRequested) {
				return;
			}

			this.setDecorations(editor, decoration);
		});
	}

	private computeDecorationsForEditor(editor: vscode.TextEditor, token?: vscode.CancellationToken): Thenable<Decoration | undefined> {
		if (token && token.isCancellationRequested) {
			return Promise.resolve(undefined);
		}

		if (!this.enabled) {
			return Promise.resolve(undefined);
		}

		const info = getResourceInfo(editor.document.uri);
		if (!info) {
			return Promise.resolve(undefined);
		}

		return info.repo.blame(editor.document).then(hunks => {
			return {
				editor,
				selections: editor.selections,
				hunks,
			};
		});
	}

	private setDecorations(editor: vscode.TextEditor, decoration: Decoration | undefined): void {
		this.visibleDecorations = this.visibleDecorations.filter(d => d.editor !== editor);
		if (decoration) {
			this.visibleDecorations.push(decoration);
		}

		const decorationOptionsActive: vscode.DecorationOptions[] = [];
		const decorationOptionsInactive: vscode.DecorationOptions[] = [];
		if (decoration) {
			const activeHunkSHAs = new Set<string>();
			for (const hunk of decoration.hunks) {
				if (editor.selections.some(sel => !!sel.intersection(hunk.range))) {
					activeHunkSHAs.add(hunk.commit.sha);
				}
			}

			for (const hunk of decoration.hunks) {
				for (let line = hunk.line; line < hunk.line + hunk.lineCount; line++) {
					const isFirstLineOfHunk = line === hunk.line;
					const opts: vscode.DecorationOptions = {
						range: new vscode.Range(line, 0, line, 0),
						hoverMessage: formatBlameDecorationHoverMessage(hunk),
						renderOptions: {
							before: {
								contentText: isFirstLineOfHunk ? formatLineDecorationText(hunk, BlameFileDecorator.DECORATION_LENGTH) : NONBREAKING_SPACE.repeat(BlameFileDecorator.DECORATION_LENGTH),
							},
						},
					};

					const isActive = activeHunkSHAs.has(hunk.commit.sha);
					if (isActive) {
						decorationOptionsActive.push(opts);
					} else {
						decorationOptionsInactive.push(opts);
					}
				}
			}
		}

		editor.setDecorations(this.blameFileActiveDecoration, decorationOptionsActive);
		editor.setDecorations(this.blameFileInactiveDecoration, decorationOptionsInactive);
	}
}

function formatLineDecorationText(hunk: BlameHunk, maxLength: number): string {
	const padding = NONBREAKING_SPACE;
	const separator = NONBREAKING_SPACE.repeat(4);

	let remainingLength = maxLength - 2 * padding.length - separator.length;

	const rightText = date.distanceInWordsStrict(Date.now(), hunk.commit.authorTime) + ' ago';
	remainingLength -= rightText.length;

	const leftText = padRightOrTruncate(hunk.commit.summary || '', remainingLength);

	return padding + leftText + separator + rightText + padding;
}

const NONBREAKING_SPACE = '\u00a0';

/**
 * Returns whether a and b touch the same set of lines. A selection from line 3 to line 5
 * is defined as touching lines 3, 4, and 5.
 */
function selectionsContainSameLineSet(a: vscode.Selection[], b: vscode.Selection[]): boolean {
	const linesTouched = (selections: vscode.Selection[]): number[] => {
		const lines: number[] = [];
		for (const sel of selections) {
			for (let line = sel.start.line; line <= sel.end.line; line++) {
				lines.push(line);
			}
		}
		return lines.filter((line, i) => lines.indexOf(line) === i).sort();
	};

	const aLines = linesTouched(a);
	const bLines = linesTouched(b);
	return aLines.length === bLines.length && aLines.every((line, i) => line === bLines[i]);
}