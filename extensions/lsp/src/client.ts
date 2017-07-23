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
// import { registerFuzzyDefinitionProvider } from './fuzzyDefinition';

export function activateLSP(): vscode.Disposable {
	const toDispose: vscode.Disposable[] = []; // things that should live for this extension's lifetime
	const toDisposeCanRecreate: vscode.Disposable[] = []; // things that will be recreated if disposed

	// Search the workspace for file types to know what to activate. This lets us start
	// initializing language features when the user first loads a workspace, not just when
	// they view a file, which reduces perceived load time. It also makes
	// workspace/symbols work before a file is open.
	vscode.workspace.findFiles('**/*', undefined, 250).then(resources => {
		resources.forEach(resource => {
			const lang = getLanguageForResource(resource);
			if (lang) {
				activateForLanguage(lang, toDisposeCanRecreate);
			}
		});
	});

	// Activate when documents of a specific mode are opened. This lets us initialize
	// language features for a specific document before our workspace-wide search above
	// (which might take a few seconds) has finished.
	vscode.workspace.textDocuments.forEach(doc => {
		activateForDocument(doc, toDisposeCanRecreate);
	});
	vscode.workspace.onDidOpenTextDocument(doc => {
		activateForDocument(doc, toDisposeCanRecreate);
	}, null, toDispose);
	vscode.window.onDidChangeVisibleTextEditors(editors => {
		editors.forEach(editor => activateForDocument(editor.document, toDisposeCanRecreate));
	}, null, toDispose);

	// HACK: Poll SCM provider to see if revision changes. If so, then kill our LSP
	// clients because the revision is specified immutably in our LSP proxy initialization
	// request.
	let lastSCMRevision: string | undefined = vscode.scm.activeProvider && vscode.scm.activeProvider.revision && vscode.scm.activeProvider.revision.id;
	const pollSCMRevisionHandle = setInterval(() => {
		let scmRevision = vscode.scm.activeProvider && vscode.scm.activeProvider.revision && vscode.scm.activeProvider.revision.id;
		if (scmRevision !== lastSCMRevision) {
			// Dispose all clients and related resources.
			dispose(toDisposeCanRecreate);

			// Trigger recreation of any clients (for the new revision) that we just
			// disposed.
			vscode.window.visibleTextEditors.forEach(editor => activateForDocument(editor.document, toDisposeCanRecreate));

			lastSCMRevision = scmRevision;
		}
	}, 2000);

	return {
		dispose(): void {
			clearInterval(pollSCMRevisionHandle);
			dispose(toDispose);
			dispose(toDisposeCanRecreate);
		},
	};
}

function dispose(toDispose: vscode.Disposable[]): void {
	toDispose.forEach(disposable => disposable.dispose());
	toDispose.length = 0;
}

function activateForDocument(doc: vscode.TextDocument, toDispose: vscode.Disposable[]): void {
	if (!doc) { return; }
	const lang = getLanguage(doc.languageId);
	if (lang) {
		activateForLanguage(lang, toDispose);
	}
}

const activatedModes = new Set<string>();

function activateForLanguage(lang: Language, toDispose: vscode.Disposable[]): void {
	if (!isEnabled(lang)) { return; }

	// Only use one client per workspace per mode.
	if (activatedModes.has(lang.mode)) { return; }
	activatedModes.add(lang.mode);
	toDispose.push({ dispose: () => activatedModes.delete(lang.mode) });

	if (!vscode.scm.activeProvider) {
		console.warn('Disabling LSP because there is no active SCM provider for ' + vscode.workspace.rootPath);
		return;
	}
	if (!vscode.scm.activeProvider || !vscode.scm.activeProvider.revision || !vscode.scm.activeProvider.revision.id) {
		console.warn('Disabling LSP because the resolved revision is not available.', vscode.scm.activeProvider.revision);
		return;
	}
	const client = newClient(lang.mode, lang.allLanguageIds, vscode.Uri.parse(vscode.workspace.rootPath), vscode.scm.activeProvider.revision.id);
	toDispose.push(client.start());

	toDispose.push(registerMultiWorkspaceProviders(lang.mode, lang.allLanguageIds, client));
	// TODO(beyang): re-enable this after ensuring this doesn't pollute authentic j2d results
	// toDispose.push(registerFuzzyDefinitionProvider(lang.mode, client));
}

const REUSE_BACKEND_LANG_SERVERS = true;

