/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { globals } from 'vs/base/common/platform';
import { logOnceWebWorkerWarning, IWorker, IWorkerCallback, IWorkerFactory } from 'vs/base/common/worker/simpleWorker';

// Option for hosts to overwrite the worker script url (used in the standalone editor)
const getCrossOriginWorkerScriptUrl: (workerId: string, label: string) => string = environment('getWorkerUrl', null);

function environment(name: string, fallback: any = false): any {
	if (globals.MonacoEnvironment && globals.MonacoEnvironment.hasOwnProperty(name)) {
		return globals.MonacoEnvironment[name];
	}

	return fallback;
}

function defaultGetWorkerUrl(workerId: string, label: string): string {
	// HACK: Disable the web worker, and remove the require call that would
	// otherwise cause Webpack to process it. If we require using worker-loader,
	// it tries to fetch the script from a URL "https://sourcegraph.com/myrepo/-/myfile.go function() { ..."
	// for some reason. This is a bug in Webpack and/or worker-loader. But we
	// can safely disable the web worker without loss of functionality, so
	// we choose that approach instead of debugging it for now.
	throw new Error('web worker disabled; this should be unreachable');
}
var getWorkerUrl = getCrossOriginWorkerScriptUrl || defaultGetWorkerUrl;

/**
 * A worker that uses HTML5 web workers so that is has
 * its own global scope and its own thread.
 */
class WebWorker implements IWorker {

	private id: number;
	private worker: Worker;

	constructor(moduleId: string, id: number, label: string, onMessageCallback: IWorkerCallback, onErrorCallback: (err: any) => void) {
		this.id = id;
		this.worker = new Worker(getWorkerUrl('workerMain.js', label));
		this.postMessage(moduleId);
		this.worker.onmessage = function (ev: any) {
			onMessageCallback(ev.data);
		};
		if (typeof this.worker.addEventListener === 'function') {
			this.worker.addEventListener('error', onErrorCallback);
		}
	}

	public getId(): number {
		return this.id;
	}

	public postMessage(msg: string): void {
		if (this.worker) {
			this.worker.postMessage(msg);
		}
	}

	public dispose(): void {
		this.worker.terminate();
		this.worker = null;
	}
}

export class DefaultWorkerFactory implements IWorkerFactory {

	private static LAST_WORKER_ID = 0;

	private _label: string;
	private _webWorkerFailedBeforeError: any;

	constructor(label: string) {
		this._label = label;
		this._webWorkerFailedBeforeError = false;
	}

	public create(moduleId: string, onMessageCallback: IWorkerCallback, onErrorCallback: (err: any) => void): IWorker {
		let workerId = (++DefaultWorkerFactory.LAST_WORKER_ID);

		if (this._webWorkerFailedBeforeError) {
			throw this._webWorkerFailedBeforeError;
		}

		return new WebWorker(moduleId, workerId, this._label || 'anonymous' + workerId, onMessageCallback, (err) => {
			logOnceWebWorkerWarning(err);
			this._webWorkerFailedBeforeError = err;
			onErrorCallback(err);
		});
	}
}
