/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// This file runs in an Electron webview that is isolated from the extension.

declare function postMessageToExtension(message: string): void;
declare function onMessageFromExtension(callback: (message: string, origin: string) => void): void;
declare function requestLayout(height: number): void;

// Use a module to avoid this file's global declarations conflicting with those from other files.
// (TypeScript considers a file with no root-level imports or exports to be a global module with
// that behavior.)
module loremIpsum {
	type Operation = { action: 'get' } | { action: 'set', value: string };

	const paragraphElement = document.createElement('p');
	document.body.appendChild(paragraphElement);

	onMessageFromExtension(message => {
		const op = JSON.parse(message) as Operation;
		switch (op.action) {
			case 'get':
				postMessageToExtension(paragraphElement.innerText);
				break;

			case 'set':
				paragraphElement.innerText = op.value;

				// Add some more elements to test the context menu.
				//
				// Add an image.
				paragraphElement.appendChild(document.createTextNode(' '));
				const image = document.createElement('img');
				image.src = '../../../../../../extensions/sample-view-zone/resources/icons/dark/add.svg';
				paragraphElement.appendChild(image);
				// Add a link.
				paragraphElement.appendChild(document.createTextNode(' '));
				const link = document.createElement('a');
				link.href = 'https://en.wikipedia.org/wiki/Lorem_ipsum';
				link.innerText = 'Wikipedia';
				link.style.color = 'var(--color)';
				paragraphElement.appendChild(link);

				resizeToFit();
				break;
		}
	});

	// When our width changes, our content reflows and the height of our content may change.
	// If so, we want to resize this zone view to fit our content (so there's no scrolling or
	// extraneous empty space).
	let lastContentHeight: number = -1;
	window.parent.addEventListener('resize', resizeToFit);

	function resizeToFit(): void {
		const contentHeight = document.firstElementChild!.scrollHeight;
		if (contentHeight !== lastContentHeight) {
			lastContentHeight = contentHeight;
			requestLayout(contentHeight);
		}
	}
}
