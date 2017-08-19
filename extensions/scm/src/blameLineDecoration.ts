/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { BlameHunk } from './repository';
import { getResourceInfo } from './repositoryMap';
import { flatten, SELECTION_DEBOUNCE_WAIT_MSEC } from './util';
import { Disposable } from './util/lifecycle';
import { debounce } from 'lodash';
import * as date from 'date-fns';
import { formatBlameDecorationHoverMessage } from './blame';

/**
 * Creates the blame line decoration and associated listeners.
 */
export function create(): vscode.Disposable {
	return new BlameLineDecorator();
}

type Decoration = {
	editor: vscode.TextEditor;
	range: vscode.Range;
	hunk: BlameHunk;
};

/**
 * Displays an after-line decoration with blame information for all selections in visible
 * text editors.
 */
class BlameLineDecorator extends Disposable {

	private blameLineDecoration = this._register(vscode.window.createTextEditorDecorationType({
		isWholeLine: true,
		after: {
			margin: '0 0 0 40px',
		},
		dark: {
			after: {
				color: 'rgba(255, 255, 255, 0.35)',
			},
		},
		light: {
			after: {
				color: 'rgba(0, 0, 0, 0.35)',
			},
		},
	}));

	/**
	 * Editors that we have set decorations on. Managing this list is not necessary for
	 * correctness but it does let us improve performance by detecting when a selection
	 * change does not require the visible decorations to change.
	 */
	private visibleDecorations: Decoration[] = [];

	private operation: vscode.CancellationTokenSource | undefined;

	private enabled: boolean;
	private blameFileEnabled: boolean;

	constructor() {
		super();
		this.registerListeners();

		this.debouncedUpdate = debounce(this.debouncedUpdate, SELECTION_DEBOUNCE_WAIT_MSEC, { leading: true, trailing: true });

		this.onDidChangeConfiguration();
	}

	private registerListeners(): void {
		this._register(vscode.workspace.onDidChangeConfiguration(() => this.onDidChangeConfiguration()));
		this._register(vscode.window.onDidChangeVisibleTextEditors(editors => this.onDidChangeVisibleEditors(editors)));
		this._register(vscode.window.onDidChangeTextEditorSelection(event => this.onDidChangeSelection(event)));
	}

	private onDidChangeConfiguration(): void {
		const config = vscode.workspace.getConfiguration('scm');
		const enabled = !!config.get<boolean>('blame.lines');
		const blameFileEnabled = !!config.get<boolean>('blame.file');
		if (this.enabled === enabled && this.blameFileEnabled === blameFileEnabled) {
			return;
		}
		this.enabled = enabled;
		this.blameFileEnabled = blameFileEnabled;

		this.debouncedUpdate();
	}

	private onDidChangeVisibleEditors(editors: vscode.TextEditor[]): void {
		const isVisible = (editor: vscode.TextEditor): boolean => {
			return editors.indexOf(editor) !== -1;
		};

		this.visibleDecorations = this.visibleDecorations.filter(({ editor }) => isVisible(editor));
	}

	private onDidChangeSelection(event: vscode.TextEditorSelectionChangeEvent): void {
		if (this.operation && !this.operation.token.isCancellationRequested) {
			this.operation.cancel();
		}

		// Remove visible decorations immediately if we can determine now that our new
		// selection will result in them being hidden.
		const visibleDecorations = this.visibleDecorations.filter(({ editor }) => editor === event.textEditor);
		const keepDecorations = this.visibleDecorations.filter(d => {
			return event.selections.some(sel => !!sel.intersection(d.range));
		});
		if (visibleDecorations.length !== keepDecorations.length) {
			this.setDecorations(event.textEditor, keepDecorations);
		}

		this.debouncedUpdate();
	}

	private debouncedUpdate(): void {
		if (!this.enabled) {
			for (const editor of vscode.window.visibleTextEditors) {
				this.setDecorations(editor, []);
			}
			return;
		}

		const tokenSource = new vscode.CancellationTokenSource();
		this.operation = tokenSource;

		const onDone = () => {
			this.operation = undefined;
		};
		this.updateAndRender(tokenSource.token)
			.then(onDone, onDone);
	}

	private computeDecorationsForEditor(editor: vscode.TextEditor, token: vscode.CancellationToken): Thenable<Decoration[]> {
		if (token && token.isCancellationRequested) {
			return Promise.resolve([]);
		}

		const resource = editor.document.uri;

		const info = getResourceInfo(resource);
		if (!info) {
			return Promise.resolve([]);
		}

		return Promise.all(editor.selections.map(selection => {
			return info.repo.blame(editor.document, selection).then(hunks => {
				return hunks.map<Decoration>(hunk => {
					// Clip hunk range so we only add the decoration after lines that are selected.
					const clippedRange = hunk.range.intersection(selection);
					if (!clippedRange) {
						throw new Error();
					}
					return { editor, range: clippedRange, hunk };
				});
			});
		})).then(flatten);
	}

	private updateAndRender(token: vscode.CancellationToken): Thenable<void> {
		return Promise.all(vscode.window.visibleTextEditors.map(editor => {
			return this.computeDecorationsForEditor(editor, token).then(decorations => {
				if (token && token.isCancellationRequested) {
					return;
				}

				this.setDecorations(editor, decorations);
			});
		})).then(() => { });
	}

	private setDecorations(editor: vscode.TextEditor, decorations: Decoration[]): void {
		this.visibleDecorations = this.visibleDecorations.filter(d => d.editor !== editor);
		this.visibleDecorations.push(...decorations);

		editor.setDecorations(this.blameLineDecoration, decorations.map(d => {
			let contentText: string;
			if (this.blameFileEnabled) {
				// Don't show the timestamp and message because the before-line file blame
				// decoration already shows that information.
				contentText = `${d.hunk.commit.author} ${d.hunk.commit.authorMail || ''}`;
			} else {
				contentText = `${d.hunk.commit.author}, ${date.distanceInWordsStrict(Date.now(), d.hunk.commit.authorTime)} ago ● ${d.hunk.commit.summary}`;
			}

			return {
				range: new vscode.Range(d.range.end.line, Number.MAX_SAFE_INTEGER, d.range.end.line, Number.MAX_SAFE_INTEGER),
				hoverMessage: this.blameFileEnabled ? undefined : formatBlameDecorationHoverMessage(d.hunk),
				renderOptions: {
					after: {
						contentText,
					},
				},
			} as vscode.DecorationOptions;
		}));
	}
}
