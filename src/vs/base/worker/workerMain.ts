/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {
	'use strict';

	let loadCode = function (moduleId) {
		// HACK: webpack doesn't support completely dynamic requires, so constrain this and make it be known if anything else is ever passed to it.
		if (moduleId !== 'vs/base/common/worker/simpleWorker') {
			throw new Error('can\'t dynamically load module ' + moduleId);
		}
		require(['vs/base/common/worker/simpleWorker'], function (ws) {
			setTimeout(function () {
				let messageHandler = ws.create((msg: any) => {
					(<any>self).postMessage(msg);
				}, null);

				self.onmessage = (e) => messageHandler.onmessage(e.data);
				while (beforeReadyMessages.length > 0) {
					self.onmessage(beforeReadyMessages.shift());
				}
			}, 0);
		});
	};

	let isFirstMessage = true;
	let beforeReadyMessages: MessageEvent[] = [];
	self.onmessage = (message) => {
		if (!isFirstMessage) {
			beforeReadyMessages.push(message);
			return;
		}

		isFirstMessage = false;
		loadCode(message.data);
	};
})();
