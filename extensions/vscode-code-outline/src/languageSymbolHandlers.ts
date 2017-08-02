/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ILanguageSymbolHandler {
	(symbol: string): string;
}

export const languageSymbolHandlers = {
	'swift': removeTrailingParens
};

export function removeTrailingParens(symbol: string) {
	return symbol.split('(')[0];
}