/**
* Creates a new LSP client. The mode specifies which backend language
* server to communicate with. The languageIds are the vscode document
* languages that this client should be used to provide hovers, etc.,
* for.
*/
export function newClient(mode: string, languageIds: string[], workspace: vscode.Uri, commitID: string): LanguageClient {
	const endpoint = vscode.Uri.parse(vscode.workspace.getConfiguration('remote').get<string>('endpoint'));
	const wsOrigin = endpoint.with({ scheme: endpoint.scheme === 'http' ? 'ws' : 'wss' });

	if (!commitID) {
		throw new Error(`no commit ID for workspace ${workspace.toString()}`);
	}

	// We include ?mode= in the url to make it easier to find the correct LSP
	// websocket connection in (e.g.) the Chrome network inspector. It does not
	// affect any behaviour.
	const opener = () => webSocketStreamOpener(`${wsOrigin}/.api/lsp?mode=${mode}`, createRequestTracer(mode));

	return new LanguageClient('lsp-' + mode, 'lsp-' + mode, opener, {
		revealOutputChannelOn: RevealOutputChannelOn.Never,
		documentSelector: languageIds.map(languageId => ({
			language: languageId,
			scheme: workspace.scheme,
			pattern: `${workspace.path}/**/*`,
		})),
		initializationOptions: {
			mode: mode,
			rev: commitID,
			session: REUSE_BACKEND_LANG_SERVERS ? undefined : uuidV4(),
		},
		uriConverters: {
			code2Protocol: (value: vscode.Uri): string => {
				if (value.scheme === 'file') {
					return value.toString();
				}
				if (value.scheme === 'repo' || value.scheme === 'gitremote') {
					const info = vscode.workspace.extractResourceInfo(value);
					// HACK: Support starting a LanguageClient with a workspace root other than
					// vscode.workspace.rootPath. We use a URI converter to automatically inject
					// the workspace provided to newClient in place of the default
					// vscode.workspace.rootPath, which vscode-languageclient uses.
					return vscode.Uri.parse(`git://${workspace.authority}${workspace.path}`).with({
						query: commitID,
						fragment: info.relativePath,
					}).toString();
				}
				throw new Error(`unknown URI scheme in ${value.toString()}`);
			},
			protocol2Code: (value: string): vscode.Uri => {
				const uri = vscode.Uri.parse(value);
				if (uri.scheme === 'git') {
					// URI is of the form git://github.com/owner/repo?gitrev#dir/file.

					// Convert to repo://github.com/owner/repo/dir/file if in the same workspace.
					if (uri.with({ scheme: 'repo', query: '', fragment: '' }).toString() === workspace.toString()) {
						return workspace.with({ scheme: 'repo', path: workspace.path + `${uri.fragment !== '' ? `/${decodeURIComponent(uri.fragment)}` : ''}` });
					}

					// Convert to gitremote://github.com/owner/repo/dir/file.txt?gitrev.
					return uri.with({ scheme: 'gitremote', path: uri.path.replace(/\/$/, '') + '/' + decodeURIComponent(uri.fragment), fragment: '' });
				}
				throw new Error('language server sent URI with unsupported scheme: ' + value);
			},
		},
	} as LanguageClientOptions);
}

// tslint:disable: no-console

function createRequestTracer(languageId: string): ((trace: MessageTrace) => void) | undefined {
	if (!(global as any).console) {
		return undefined;
	}
	if (!vscode.workspace.getConfiguration('lsp').get<boolean>('trace')) {
		return undefined;
	}
	const console = (global as any).console;
	if (!console.log || !console.group) {
		return undefined;
	}
	return (trace: MessageTrace) => {
		let label: string;
		let bgColor: string;
		if (!trace.response.error) {
			label = 'OK';
			bgColor = 'green';
		}
		else if (trace.response.error.code === ErrorCodes.RequestCancelled) {
			label = 'CXL';
			bgColor = '#bbb';
		} else {
			label = 'ERR';
			bgColor = 'red';
		}
		console.groupCollapsed(
			'%c%s%c LSP %s %s %c%sms',
			`background-color:${bgColor};color:white`, label,
			`background-color:inherit;color:inherit;`,
			languageId,
			describeRequest(trace.request.method, trace.request.params),
			'color:#999;font-weight:normal;font-style:italic',
			trace.endTime - trace.startTime,
		);
		if (trace.response.meta && trace.response.meta['X-Trace']) {
			console.log('Trace:', trace.response.meta['X-Trace']);
		}
		console.log('Request Params:', trace.request.params);
		console.log('Response:', trace.response);
		console.groupEnd();
	};
}

function describeRequest(method: string, params: any): string {
	if (params.textDocument && params.textDocument.uri && params.position) {
		return `${method} @ ${params.position.line + 1}:${params.position.character + 1}`;
	}
	if (typeof params.query !== 'undefined') {
		return `${method} with query ${JSON.stringify(params.query)}`;
	}
	return method;
}
