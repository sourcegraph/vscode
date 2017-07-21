/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { LanguageClient, WorkspaceSymbolRequest, SymbolInformation } from '@sourcegraph/vscode-languageclient/lib/client';

export function registerFuzzyDefinitionProvider(mode: string, client: LanguageClient): vscode.Disposable {
	const p = new FuzzyDefinitionProvider(mode, client);
	p.register();
	return p;
}

/**
 * FuzzyDefinitionProvider provides fuzzy jump-to-def results by
 * issuing a workspace/symbol query for the token currently at
 * point. Its accuracy is roughly equivalent (but probably better)
 * than most CTAGS implementations.
 */
class FuzzyDefinitionProvider implements vscode.DefinitionProvider {

	private toDispose: vscode.Disposable[] = [];

	constructor(
		private mode: string,
		private client: LanguageClient,
	) { }

	public register() {
		// register each new instance as a definition provider
		const info = vscode.workspace.extractResourceInfo(vscode.workspace.rootPath);
		const workspace = vscode.Uri.parse(info.workspace);
		vscode.languages.registerDefinitionProvider({
			language: this.mode, scheme: workspace.scheme, pattern: `${workspace.path}/**/*`,
		}, this);
	}

	public dispose(): void {
		this.toDispose.forEach(d => d.dispose());
		// Do not dispose the client because we do not own it.
	}

	public provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Definition> {

		const wr = document.getWordRangeAtPosition(position);
		if (!wr) {
			return [];
		}
		const word = document.getText(wr);

		return this.client.sendRequest(WorkspaceSymbolRequest.type, {
			query: word
		}).then((results: SymbolInformation[]) => {
			return results.filter(r => r.name === word)
				.map(r => {
					const loc = this.client.protocol2CodeConverter.asLocation(r.location);
					return { ...loc, score: 0.5 };
				});
		});
	}
}
