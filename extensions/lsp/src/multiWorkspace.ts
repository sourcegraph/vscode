/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { LanguageClient, TextDocumentPositionParams } from '@sourcegraph/vscode-languageclient/lib/client';
import { newClient } from './client';
import { Dependent, listDependents } from './dependents';
import { SymbolLocationInformation, TextDocumentXDefinitionRequest, WorkspaceReferencesParams, ReferenceInformation, WorkspaceXReferencesRequest } from './lsp';

/**
 * Sets up provider for cross-workspace references.
 */
export function registerMultiWorkspaceProviders(mode: string, languageIds: string[], currentWorkspaceClient: LanguageClient): vscode.Disposable {
	const p = new MultiWorkspaceProvider(mode, languageIds, currentWorkspaceClient);
	p.register();
	return p;
}

/**
 * Provides references drawn from multiple external workspaces. To obtain the
 * list of references for a token at position P in workspace W, it first
 * retrieves a list of workspaces that depend on W. For each such dependent
 * workspace D, it creates a new LSP connection and calls workspace/xreferences
 * to find all references in D to the original token in W.
 *
 * NOTE: It may be more efficient to compile results and create multiple
 * connections on the server instead of here in the client. Also, this technique
 * exposes more of Sourcegraph's API than is strictly necessary.
 */
class MultiWorkspaceProvider implements vscode.ReferenceProvider {
	private static MAX_DEPENDENT_REPOS = 10;

	private toDispose: vscode.Disposable[] = [];
	private workspaces = new Map<string, LanguageClient>(); // key is workspace root URI

	constructor(
		private mode: string,
		private languageIds: string[],
		private currentWorkspaceClient: LanguageClient,
	) { }

	public register(): void {
		const info = vscode.workspace.extractResourceInfo(vscode.workspace.rootPath);
		const workspace = vscode.Uri.parse(info.workspace);
		this.toDispose.push(vscode.languages.registerReferenceProvider(this.languageIds.map(languageId => ({
			language: languageId,
			scheme: workspace.scheme,
			pattern: `${workspace.path}/**/*`,
		})), this));
	}

	public dispose(): void {
		this.toDispose.forEach(d => d.dispose());
		// Do not dispose the currentWorkspaceClient because we do not own it.
	}

	public provideReferences(document: vscode.TextDocument, position: vscode.Position, context: vscode.ReferenceContext, token: vscode.CancellationToken, progress: vscode.ProgressCallback<vscode.Location[]>): vscode.ProviderResult<vscode.Location[]> {
		const handleError = error => {
			// We don't want failures in one repo to prevent results from other repos from showing
			// so just log errors and pretend no results were returned.
			console.warn(error);
			return [];
		};
		return this.queryDefinitionInfo(document, position).then(definitionInfos =>
			this.onlySuccesses(definitionInfos.map(definitionInfo =>
				this.listDependents(document, position).then(dependents =>
					this.onlySuccesses(dependents.map(dependent => {
						const client = this.getClientForWorkspace(dependent.workspace);
						return client.onReady().then(() => {
							const refs2Locations = (references: ReferenceInformation[]): vscode.Location[] => {
								return references.map(r => this.currentWorkspaceClient.protocol2CodeConverter.asLocation(r.reference));
							};
							const progressHandler = (references: ReferenceInformation[]) => {
								progress(refs2Locations(references));
							};
							const params: WorkspaceReferencesParams = { query: definitionInfo.symbol, hints: dependent.hints, limit: 50 };
							return client.sendRequestWithStreamingResponse(WorkspaceXReferencesRequest.type, params, token, progressHandler).then(refs2Locations);
						});
					}), handleError)
				)
			), handleError)
		)
			.then((resultLists: vscode.Location[][][]) => {
				// Flatten list.
				const results: vscode.Location[] = [];
				resultLists.forEach(list => {
					list.forEach(l => results.push.apply(results, l));
				});
				return results;
			});
	}

	/**
	 * Returns a promise that resolves to the resolved results of the input promises.
	 * handleError handles errors from input thenables and should return a default value to use.
	 * The returned promise always resolves and is never rejected as long as handleError doesn't throw.
	 */
	private onlySuccesses<R>(thenables: Thenable<R>[], handleError: (any) => R): Promise<R[]> {
		return Promise.all(thenables.map(thenable => {
			try {
				return thenable.then(v => v, handleError);
			} catch (e) {
				return handleError(e);
			}
		}));
	}

	private getClientForWorkspace(workspace: vscode.Uri): LanguageClient {
		if (workspace.toString() === vscode.workspace.rootPath) {
			return this.currentWorkspaceClient;
		}

		// Reuse if we're already connected.
		let client = this.workspaces.get(workspace.toString());
		if (client) { return client; }

		const info = vscode.workspace.extractResourceInfo(workspace);
		client = newClient(this.mode, this.languageIds, workspace, info.revisionSpecifier);
		this.workspaces.set(workspace.toString(), client);
		this.toDispose.push(client.start());
		return client;
	}

	private queryDefinitionInfo(document: vscode.TextDocument, position: vscode.Position): Thenable<SymbolLocationInformation[]> {
		return this.currentWorkspaceClient.sendRequest(TextDocumentXDefinitionRequest.type, {
			textDocument: { uri: this.currentWorkspaceClient.code2ProtocolConverter.asUri(document.uri).toString() },
			position: this.currentWorkspaceClient.code2ProtocolConverter.asPosition(position),
		} as TextDocumentPositionParams);
	}

	/**
	 * Returns reference information about the given definition.
	 */
	private listDependents(document: vscode.TextDocument, position: vscode.Position): Thenable<Dependent[]> {
		const info = vscode.workspace.extractResourceInfo(document.uri);
		if (!info) {
			throw new Error(`unable to extract resource information for ${document.uri}`);
		}
		const workspace = vscode.Uri.parse(info.workspace);

		let rev: string;
		if (info.workspace === vscode.workspace.rootPath) {
			const sourceControl = vscode.scm.getSourceControlForResource(document.uri);
			if (!sourceControl) {
				throw new Error(`no source control found for ${document.uri.toString()}`);
			}
			rev = sourceControl.revision.id;
		} else if (info.revisionSpecifier) {
			rev = info.revisionSpecifier;
		}
		if (!rev) {
			throw new Error(`unable to resolve revision for ${document.uri}`);
		}

		return listDependents({
			repo: workspace.authority + workspace.path,
			rev,
			path: info.relativePath,
			mode: this.mode,
			line: position.line,
			character: position.character,
		}).then(dependents => dependents.slice(0, MultiWorkspaceProvider.MAX_DEPENDENT_REPOS));
	}
}
