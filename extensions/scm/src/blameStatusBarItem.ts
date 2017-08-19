/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { getResourceInfo } from './repositoryMap';
import { toggleFileBlameCommand } from './blameFileDecoration';
import { debounce } from 'lodash';
import { SELECTION_DEBOUNCE_WAIT_MSEC, truncate } from './util';
import * as date from 'date-fns';

const localize = nls.loadMessageBundle();

/**
 * Creates the blame status bar item and associated listeners.
 */
export function create(): vscode.Disposable {
	const disposables: vscode.Disposable[] = [];

	disposables.push(statusBarItem);

	const updateTooltip = () => {
		const config = vscode.workspace.getConfiguration('scm');
		if (config.get<boolean>('blame.file')) {
			statusBarItem.tooltip = localize('scm.hideFileBlame', "Hide File Blame");
		} else {
			statusBarItem.tooltip = localize('scm.showFileBlame', "Show File Blame");
		}
	};
	vscode.workspace.onDidChangeConfiguration(() => updateTooltip(), null, disposables);
	updateTooltip();

	statusBarItem.command = toggleFileBlameCommand;

	vscode.window.onDidChangeActiveTextEditor(editor => {
		if (editor && editor.viewColumn) {
			debouncedUpdate(editor.document, editor.selections);
		} else {
			update(undefined);
		}
	});

	vscode.window.onDidChangeTextEditorSelection(e => {
		if (e.textEditor && e.textEditor === vscode.window.activeTextEditor && e.textEditor.viewColumn) {
			debouncedUpdate(e.textEditor.document, e.selections);
		}
	}, null, disposables);

	return { dispose: () => disposables.forEach(d => d.dispose()) };
}

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);

const debouncedUpdate = debounce(update, SELECTION_DEBOUNCE_WAIT_MSEC, { leading: true, trailing: true });

function update(doc: undefined): void;
function update(doc: vscode.TextDocument, selections: vscode.Selection[]): void;
function update(doc: vscode.TextDocument | undefined, selections?: vscode.Selection[]): void {
	if (!doc || !selections) {
		statusBarItem.hide();
		return;
	}

	const info = getResourceInfo(doc.uri);
	if (!info) {
		statusBarItem.hide();
		return;
	}

	info.repo.blame(doc, selections[0])
		.then(hunks => {
			if (hunks.length === 0) {
				statusBarItem.hide();
				return;
			}

			const hunk = hunks[0];
			statusBarItem.text = `$(git-commit) ${truncate(hunk.commit.author, 20)}, ${date.distanceInWordsStrict(Date.now(), hunk.commit.authorTime)} ago`;
			statusBarItem.show();
		})
		.then(
		() => { },
		err => statusBarItem.hide(),
	);
}