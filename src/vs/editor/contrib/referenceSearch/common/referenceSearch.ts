/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { onUnexpectedExternalError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { CommonEditorRegistry } from 'vs/editor/common/editorCommonExtensions';
import { LanguageIdentifier, Location, ReferenceProviderRegistry, WorkspaceReferenceProviderRegistry, IReferenceInformation, ISymbolDescriptor, ReferenceContext } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { Position } from 'vs/editor/common/core/position';

export function provideReferences(model: IReadOnlyModel, position: Position, progress: (locations: Location[]) => void, context?: ReferenceContext): TPromise<Location[]> {

	// collect references from all providers
	const promises = ReferenceProviderRegistry.ordered(model).map(provider => {
		return asWinJsPromise((token) => {
			const ctx = context || { includeDeclaration: true };
			return provider.provideReferences(model, position, ctx, token, progress);
		}).then(result => {
			if (Array.isArray(result)) {
				return <Location[]>result;
			}
			return undefined;
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(references => {
		const result: Location[] = [];
		for (const refs of references) {
			if (refs) {
				for (const ref of refs) {
					result.push(ref);
				}
			}
		}
		return result;
	});
}

export function provideWorkspaceReferences(language: LanguageIdentifier, workspace: URI, query: ISymbolDescriptor, hints: { [hint: string]: any }, progress: (references: IReferenceInformation[]) => void): TPromise<IReferenceInformation[]> {

	const model = {
		isTooLargeForHavingARichMode() {
			return false;
		},
		getModeId(): string {
			return language.language;
		},
		getLanguageIdentifier(): LanguageIdentifier {
			return language;
		},
		uri: workspace,
	};

	// collect references from all providers
	const promises = WorkspaceReferenceProviderRegistry.ordered(model as any).map(provider => {
		return asWinJsPromise(token => {
			return provider.provideWorkspaceReferences(workspace, query, hints, token, progress);
		}).then(result => {
			if (Array.isArray(result)) {
				return <IReferenceInformation[]>result;
			}
			return undefined;
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(references => {
		const result: IReferenceInformation[] = [];
		for (const refs of references) {
			if (refs) {
				for (const ref of refs) {
					result.push(ref);
				}
			}
		}
		return result;
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeReferenceProvider', provideReferences);