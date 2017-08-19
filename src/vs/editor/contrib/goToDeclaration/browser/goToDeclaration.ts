/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedExternalError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import { DefinitionProviderRegistry, ImplementationProviderRegistry, TypeDefinitionProviderRegistry, Location, ScoredLocation } from 'vs/editor/common/modes';
import { CancellationToken } from 'vs/base/common/cancellation';
import { asWinJsPromise } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';

function outputResults(promises: TPromise<ScoredLocation | ScoredLocation[]>[]) {
	return TPromise.join(promises).then(allDefinitions => {
		let result: ScoredLocation[] = [];
		for (let definitions of allDefinitions) {
			if (Array.isArray(definitions)) {
				result.push(...definitions);
			} else if (definitions) {
				result.push(definitions);
			}
		}

		// If there are exact results, filter out fuzzy results.
		const exactResult = result.filter(location => location.score === undefined || location.score >= 1);
		if (exactResult.length > 0) {
			return exactResult;
		}

		return result;
	});
}

function getDefinitions<T>(
	model: IReadOnlyModel,
	position: Position,
	registry: LanguageFeatureRegistry<T>,
	provide: (provider: T, model: IReadOnlyModel, position: Position, token: CancellationToken) => ScoredLocation | ScoredLocation[] | Thenable<ScoredLocation | ScoredLocation[]>
): TPromise<Location[]> {
	const provider = registry.ordered(model);

	// get results
	const promises = provider.map((provider, idx) => {
		return asWinJsPromise((token) => {
			return provide(provider, model, position, token);
		}).then(undefined, err => {
			onUnexpectedExternalError(err);
			return null;
		});
	});
	return outputResults(promises);
}


export function getDefinitionsAtPosition(model: IReadOnlyModel, position: Position): TPromise<Location[]> {
	return getDefinitions(model, position, DefinitionProviderRegistry, (provider, model, position, token) => {
		return provider.provideDefinition(model, position, token);
	});
}

export function getImplementationsAtPosition(model: IReadOnlyModel, position: Position): TPromise<Location[]> {
	return getDefinitions(model, position, ImplementationProviderRegistry, (provider, model, position, token) => {
		return provider.provideImplementation(model, position, token);
	});
}

export function getTypeDefinitionsAtPosition(model: IReadOnlyModel, position: Position): TPromise<Location[]> {
	return getDefinitions(model, position, TypeDefinitionProviderRegistry, (provider, model, position, token) => {
		return provider.provideTypeDefinition(model, position, token);
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeDefinitionProvider', getDefinitionsAtPosition);
CommonEditorRegistry.registerDefaultLanguageCommand('_executeImplementationProvider', getImplementationsAtPosition);
CommonEditorRegistry.registerDefaultLanguageCommand('_executeTypeDefinitionProvider', getTypeDefinitionsAtPosition);