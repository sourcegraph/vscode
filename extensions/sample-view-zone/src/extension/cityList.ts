/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

type CityItem = {
	name: string;
	value: boolean;
};

let ITEMS: CityItem[];
const ITEMS_KEY = 'cityList';

const INITIAL_ITEMS = ['San Francisco', 'Tokyo', 'Hong Kong', 'New York', 'London', 'Paris', 'Osaka', 'Buenos Aires', 'Mexico City', 'Shanghai', 'Dubai', 'Cairo', 'Berlin', 'Zurich', 'Sydney', 'Manila', 'Shenzhen', 'Manila', 'Bengaluru', 'Frankfurt', 'Marrakech', 'Abuja', 'Capetown', 'Macau', 'Oslo', 'Capetown', 'Beijing', 'Mumbai', 'Stockholm', 'Helsinki', 'Stockholm', 'Dakar', 'Tel Aviv', 'Taipei']
	.map(name => ({ name, value: false }));

export function activate(context: vscode.ExtensionContext): void {
	ITEMS = context.globalState.get<CityItem[]>(ITEMS_KEY, INITIAL_ITEMS.concat());

	const allViewZones: CityListViewZone[] = [];
	context.subscriptions.push(
		vscode.commands.registerCommand('sampleViewZone.cityList.create', (editor?: vscode.TextEditor, range?: vscode.Range) => {
			if (!editor || !(editor as any).document) {
				editor = vscode.window.activeTextEditor;
				range = undefined;
			}
			if (!editor) {
				return vscode.window.showErrorMessage('No active editor.');
			}
			if (!range) {
				range = editor.selection;
			}

			const viewZone = new CityListViewZone(editor, range);
			context.subscriptions.push(viewZone);

			// Add this view zone to the list, and remove it when it is disposed.
			allViewZones.push(viewZone);
			viewZone.onDidClose(() => {
				const index = allViewZones.indexOf(viewZone);
				if (index !== -1) {
					allViewZones.splice(index, -1);
				}
			}, null, context.subscriptions);

			// When items change in any view zone, persist the new items and broadcast updates
			// to all other view zones.
			viewZone.onDidChangeItems(newItems => {
				ITEMS = newItems;
				context.globalState.update(ITEMS_KEY, ITEMS);
				for (const v of allViewZones) {
					if (v !== viewZone) {
						v.refresh();
					}
				}
			}, null, context.subscriptions);
		}),
		vscode.commands.registerCommand('sampleViewZone.cityList.reset', viewZone => {
			ITEMS = INITIAL_ITEMS.concat();
			context.globalState.update(ITEMS_KEY, ITEMS);
			for (const v of allViewZones) {
				v.refresh();
			}
		}),
	);
}

class CityListViewZone implements vscode.Disposable {

	private viewZone?: vscode.TextEditorViewZone;
	private disposables: vscode.Disposable[] = [];

	private _onDidChangeItems = new vscode.EventEmitter<CityItem[]>();
	public get onDidChangeItems(): vscode.Event<CityItem[]> { return this._onDidChangeItems.event; }

	private _onDidClose = new vscode.EventEmitter<void>();
	public get onDidClose(): vscode.Event<void> { return this._onDidClose.event; }

	constructor(
		editor: vscode.TextEditor,
		range: vscode.Range,
	) {
		this.viewZone = editor.createViewZone('cityList', {
			type: 'html',
			value: `
				<!DOCTYPE html>
				<html>
					<head><meta charset="utf-8" /></head>
					<body>
						<script src="${path.join(__dirname, '..', 'view', 'cityList.js')}"></script>
					</body>
				</html>`,
		});
		this.viewZone.header = {
			primaryHeading: 'Cities',
			secondaryHeading: 'List',
			metaHeading: '—Select or add a city',
		};

		// Send initial data.
		this.refresh();

		// Listen for updates to data.
		this.viewZone.onMessage(message => this._onDidChangeItems.fire(JSON.parse(message) as CityItem[]), null, this.disposables);

		// Dispose the view zone and other listeners when it's closed (or disposed itself).
		this.viewZone.onDidClose(() => {
			this.viewZone = undefined;
			this.dispose();
		}, null, this.disposables);

		// Show the view zone.
		this.viewZone.show(range);
	}

	public refresh(): void {
		if (this.viewZone) {
			this.viewZone.postMessage(JSON.stringify(ITEMS));
		}
	}

	public dispose(): void {
		if (this.viewZone) {
			this.viewZone.dispose();
			this.viewZone = undefined;
		}
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
		this._onDidClose.fire();
	}
}
