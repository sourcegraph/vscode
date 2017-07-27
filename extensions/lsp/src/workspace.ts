/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { LanguageClient, RevealOutputChannelOn, LanguageClientOptions, ErrorCodes } from '@sourcegraph/vscode-languageclient/lib/client';
import { v4 as uuidV4 } from 'uuid';
import { MessageTrace, webSocketStreamOpener } from './connection';
import { Language, getLanguage, getLanguageForResource, isEnabled } from './languages';
import { registerMultiWorkspaceProviders } from './multiWorkspace';
import { registerFuzzyDefinitionProvider } from './fuzzyDefinition';
import { Root } from './root';
import * as log from './log';

/**
 * Manages all of the LSP roots inside of a workspace.
 */
export class Workspace implements vscode.Disposable {

	/**
	 * All known roots in the workspace. The keys are the URI of the root.
	 */
	private roots = new Map<string, Root>();

	private toDispose: vscode.Disposable[] = [];

	constructor() {
		this.toDispose.push(vscode.workspace.onDidChangeWorkspaceFolders(e => this.onDidChangeWorkspaceFolders(e)));

		// Load initial workspace folders.
		if (vscode.workspace.workspaceFolders) {
			this.onDidChangeWorkspaceFolders({ added: vscode.workspace.workspaceFolders, removed: [] });
		}
	}

	private onDidChangeWorkspaceFolders(event: vscode.WorkspaceFoldersChangeEvent): void {
		for (const removedFolder of event.removed) {
			const root = this.roots.get(removedFolder.uri.toString());
			if (root) {
				this.roots.delete(removedFolder.uri.toString());
				root.dispose();
			}
		}

		for (const addedFolder of event.added) {
			if (isRemoteResource(addedFolder.uri)) {
				this.getOrCreateRoot(addedFolder.uri);
			}
		}
	};

	/**
	 * Gets or creates the root with the given URI.
	 */
	private getOrCreateRoot(rootUri: vscode.Uri): Root | undefined {
		if (!this.roots.has(rootUri.toString())) {
			const root = new Root(rootUri);
			this.roots.set(rootUri.toString(), root);
		}
		return this.roots.get(rootUri.toString());
	}

	/**
	 * Gets the state of the root that contains the given resource.
	 */
	private getRootForResource(resource: vscode.Uri): Root | undefined {
		const info = vscode.workspace.extractResourceInfo(resource);
		if (!info) {
			return undefined;
		}

		let root = vscode.Uri.parse(info.workspace);
		if (info.revisionSpecifier) {
			root = root.with({ query: info.revisionSpecifier }); // add ?rev for gitremote:// URIs
		}

		return this.getOrCreateRoot(root);
	}

	public dispose(): void {
		for (const repo of this.roots.values()) {
			repo.dispose();
		}

		this.toDispose.forEach(disposable => disposable.dispose());
	}
}

/**
 * Reports whether resource is a repo:// or gitremote:// URI (the two URI schemes that
 * refer to remote resources handled by this extension).
 */
export function isRemoteResource(resource: vscode.Uri): boolean {
	return resource.scheme === 'repo' || resource.scheme === 'gitremote';
}
