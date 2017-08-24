/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface IExecutionResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * Public API of the git extension, for other extensions to consume.
 */
export interface IGitExtension {
	git: {
		clone(url: string, parentPath: string): Thenable<string>;
		exec(cwd: string, args: string[], options?: any): Thenable<IExecutionResult>;
	};
}