/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedError, illegalArgument } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { IRange } from 'vs/editor/common/editorCommon';
import URI from 'vs/base/common/uri';
import { ISearchConfiguration } from 'vs/platform/search/common/search';
import glob = require('vs/base/common/glob');
import { IWorkspace } from 'vs/platform/workspace/common/workspace';

/**
 * Interface used to navigate to types by value.
 */
export interface IWorkspaceSymbol {
	name: string;
	type: string;
	containerName: string;
	range: IRange;
	resource: URI;
}

export interface IWorkspaceSymbolProvider {
	provideWorkspaceSymbols(search: string): TPromise<IWorkspaceSymbol[]>;
	resolveWorkspaceSymbol?: (item: IWorkspaceSymbol) => TPromise<IWorkspaceSymbol>;
}

class SymbolProvider implements IWorkspaceSymbolProvider {

	resolveWorkspaceSymbol?: (item: IWorkspaceSymbol) => TPromise<IWorkspaceSymbol>;

	constructor(private provider: IWorkspaceSymbolProvider, public workspace?: IWorkspace) {
		this.resolveWorkspaceSymbol = provider.resolveWorkspaceSymbol;
	}

	provideWorkspaceSymbols(search: string): TPromise<IWorkspaceSymbol[]> {
		return this.provider.provideWorkspaceSymbols(search);
	}
}

export namespace WorkspaceSymbolProviderRegistry {

	const _supports: SymbolProvider[] = [];

	export function register(support: IWorkspaceSymbolProvider, workspace?: IWorkspace): IDisposable {
		let supportProvider: SymbolProvider;

		if (support) {
			supportProvider = new SymbolProvider(support, workspace);
			_supports.push(supportProvider);
		}

		return {
			dispose() {
				if (supportProvider) {
					let idx = _supports.indexOf(supportProvider);
					if (idx >= 0) {
						_supports.splice(idx, 1);
						support = undefined;
					}
				}
			}
		};
	}

	export function all(workspace?: IWorkspace): IWorkspaceSymbolProvider[] {
		if (workspace) {
			return _supports.filter(support => support.workspace && support.workspace.resource && support.workspace.resource.toString() === workspace.resource.toString())
		}
		return _supports.slice(0); // make a copy
	}
}

export function getWorkspaceSymbols(query: string, workspace?: IWorkspace): TPromise<[IWorkspaceSymbolProvider, IWorkspaceSymbol[]][]> {

	const result: [IWorkspaceSymbolProvider, IWorkspaceSymbol[]][] = [];

	const promises = WorkspaceSymbolProviderRegistry.all(workspace).map(support => {
		return support.provideWorkspaceSymbols(query).then(value => {
			if (Array.isArray(value)) {
				result.push([support, value]);
			}
		}, onUnexpectedError);
	});

	return TPromise.join(promises).then(_ => result);
}

CommonEditorRegistry.registerLanguageCommand('_executeWorkspaceSymbolProvider', function (accessor, args: { query: string; }) {
	let {query} = args;
	if (typeof query !== 'string') {
		throw illegalArgument();
	}
	// TODO(john): send current workspace for query
	return getWorkspaceSymbols(query);
});

export interface IWorkbenchSearchConfiguration extends ISearchConfiguration {
	search: {
		quickOpen: {
			includeSymbols: boolean;
		},
		exclude: glob.IExpression;
	};
}