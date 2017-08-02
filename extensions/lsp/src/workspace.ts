/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { Root } from './root';
import * as log from './log';

/**
 * Manages all of the LSP roots inside of a workspace. The workspace roots and the LSP
 * roots are different (although there may be many roots that are both a workspace root
 * and an LSP root). An LSP root is the containing repository of any open file. A
 * workspace root is the vscode concept. For example, if the user has a multi-root
 * workbench window open with roots A and B, and has two editor tabs open with files F1
 * (which exists underneath A) and F2 (which exists underneath a repo C other than A or
 * B), then the LSP roots are A and C, and the workspace roots are A and B.
 */
export interface IWorkspace extends vscode.Disposable {
	/**
	 * Returns the LSP root that exactly matches the folder URI. (It does not return the
	 * "nearest parent root" or anything smart; it'll just return undefined if there is no
	 * exact match.)
	 */
	getRoot(folder: vscode.Uri): Root | undefined;

	/**
	 * Adds an LSP root to enable language features on documents inside this root.
	 */
	addRoot(folder: vscode.Uri): Root;

	/**
	 * Removes the LSP root if it is not a workspace root folder and if there are no open
	 * documents inside of the root.
	 */
	removeRootIfUnused(folder: vscode.Uri): void;
}

class Workspace implements vscode.Disposable {

	/**
	 * All known roots. The keys are the URI of the root.
	 */
	private roots = new Map<string, Root>();

	private toDispose: vscode.Disposable[] = [];

	constructor() {
		// Load initial workspace folders as LSP roots so that workspace/symbol, etc.,
		// work across all of them.
		if (vscode.workspace.workspaceFolders) {
			for (const folder of vscode.workspace.workspaceFolders) {
				this.addRoot(folder.uri);
			}
		}

		// Add/remove LSP roots when workspace roots change.
		this.toDispose.push(vscode.workspace.onDidChangeWorkspaceFolders(e => {
			for (const folder of e.added) {
				if (this.isValidRoot(folder.uri)) {
					this.addRoot(folder.uri);
				}
			}
			for (const folder of e.removed) {
				this.removeRootIfUnused(folder.uri);
			}
		}));

		// Load roots of currently visible documents so that language features work in
		// them, even if they are not inside a workspace root.
		for (const editor of vscode.window.visibleTextEditors) {
			if (!editor.document) {
				continue;
			}
			const folder = this.getRootURI(editor.document.uri);
			if (folder && this.isValidRoot(folder)) {
				this.addRoot(folder);
			}
		}

		// Add/remove LSP roots when open documents change.
		vscode.workspace.onDidOpenTextDocument(doc => {
			const folder = this.getRootURI(doc.uri);
			if (folder && this.isValidRoot(folder)) {
				this.addRoot(folder);
			}
		});
		vscode.workspace.onDidCloseTextDocument(doc => {
			const folder = this.getRootURI(doc.uri);
			if (folder) {
				this.removeRootIfUnused(folder);
			}
		});
	}

	private getRootURI(resource: vscode.Uri): vscode.Uri | undefined {
		const info = vscode.workspace.extractResourceInfo(resource);
		if (info && info.workspace) {
			let root = vscode.Uri.parse(info.workspace);
			if (info.revisionSpecifier) {
				root = root.with({ query: info.revisionSpecifier });
			}
			return root;
		}
		return undefined;
	}

	public getRoot(folder: vscode.Uri): Root | undefined {
		return this.roots.get(folder.toString());
	}

	private isValidRoot(folder: vscode.Uri): boolean {
		return isRemoteResource(folder);
	}

	public addRoot(folder: vscode.Uri): Root {
		let root = this.roots.get(folder.toString());
		if (!root) {
			log.outputChannel.appendLine(`Add LSP root: ${folder.toString()}`);
			root = new Root(folder);
		}
		this.roots.set(folder.toString(), root);
		return root;
	}

	public removeRootIfUnused(folder: vscode.Uri): void {
		const root = this.roots.get(folder.toString());
		if (!root) {
			return;
		}

		const isWorkspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.some(f => f.uri.toString() === folder.toString());
		const hasOpenDocuments = vscode.workspace.textDocuments.some(doc => root.isInRoot(doc.uri));
		if (!isWorkspaceRoot && !hasOpenDocuments) {
			log.outputChannel.appendLine(`Remove LSP root: ${folder.toString()}`);
			this.roots.delete(folder.toString());
			root.dispose();
		}
	};

	public dispose(): void {
		for (const repo of this.roots.values()) {
			repo.dispose();
		}

		this.toDispose.forEach(disposable => disposable.dispose());
	}
}

/**
 * The global LSP workspace, consisting of all LSP roots. See the IWorkspace documentation
 * for how this differs from the VS Code workspace root folders.
 */
export const lspWorkspace: IWorkspace = new Workspace();

/**
 * Reports whether resource is a repo:// or repo+version:// URI (the two URI schemes that
 * refer to remote resources handled by this extension).
 */
export function isRemoteResource(resource: vscode.Uri): boolean {
	return resource.scheme === 'repo' || resource.scheme === 'repo+version';
}
