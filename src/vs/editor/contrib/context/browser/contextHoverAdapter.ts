/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event from 'vs/base/common/event';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { editorContribution } from 'vs/editor/browser/editorBrowserExtensions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { HoverProviderRegistry, HoverProvider, Hover, ContextProviderRegistry, ContextProvider, ContextItem } from 'vs/editor/common/modes';
import { PLAINTEXT_MODE_ID } from 'vs/editor/common/modes/modesRegistry';
import { LanguageSelector } from 'vs/editor/common/modes/languageSelector';
import { CancellationToken } from 'vs/base/common/cancellation';
import { toThenable } from 'vs/base/common/async';
import { IMarkdownString } from 'vs/base/common/htmlContent';

/**
 * Registers hover providers as context providers.
 */
@editorContribution
export class ContextHoverAdapter implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.contextHoverAdapter';

	private _editor: ICodeEditor;
	private _providerDisposables: IDisposable[];
	private _disposables: IDisposable[];

	static get(editor: editorCommon.ICommonCodeEditor): ContextHoverAdapter {
		return editor.getContribution<ContextHoverAdapter>(ContextHoverAdapter.ID);
	}

	constructor(editor: ICodeEditor,
		@IOpenerService openerService: IOpenerService,
		@IModeService modeService: IModeService
	) {
		this._editor = editor;

		this._disposables = [];

		HoverProviderRegistry.onDidChange(() => this.onProvidersChanged());
		this.onProvidersChanged();
	}

	private onProvidersChanged(): void {
		this._providerDisposables = dispose(this._providerDisposables) || [];

		HoverProviderRegistry.registeredProviders().forEach(({ selector, provider }) => {
			const adapter = this.createAdapter(selector, provider);
			if (adapter) {
				this._providerDisposables.push(ContextProviderRegistry.register(selector, adapter));
			}
		});
	}

	private createAdapter(selector: LanguageSelector, hoverProvider: HoverProvider): ContextProvider | undefined {
		// Heuristic: ignore non-language selectors, since they are likely to be non-code-level information.
		if (!hasLanguage(selector)) {
			return undefined;
		}

		return {
			onDidChange: Event.None,
			provideContext: (model: editorCommon.IReadOnlyModel, range: Range, token: CancellationToken): ContextItem[] | Thenable<ContextItem[]> => {
				const position = range.getStartPosition();
				const word = model.getWordAtPosition(position);
				return toThenable<Hover>(hoverProvider.provideHover(model, position, token)).then(value => {
					if (!value) {
						return undefined;
					}

					// Heuristic: ignore non-code hover contents, since they're likely to be non-code-level information.
					if (value.contents) {
						value.contents = value.contents.filter(isMarkdownStringWithCode);
					}

					if (!value.contents || value.contents.length === 0) {
						return undefined;
					}

					if (!value.range && word) {
						value.range = new Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
					}
					if (!value.range) {
						value.range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
					}

					return [value];
				});
			},
		};
	}

	public getId(): string {
		return ContextHoverAdapter.ID;
	}

	public dispose(): void {
		this._disposables = dispose(this._disposables);
	}
}

function hasLanguage(selector: LanguageSelector): boolean {
	if (Array.isArray(selector)) {
		return selector.some(hasLanguage);
	} else if (typeof selector === 'string') {
		return selector && selector !== '*';
	} else if (selector) {
		return selector.language && selector.language !== '*';
	} else {
		return false;
	}
}

const MARKDOWN_CODE_BLOCK = /```( ?\w+)/;

function isMarkdownStringWithCode(content: IMarkdownString): boolean {
	const m = MARKDOWN_CODE_BLOCK.exec(content.value);
	return m && m.some(lang => lang !== PLAINTEXT_MODE_ID && lang !== 'text');
}