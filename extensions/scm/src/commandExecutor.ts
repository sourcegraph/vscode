/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as log from './log';
import { shellFormat } from './util';

/**
 * Wraps a vscode.SourceControl's vscode.CommandExecutor to add logging and caching.
 */
export function loggingCommandExecutor(label: string, commandExecutor: vscode.CommandExecutor): vscode.CommandExecutor {
	return {
		executeCommand: (args: string[]): Thenable<string> => {
			return commandExecutor.executeCommand(args).then(
				output => {
					logCommand(label, args, output);
					return output;
				},
				err => {
					logCommand(label, args, undefined, err);
					throw err;
				});
		}
	};
}

function logCommand(label: string, command: string[], output: string | undefined, error?: Error): void {
	if (!log.isEnabled()) {
		return;
	}

	log.debug(`● ${label}: git ${shellFormat(command)}`);
	if (error) {
		log.debug(`\tERROR: ${error}`);
	} else {
		const max = 500;
		let excerpt: string;
		if (!output) {
			excerpt = '(blank)';
		} else if (output.length <= max) {
			excerpt = output;
		} else {
			excerpt = `${JSON.stringify(output.slice(0, max))} (+ ${output.length - max} bytes)`;
		}
		log.debug(`\tOutput: ${excerpt}`);
	}
}
