/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'node-machine-id' {
	export function machineId(original?: boolean): Thenable<string>;
	export function machineIdSync(original?: boolean): string;
}
