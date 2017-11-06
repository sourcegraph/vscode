/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter, once } from 'vs/base/common/event';
import { debounce } from 'vs/base/common/decorators';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { MainContext, MainThreadChecklistShape, ChecklistRawItem, ChecklistRawItemSplice, ChecklistRawItemSplices, IMainContext } from './extHost.protocol';
import { ProviderHandle, GroupHandle, ResourceStateHandle, getIconPath, compareResourceStatesDecorations } from './extHostSCM';
import { sortedDiff, Splice } from 'vs/base/common/arrays';
import * as vscode from 'vscode';

function compareItemStates(a: vscode.ChecklistItem, b: vscode.ChecklistItem): number {
	if (a.name !== b.name) {
		return a.name < b.name ? -1 : 1;
	}

	if (a.decorations && !b.decorations) {
		return 1;
	} else if (b.decorations && !a.decorations) {
		return -1;
	}
	return compareResourceStatesDecorations(a.decorations, b.decorations);
}

class ExtHostChecklistlistItemGroup implements vscode.ChecklistItemGroup {

	private static _handlePool: number = 0;
	private _itemHandlePool: number = 0;
	private _itemStates: vscode.ChecklistItem[] = [];

	private _itemStatesRollingDisposables: { (): void }[] = [];
	private _itemStatesMap: Map<ResourceStateHandle, vscode.ChecklistItem> = new Map<ResourceStateHandle, vscode.ChecklistItem>();
	private _itemStatesCommandsMap: Map<ResourceStateHandle, vscode.Command> = new Map<ResourceStateHandle, vscode.Command>();

	private _onDidUpdateItemStates = new Emitter<void>();
	readonly onDidUpdateItemStates = this._onDidUpdateItemStates.event;
	private _onDidDispose = new Emitter<void>();
	readonly onDidDispose = this._onDidDispose.event;

	private _handlesSnapshot: number[] = [];
	private _itemSnapshot: vscode.ChecklistItem[] = [];

	get id(): string { return this._id; }

	get label(): string { return this._label; }
	set label(label: string) {
		this._label = label;
		this._proxy.$updateGroupLabel(this._providerHandle, this.handle, label);
	}

	private _hideWhenEmpty: boolean | undefined = undefined;
	get hideWhenEmpty(): boolean | undefined { return this._hideWhenEmpty; }
	set hideWhenEmpty(hideWhenEmpty: boolean | undefined) {
		this._hideWhenEmpty = hideWhenEmpty;
		this._proxy.$updateGroup(this._providerHandle, this.handle, { hideWhenEmpty });
	}

	get itemStates(): vscode.ChecklistItem[] { return [...this._itemStates]; }
	set itemStates(items: vscode.ChecklistItem[]) {
		this._itemStates = [...items];
		this._onDidUpdateItemStates.fire();
	}

	readonly handle = ExtHostChecklistlistItemGroup._handlePool++;
	private _disposables: IDisposable[] = [];

	constructor(
		private _proxy: MainThreadChecklistShape,
		private _commands: ExtHostCommands,
		private _providerHandle: number,
		private _id: string,
		private _label: string,
	) {
		this._proxy.$registerGroup(_providerHandle, this.handle, _id, _label);
	}

	getItemState(handle: number): vscode.ChecklistItem | undefined {
		return this._itemStatesMap.get(handle);
	}

	async $executeItemCommand(handle: number): TPromise<void> {
		const command = this._itemStatesCommandsMap.get(handle);

		if (!command) {
			return;
		}

		this._commands.executeCommand(command.command, ...command.arguments);
	}

	_takeItemStateSnapshot(): ChecklistRawItemSplice[] {
		const snapshot: vscode.ChecklistItem[] = [...this._itemStates].sort(compareItemStates);
		const diffs: Splice<vscode.ChecklistItem>[] = sortedDiff(this._itemSnapshot, snapshot, compareItemStates);
		const handlesToDelete: number[] = [];

		const splices = diffs.map(diff => {
			const { start, deleteCount } = diff;
			const handles: number[] = [];

			const rawItems = diff.inserted
				.map(r => {
					const handle = this._itemHandlePool++;
					this._itemStatesMap.set(handle, r);
					handles.push(handle);

					const name = r.name;
					const description = r.description;
					const iconPath = getIconPath(r.decorations);
					const lightIconPath = r.decorations && getIconPath(r.decorations.light) || iconPath;
					const darkIconPath = r.decorations && getIconPath(r.decorations.dark) || iconPath;
					const icons: string[] = [];

					if (r.command) {
						this._itemStatesCommandsMap.set(handle, r.command);
					}

					if (lightIconPath || darkIconPath) {
						icons.push(lightIconPath);
					}

					if (darkIconPath !== lightIconPath) {
						icons.push(darkIconPath);
					}

					const tooltip = (r.decorations && r.decorations.tooltip) || '';
					const strikeThrough = r.decorations && !!r.decorations.strikeThrough;
					const faded = r.decorations && !!r.decorations.faded;

					return [handle, name, description, icons, tooltip, strikeThrough, faded] as ChecklistRawItem;
				});

			handlesToDelete.push(...this._handlesSnapshot.splice(start, deleteCount, ...handles));

			return [start, deleteCount, rawItems] as ChecklistRawItemSplice;
		});

		const disposable = () => handlesToDelete.forEach(handle => {
			this._itemStatesMap.delete(handle);
			this._itemStatesCommandsMap.delete(handle);
		});

		this._itemStatesRollingDisposables.push(disposable);

		while (this._itemStatesRollingDisposables.length >= 10) {
			this._itemStatesRollingDisposables.shift()();
		}

		this._itemSnapshot = snapshot;
		return splices;
	}

