/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventEmitter, ExtensionContext, SymbolKind, SymbolInformation, TextDocument, TextEditor, TreeDataProvider, TreeItem, TreeItemCollapsibleState, commands, window, workspace } from 'vscode';
import * as path from 'path';
import { languageSymbolHandlers } from './languageSymbolHandlers';

interface NamespaceSeparators {
	[languageId: string]: string;
}

let optsSortOrder: number[] = [];
let optsTopLevel: number[] = [];
let optsDoSort = true;
let namespaceSeparators: NamespaceSeparators = {};

export class SymbolNode {
	symbol: SymbolInformation;
	children?: SymbolNode[];

	constructor(symbol?: SymbolInformation) {
		this.children = [];
		this.symbol = symbol;
	}

	private getKindOrder(kind: SymbolKind): number {
		let ix = optsSortOrder.indexOf(kind);
		if (ix < 0) {
			ix = optsSortOrder.indexOf(-1);
		}
		return ix;
	}

	private compareSymbols(a: SymbolNode, b: SymbolNode): number {
		const kindOrder = this.getKindOrder(a.symbol.kind) - this.getKindOrder(b.symbol.kind);
		if (kindOrder !== 0) {
			return kindOrder;
		}
		if (a.symbol.name.toLowerCase() > b.symbol.name.toLowerCase()) {
			return 1;
		}
		return -1;
	}

	sort() {
		this.children.sort(this.compareSymbols.bind(this));
		this.children.forEach(child => child.sort());
	}

	addChild(child: SymbolNode) {
		this.children.push(child);
	}
}

export class SymbolOutlineProvider implements TreeDataProvider<SymbolNode> {
	private _onDidChangeTreeData: EventEmitter<SymbolNode | null> = new EventEmitter<SymbolNode | null>();
	readonly onDidChangeTreeData: Event<SymbolNode | null> = this._onDidChangeTreeData.event;

	private context: ExtensionContext;
	private tree: SymbolNode;
	private editor: TextEditor;

	private getSymbols(document: TextDocument): Thenable<SymbolInformation[]> {
		return commands.executeCommand<SymbolInformation[]>('vscode.executeDocumentSymbolProvider', document.uri);
	}

	private async updateSymbols(editor: TextEditor): Promise<void> {
		const tree = new SymbolNode();
		this.editor = editor;
		if (editor) {
			readOpts();
			let symbols = await this.getSymbols(editor.document);
			if (optsTopLevel.indexOf(-1) < 0) {
				symbols = symbols.filter(sym => optsTopLevel.indexOf(sym.kind) >= 0);
			}
			symbols.reduce((knownContainerScopes, symbol) => {
				let parent: SymbolNode = knownContainerScopes[''];
				const immediateContainerName = extractSymbolName(editor.document.languageId, symbol.containerName);
				if (immediateContainerName in knownContainerScopes) {
					parent = knownContainerScopes[immediateContainerName];
				}

				const node = new SymbolNode(symbol);
				parent.addChild(node);
				return { ...knownContainerScopes, [extractSymbolName(editor.document.languageId, symbol.name)]: node };
			}, { '': tree });
			if (optsDoSort) {
				tree.sort();
			}
		}
		this.tree = tree;
	}

	constructor(context: ExtensionContext) {
		this.context = context;
		window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				this.refresh();
			}
		});
		workspace.onDidCloseTextDocument(document => {
			if (!this.editor.document) {
				this.refresh();
			}
		});
		workspace.onDidChangeTextDocument(event => {
			if (!event.document.isDirty && this.editor && event.document === this.editor.document) {
				this.refresh();
			}
		});
		workspace.onDidSaveTextDocument(document => {
			if (document === this.editor.document) {
				this.refresh();
			}
		});
	}

	async getChildren(node?: SymbolNode): Promise<SymbolNode[]> {
		if (node) {
			return node.children;
		} else {
			await this.updateSymbols(window.activeTextEditor);
			return this.tree ? this.tree.children : [];
		}
	}

	private getIcon(kind: SymbolKind): { dark: string; light: string } {
		let icon: string;
		switch (kind) {
			case SymbolKind.Class:
				icon = 'class';
				break;
			case SymbolKind.Constant:
				icon = 'constant';
				break;
			case SymbolKind.Constructor:
			case SymbolKind.Function:
			case SymbolKind.Method:
				icon = 'function';
				break;
			case SymbolKind.Interface:
				icon = 'interface';
			case SymbolKind.Module:
			case SymbolKind.Namespace:
			case SymbolKind.Object:
			case SymbolKind.Package:
				icon = 'module';
				break;
			case SymbolKind.Property:
				icon = 'property';
				break;
			default:
				icon = 'variable';
				break;
		};
		icon = `icon-${icon}.svg`;
		return {
			dark: this.context.asAbsolutePath(path.join('resources', 'dark', icon)),
			light: this.context.asAbsolutePath(path.join('resources', 'light', icon))
		};
	}

	getTreeItem(node: SymbolNode): TreeItem {
		const { kind } = node.symbol;
		let treeItem = new TreeItem(node.symbol.name);
		treeItem.collapsibleState = node.children.length ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None;
		treeItem.command = {
			command: 'symbolOutline.revealRange',
			title: '',
			arguments: [this.editor, node.symbol.location.range]
		};
		treeItem.iconPath = this.getIcon(kind);
		return treeItem;
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}
}

function readOpts() {
	let opts = workspace.getConfiguration('symbolOutline');
	optsDoSort = opts.get<boolean>('doSort');
	optsSortOrder = convertEnumNames(opts.get<string[]>('sortOrder'));
	optsTopLevel = convertEnumNames(opts.get<string[]>('topLevel'));
	namespaceSeparators = opts.get<NamespaceSeparators>('namespaceSeparators');
}

function convertEnumNames(names: string[]): number[] {
	return names.map(str => {
		let v = SymbolKind[str];
		return typeof v === 'undefined' ? -1 : v;
	});
}

function extractSymbolName(languageId: string, name: string): string {
	// First, check if user has defined a custom separator property for this language
	if (namespaceSeparators[languageId] !== undefined) {
		const tokens = name.split(namespaceSeparators[languageId]);
		if (tokens.length) {
			return tokens[tokens.length - 1];
		}
	}
	// If not, check if we have registered a special handler for this language
	if (languageSymbolHandlers[languageId] !== undefined) {
		return languageSymbolHandlers[languageId](name);
	}
	return name;
}
