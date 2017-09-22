/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { getNextTickChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client, IIPCOptions } from 'vs/base/parts/ipc/node/ipc.cp';
import { IDebugParams } from 'vs/platform/environment/common/environment';
import { IDiffWorker, IDiffWorkerChannel, IDiffArgs, IDiffResult } from './worker/diffWorkerIpc';

/**
 * A client to a diff worker process.
 */
export class DiffWorkerClient implements IDiffWorker {
	private channel: IDiffWorkerChannel;

	constructor(diffDebug: IDebugParams) {
		const opts: IIPCOptions = {
			serverName: 'Diff Worker',
			args: ['--type=diffWorker'],
			timeout: 30 * 1000,
			env: {
				AMD_ENTRYPOINT: 'vs/workbench/services/codeComments/node/worker/diffWorkerApp',
				PIPE_LOGGING: 'true',
				VERBOSE_LOGGING: process.env.VERBOSE_LOGGING,
			},
			useQueue: true
		};

		if (diffDebug.port) {
			if (diffDebug.break) {
				opts.debugBrk = diffDebug.port;
			} else {
				opts.debug = diffDebug.port;
			}
		}

		const client = new Client(URI.parse(require.toUrl('bootstrap')).fsPath, opts);
		this.channel = getNextTickChannel(client.getChannel<IDiffWorkerChannel>('diffWorker'));
	}

	public diff(args: IDiffArgs): TPromise<IDiffResult> {
		return this.channel.call('diff', args);
	}
}