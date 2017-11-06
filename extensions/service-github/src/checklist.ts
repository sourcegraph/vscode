/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import * as path from 'path';
import { dispose } from './util';
import { GitHubStatusState } from './repository';
import { Model } from './model';

const localize = nls.loadMessageBundle();

const ICONS_ROOT_PATH = path.resolve(__dirname, '../resources/icons');

const getIconForState = (state: GitHubGQL.IStatusStateEnum): vscode.Uri =>
	vscode.Uri.file(path.join(ICONS_ROOT_PATH, `gh-status-icon--${state.toLowerCase()}.svg`));

/**
 * Manages the checklist providers for all active GitHub repositories.
 */
export class ChecklistController implements vscode.Disposable {

	private provider: vscode.ChecklistProvider;
	private statusGroup: vscode.ChecklistItemGroup;

	private disposables: vscode.Disposable[] = [];

	constructor(
		private model: Model,
	) {
		this.provider = vscode.checklist.createChecklistProvider('github', localize('githubProvider', "GitHub"));
		this.disposables.push(this.provider);

		this.statusGroup = this.provider.createItemGroup('githubCommitStatus', localize('commitStatusGroup', "Commit Status (GitHub)"));
		this.statusGroup.hideWhenEmpty = true;
		this.disposables.push(this.statusGroup);

		this.model.onDidChangeRepositories(this.onDidChangeRepositories, this, this.disposables);
		this.onDidChangeRepositories();
	}

	private onDidChangeRepositories(): void {
		this.updateStatusGroup();
	}

	private updateStatusGroup(): void {
		const items: vscode.ChecklistItem[] = [];
		for (const repo of this.model.repositories) {
			if (repo.state.status) {
				for (const context of repo.state.status.contexts) {
					// Shorten name, only keep the last two segments
					// 'continuous-integration/travis-ci/push' -> 'travis-ci/push'
					let name = context.context.split('/').slice(-2).join('/');

					// Add folder name
					if (this.model.repositories.length > 1) {
						name = `${name} (${repo.currentGitHubRemote!.name})`;
					}

					items.push({
						name,
						description: context.description || undefined,
						decorations: decorationsForState(context.state),
						command: context.targetUrl ? {
							title: localize('viewInWebBrowser', "View in Web Browser..."),
							command: 'vscode.openWebBrowser',
							arguments: [vscode.Uri.parse(context.targetUrl)],
						} : undefined,
					});
				}
			}
		}

		this.statusGroup.itemStates = items;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

function decorationsForState(state: GitHubGQL.IStatusStateEnum): vscode.ChecklistItemDecorations {
	const iconPath = getIconForState(state);
	return {
		faded: state === GitHubStatusState.Success,
		light: {
			iconPath,
		},
		dark: {
			iconPath,
		},
	};
}
