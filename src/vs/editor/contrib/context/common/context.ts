/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import URI from 'vs/base/common/uri';
import { mergeSort } from 'vs/base/common/arrays';
import { IModelService } from 'vs/editor/common/services/modelService';
import { TPromise } from 'vs/base/common/winjs.base';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { ContextItem, ContextProvider, ContextProviderRegistry } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { Range } from 'vs/editor/common/core/range';

export interface IContextData {
	item: ContextItem;
	provider: ContextProvider;
}

export function getContextData(model: IReadOnlyModel, range: Range): TPromise<IContextData[]> {

	const items: IContextData[] = [];
	const provider = ContextProviderRegistry.ordered(model);

	const promises = provider.map(provider => asWinJsPromise(token => provider.provideContext(model, range, token)).then(result => {
		if (Array.isArray(result)) {
			for (let item of result) {
				items.push({ item, provider });
			}
		}
	}, onUnexpectedExternalError));

	return TPromise.join(promises).then(() => {

		return mergeSort(items, (a, b) => {
			// sort by lineNumber, provider-rank, and column
			if (a.item.range.startLineNumber < b.item.range.startLineNumber) {
				return -1;
			} else if (a.item.range.startLineNumber > b.item.range.startLineNumber) {
				return 1;
			} else if (provider.indexOf(a.provider) < provider.indexOf(b.provider)) {
				return -1;
			} else if (provider.indexOf(a.provider) > provider.indexOf(b.provider)) {
				return 1;
			} else if (a.item.range.startColumn < b.item.range.startColumn) {
				return -1;
			} else if (a.item.range.startColumn > b.item.range.startColumn) {
				return 1;
			} else {
				return 0;
			}
		});
	});
}

CommonEditorRegistry.registerLanguageCommand('_executeContextProvider', (accessor: ServicesAccessor, args: any) => {
	const { resource, range } = args;
	if (!(resource instanceof URI) || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument('resource');
	}
	return getContextData(model, Range.lift(range));
});