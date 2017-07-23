/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { getLanguage, ReleaseStatus, FeatureCoverage, isPreviewLanguagesEnabled } from './languages';

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);

export function activateLanguageSupportParts(): vscode.Disposable {
	const toDispose: vscode.Disposable[] = [
		statusBarItem,
	];

	vscode.window.visibleTextEditors.forEach(editor => {
		onDidOpenDocumentInLanguage(editor.document.languageId);
	});

	vscode.workspace.onDidOpenTextDocument(doc => {
		onDidOpenDocumentInLanguage(doc.languageId);
	}, null, toDispose);

	vscode.window.onDidChangeActiveTextEditor(editor => {
		onDidFocusDocumentInLanguage(editor ? editor.document.languageId : undefined);
	}, null, toDispose);
	if (vscode.window.activeTextEditor) {
		const editor = vscode.window.activeTextEditor;
		onDidFocusDocumentInLanguage(editor ? editor.document.languageId : undefined);
	}

	return vscode.Disposable.from(...toDispose);
}

const DONT_SHOW_AGAIN = 'Don\'t Show Again';

function onDidOpenDocumentInLanguage(languageId: string): void {
	const lang = getLanguage(languageId);

	const ignoreWarning = vscode.workspace.getConfiguration('lsp').get<string[]>('hideLanguageSupportWarnings', []).indexOf(languageId) !== -1;
	if (ignoreWarning) { return; }

	const handleChoice = (choice: string): void => {
		switch (choice) {
			case DONT_SHOW_AGAIN:
				const value = vscode.workspace.getConfiguration('lsp').get<string[]>('hideLanguageSupportWarnings', []);
				if (value.indexOf(languageId) === -1) {
					value.push(languageId);
					value.sort();
				}
				vscode.workspace.getConfiguration('lsp').update('hideLanguageSupportWarnings', value, true)
					.then(null, err => console.error('Error updating configuration:', err));
		}
	};

	if (lang && ((!isPreviewLanguagesEnabled() && lang.releaseStatus === ReleaseStatus.Preview) || lang.releaseStatus === ReleaseStatus.Unsupported)) {
		vscode.window.showWarningMessage(`${lang.name} is supported for text/regexp search and basic browsing (no advanced language features yet).`, DONT_SHOW_AGAIN).then(handleChoice);
	} else if (lang && lang.featureCoverage !== FeatureCoverage.Full) {
		vscode.window.showInformationMessage(`${lang.name} is not fully supported.`, DONT_SHOW_AGAIN).then(handleChoice);
	}
}

function onDidFocusDocumentInLanguage(languageId: string | undefined): void {
	if (!languageId) {
		statusBarItem.hide();
		return;
	}

	const lang = getLanguage(languageId);
	if (lang && lang.releaseStatus === ReleaseStatus.General && lang.featureCoverage === FeatureCoverage.Full) {
		// Fully supported and released. No need to display anything.
		statusBarItem.hide();
		return;
	} else if (lang && lang.releaseStatus === ReleaseStatus.General && lang.featureCoverage !== FeatureCoverage.Full) {
		statusBarItem.color = 'yellow';
		statusBarItem.text = `Partial Support`;
		statusBarItem.tooltip = `${lang.name} is partially supported.Not all code intelligence features are available yet.`;
	} else if (lang && lang.releaseStatus === ReleaseStatus.Preview && isPreviewLanguagesEnabled()) {
		statusBarItem.color = 'yellow';
		statusBarItem.text = `Preview`;
		statusBarItem.tooltip = `${lang.name} support is in preview.`;
	} else if (lang && lang.releaseStatus < ReleaseStatus.General) {
		statusBarItem.color = 'yellow';
		statusBarItem.text = 'Not Supported';
		statusBarItem.tooltip = `${lang.name} is not supported.`;
	} else if (!lang) {
		// This is a catch-all and includes the long tail of files, most of which are not code.
		statusBarItem.hide();
		return;
	}
	statusBarItem.show();
}
