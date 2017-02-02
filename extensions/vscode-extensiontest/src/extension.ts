/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

// import * as net from 'net';

import { ExtensionContext, ReferenceProvider, ReferenceContext, TextDocument, CancellationToken, ProviderResult, Location, Position, languages } from 'vscode';
import * as client from 'vscode-languageclient';

// import { Disposable, ExtensionContext, Uri, workspace } from 'vscode';
// import { LanguageClient, LanguageClientOptions, SettingMonitor, ServerOptions, ErrorAction, ErrorHandler, CloseAction, TransportKind } from 'vscode-languageclient';

export function activate(context: ExtensionContext) {
	console.log('hi nick');


	// client.LanguageClient()

	const goReferenceProvider = new GoReferenceProvider();
	languages.registerReferenceProvider("go", goReferenceProvider);

	context.subscriptions.push(goReferenceProvider);
}

export class GoReferenceProvider implements ReferenceProvider {

	provideReferences(document: TextDocument, position: Position, context: ReferenceContext, token: CancellationToken): ProviderResult<Location[]> {
		console.log("provide references");
		return null;
	}

	dispose(): void {
		console.log("disposed");
	}

}

// function updateEnvFromConfig() {
// 	const conf = workspace.getConfiguration('go');
// 	if (conf['goroot']) {
// 		process.env.GOROOT = conf['goroot'];
// 	}
// 	if (conf['gopath']) {
// 		process.env.GOPATH = conf['gopath'];
// 	}
// }
