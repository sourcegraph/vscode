/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Server } from 'vs/base/parts/ipc/node/ipc.cp';
import { DiffWorkerChannel } from './diffWorkerIpc';
import { DiffWorker } from './diffWorker';

// This is the entrypoint to the diff worker process.
const server = new Server();
const worker = new DiffWorker();
const channel = new DiffWorkerChannel(worker);
server.registerChannel('diffWorker', channel);
