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
module cityList {
	type CityItem = {
		name: string;
		value: boolean;
	};

	let ITEMS: CityItem[];
	onMessageFromExtension(message => didUpdate(JSON.parse(message) as CityItem[]));
	function didUpdate(newItems: CityItem[]): void {
		ITEMS = newItems;
		render(ITEMS);
	}

	// Stylesheet
	const stylesheet = document.createElement('style');
	stylesheet.innerHTML = `
	ul { display: flex; flex-wrap: wrap; padding: 0; }
	li {
		list-style-type: none;
		flex: 0 0 120px;
		margin: 3px;
		border: solid 1px rgba(255, 255, 255, 0.08);
	}
	li:hover, li:focus {
		color: white;
		background-color: rgba(255, 255, 255, 0.03);
		border: solid 1px rgba(255, 255, 255, 0.25);
	}
	label, input[type=text] {
		display: block;
		padding: 3px 4px;
	}
	label {
		user-select: none;
	}
	label:not(.checked) {
		color: rgba(255, 255, 255, 0.4);
	}
	label.checked {
		color: white;
		background-color: rgba(255, 255, 255, 0.01);
	}
	input[type=checkbox] { vertical-align: -3px; }
	form { height: 100%; }
	input[type=text] {
		width: calc(100% - 10px - 4px);
		height: calc(100% - 5px);
		padding-left: 10px;
		background-color: transparent;
		color: white;
		border: none;
	}
`;
	document.head.appendChild(stylesheet);

	const container = document.createElement('ul');
	document.body.appendChild(container);
	document.addEventListener('change', event => update(event));
	function render(items: CityItem[], initial = false): void {
		// Clear items.
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}

		// Add items.
		for (const item of ITEMS) {
			container.appendChild(createItemElement(item));
		}

		// Add item input.
		const itemElement = document.createElement('li');
		const formElement = document.createElement('form');
		const inputElement = document.createElement('input');
		inputElement.type = 'text';
		inputElement.placeholder = 'Add...';
		inputElement.required = true;
		formElement.appendChild(inputElement);
		formElement.addEventListener('submit', event => {
			event.preventDefault();
			addItem(inputElement.value);
			inputElement.value = '';
		});
		itemElement.appendChild(formElement);
		container.appendChild(itemElement);

		resizeToFit();
	}

	function createItemElement(item: CityItem): HTMLElement {
		const itemElement = document.createElement('li');
		const labelElement = document.createElement('label');
		if (item.value) { labelElement.classList.add('checked'); }
		const checkboxElement = document.createElement('input');
		checkboxElement.type = 'checkbox';
		checkboxElement.checked = item.value;
		checkboxElement.value = ITEMS.indexOf(item).toString();
		labelElement.appendChild(checkboxElement);
		labelElement.appendChild(document.createTextNode(item.name));
		itemElement.appendChild(labelElement);
		return itemElement;
	}

	function update(event: Event) {
		const checkboxElement = event.target as HTMLInputElement;
		if (checkboxElement.type !== 'checkbox') {
			return;
		}
		const itemIndex = parseInt(checkboxElement.value, 10);
		ITEMS[itemIndex].value = !ITEMS[itemIndex].value;
		postMessageToExtension(JSON.stringify(ITEMS));

		const labelElement = checkboxElement.parentElement!;
		labelElement.classList.toggle('checked', checkboxElement.checked);
	}

	function addItem(newItemName: string): void {
		const newItem: CityItem = { name: newItemName, value: false };
		ITEMS.push(newItem);
		container.insertBefore(createItemElement(newItem), container.lastElementChild);
		resizeToFit();

		postMessageToExtension(JSON.stringify(ITEMS));
	}

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