	dispose(): void {
		this._proxy.$unregisterGroup(this._providerHandle, this.handle);
		this._disposables = dispose(this._disposables);
		this._onDidDispose.fire();
	}
}

class ExtHostChecklistProvider implements vscode.ChecklistProvider {

	private static _handlePool: number = 0;
	private _groups: Map<GroupHandle, ExtHostChecklistlistItemGroup> = new Map<GroupHandle, ExtHostChecklistlistItemGroup>();

	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	private _count: number | undefined = undefined;

	get count(): number | undefined {
		return this._count;
	}

	set count(count: number | undefined) {
		this._count = count;
		this._proxy.$updateChecklistProvider(this.handle, { count });
	}

	private _statusBarCommands: vscode.Command[] | undefined = undefined;

	get statusBarCommands(): vscode.Command[] | undefined {
		return this._statusBarCommands;
	}

	set statusBarCommands(statusBarCommands: vscode.Command[] | undefined) {
		this._statusBarCommands = statusBarCommands;

		const internal = (statusBarCommands || []).map(c => this._commands.converter.toInternal(c));
		this._proxy.$updateChecklistProvider(this.handle, { statusBarCommands: internal });
	}

	private handle: number = ExtHostChecklistProvider._handlePool++;

	constructor(
		private _proxy: MainThreadChecklistShape,
		private _commands: ExtHostCommands,
		private _id: string,
		private _label: string,
	) {
		this._proxy.$registerChecklistProvider(this.handle, _id, _label);
	}

	private updatedItemGroups = new Set<ExtHostChecklistlistItemGroup>();

	createItemGroup(id: string, label: string): ExtHostChecklistlistItemGroup {
		const group = new ExtHostChecklistlistItemGroup(this._proxy, this._commands, this.handle, id, label);

		const updateListener = group.onDidUpdateItemStates(() => {
			this.updatedItemGroups.add(group);
			this.eventuallyUpdateItemStates();
		});

		once(group.onDidDispose)(() => {
			this.updatedItemGroups.delete(group);
			updateListener.dispose();
			this._groups.delete(group.handle);
		});

		this._groups.set(group.handle, group);
		return group;
	}

	@debounce(100)
	eventuallyUpdateItemStates(): void {
		const splices: ChecklistRawItemSplices[] = [];

		this.updatedItemGroups.forEach(group => {
			const snapshot = group._takeItemStateSnapshot();

			if (snapshot.length === 0) {
				return;
			}

			splices.push([group.handle, snapshot]);
		});

		if (splices.length > 0) {
			this._proxy.$spliceItemStates(this.handle, splices);
		}

		this.updatedItemGroups.clear();
	}

	getItemGroup(handle: GroupHandle): ExtHostChecklistlistItemGroup | undefined {
		return this._groups.get(handle);
	}

	dispose(): void {
		this._groups.forEach(group => group.dispose());
		this._proxy.$unregisterChecklistProvider(this.handle);
	}
}

export class ExtHostChecklist {

	private static _handlePool: number = 0;

	private _proxy: MainThreadChecklistShape;
	private _providers: Map<ProviderHandle, ExtHostChecklistProvider> = new Map<ProviderHandle, ExtHostChecklistProvider>();

	private _onDidChangeActiveProvider = new Emitter<vscode.ChecklistProvider>();
	get onDidChangeActiveProvider(): Event<vscode.ChecklistProvider> { return this._onDidChangeActiveProvider.event; }

	constructor(
		mainContext: IMainContext,
		private _commands: ExtHostCommands
	) {
		this._proxy = mainContext.get(MainContext.MainThreadChecklist);

		_commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.$mid === 93) {
					const provider = this._providers.get(arg.providerHandle);

					if (!provider) {
						return arg;
					}

					const group = provider.getItemGroup(arg.groupHandle);

					if (!group) {
						return arg;
					}

					return group.getItemState(arg.handle);
				} else if (arg && arg.$mid === 94) {
					const provider = this._providers.get(arg.providerHandle);

					if (!provider) {
						return arg;
					}

					return provider.getItemGroup(arg.groupHandle);
				} else if (arg && arg.$mid === 95) {
					const provider = this._providers.get(arg.handle);

					if (!provider) {
						return arg;
					}

					return provider;
				}

				return arg;
			}
		});
	}

	createChecklistProvider(extension: IExtensionDescription, id: string, label: string): vscode.ChecklistProvider {
		const handle = ExtHostChecklist._handlePool++;
		const provider = new ExtHostChecklistProvider(this._proxy, this._commands, id, label);
		this._providers.set(handle, provider);

		return provider;
	}

	async $executeItemCommand(providerHandle: number, groupHandle: number, handle: number): TPromise<void> {
		const provider = this._providers.get(providerHandle);

		if (!provider) {
			return;
		}

		const group = provider.getItemGroup(groupHandle);

		if (!group) {
			return;
		}

		group.$executeItemCommand(handle);
	}
}
