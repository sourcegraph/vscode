/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose, Disposable } from 'vs/base/common/lifecycle';
import { TPromise } from 'vs/base/common/winjs.base';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IMessageService } from 'vs/platform/message/common/message';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ContextProviderRegistry } from 'vs/editor/common/modes';
import { Range } from 'vs/editor/common/core/range';
import { IContextData, getContextData } from '../common/context';
import { MarkdownString } from 'vs/base/common/htmlContent';
import { HoverOperation, IHoverComputer } from 'vs/editor/contrib/hover/browser/hoverOperation';

class ContextComputer implements IHoverComputer<IContextData[]> {

	private _result: IContextData[];
	private _range: Range;

	constructor(private _editor: editorCommon.ICommonCodeEditor) {
		this._range = null;
	}

	setRange(range: Range): void {
		this._range = range;
		this._result = [];
	}

	clearResult(): void {
		this._result = [];
	}

	computeAsync(): TPromise<IContextData[]> {
		const model = this._editor.getModel();

		if (!ContextProviderRegistry.has(model)) {
			return TPromise.as(null);
		}

		return getContextData(model, this._range);
	}

	onResult(result: IContextData[], isFromSynchronousComputation: boolean): void {
		// Always put synchronous messages before asynchronous ones
		if (isFromSynchronousComputation) {
			this._result = result.concat(this._result);
		} else {
			this._result = this._result.concat(result);
		}
	}

	getResult(): IContextData[] {
		return this._result.slice(0);
	}

	getResultWithLoadingMessage(): IContextData[] {
		return this._result.slice(0).concat([this._getLoadingMessage()]);
	}

	private _getLoadingMessage(): IContextData {
		return {
			provider: null,
			item: {
				range: this._range,
				contents: [new MarkdownString().appendText(nls.localize('editorContext.loading', "Loading..."))]
			},
		};
	}
}

export class EditorContextController extends Disposable {

	private modelDisposables: IDisposable[] = [];
	private items: IContextData[] = [];
	private lastRange: Range;
	private computer: ContextComputer;
	private contextOperation: HoverOperation<IContextData[]>;

	private _onDidChange = new Emitter<IContextData[]>();
	public get onDidChange(): Event<IContextData[]> { return this._onDidChange.event; }

	constructor(
		private editor: editorCommon.ICommonCodeEditor,
		@ICommandService private commandService: ICommandService,
		@IMessageService private messageService: IMessageService
	) {
		super();

		this.computer = new ContextComputer(editor);
		this.contextOperation = new HoverOperation(
			this.computer,
			result => this._withResult(result, true),
			null,
			result => this._withResult(result, false)
		);

		this._register(this.editor.onDidChangeModel(() => this.onModelChange()));
		this._register(this.editor.onDidChangeModelLanguage(() => this.onModelChange()));
		this._register(ContextProviderRegistry.onDidChange(this.onModelChange, this));
		this.onModelChange();
	}

	dispose(): void {
		this.modelDisposables = dispose(this.modelDisposables);
		super.dispose();
	}

	private onModelChange(): void {
		this.modelDisposables = dispose(this.modelDisposables);

		this.contextOperation.cancel();
		this.computer.clearResult();

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		if (!ContextProviderRegistry.has(model)) {
			return;
		}

		for (const provider of ContextProviderRegistry.all(model)) {
			if (typeof provider.onDidChange === 'function') {
				let registration = provider.onDidChange(() => this.beginCompute());
				this.modelDisposables.push(registration);
			}
		}

		this.modelDisposables.push(this.editor.onDidChangeModelContent(() => this.beginCompute()));
		this.modelDisposables.push(this.editor.onDidChangeCursorSelection(() => this.beginCompute()));

		this.beginCompute();
	}

	private beginCompute(): void {
		const range = this.editor.getSelection();

		if (this.lastRange && this.lastRange.equalsRange(range)) {
			// We have to show the widget at the exact same range as before, so no work is needed
			return;
		}

		this.contextOperation.cancel();

		// The range changed, but some of the context items may still fall within the new range.
		// Instead of hiding them all immediately, filter down to the items that are still valid
		// and start a new computation.
		//
		// TODO(sqs): figure out different is-relevant function
		const filteredItems = this.items.filter(({ item }) => !item.range || Range.areIntersectingOrTouching(range, item.range));
		if (filteredItems.length !== this.items.length) {
			this._onDidChange.fire(filteredItems);
		}

		this.lastRange = range;
		this.computer.setRange(range);
		this.contextOperation.start();
	}

	private _withResult(result: IContextData[], complete: boolean): void {
		this.items = result;

		this._onDidChange.fire(result);
	}
}
