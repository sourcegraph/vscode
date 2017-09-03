/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';
import { asWinJsPromise } from 'vs/base/common/async';
import { TrieMap } from 'vs/base/common/map';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostCommands, CommandsConverter } from 'vs/workbench/api/node/extHostCommands';
import { MainContext, MainThreadSCMShape, InputHandle, SCMRawResource, IMainContext } from './extHost.protocol';
import * as vscode from 'vscode';
import * as types from 'vs/base/common/types';

function getIconPath(decorations: vscode.SourceControlResourceThemableDecorations) {
	if (!decorations) {
		return undefined;
	} else if (typeof decorations.iconPath === 'string') {
		return URI.file(decorations.iconPath).toString();
	} else if (decorations.iconPath) {
		return `${decorations.iconPath}`;
	}
	return undefined;
}

export class ExtHostSCMInputBox {

	private _value: string = '';

	get value(): string {
		return this._value;
	}

	set value(value: string) {
		this._proxy.$setInputBoxValue(this._sourceControlHandle, this._inputHandle, value);
		this.updateValue(value);
	}

	private _onDidChange = new Emitter<string>();

	get onDidChange(): Event<string> {
		return this._onDidChange.event;
	}

	constructor(private _proxy: MainThreadSCMShape, private _sourceControlHandle: number, private _inputHandle: InputHandle) {
		// noop
	}

	$onInputBoxValueChange(value: string): void {
		this.updateValue(value);
	}

	private updateValue(value: string): void {
		this._value = value;
		this._onDidChange.fire(value);
	}
}

class ExtHostSourceControlResourceGroup implements vscode.SourceControlResourceGroup {

	private static _handlePool: number = 0;
	private _resourceHandlePool: number = 0;
	private _resourceStates: vscode.SourceControlResourceState[] = [];
	private _resourceStatesRollingDisposables: { (): void }[] = [];
	private _resourceStatesMap: Map<ResourceStateHandle, vscode.SourceControlResourceState> = new Map<ResourceStateHandle, vscode.SourceControlResourceState>();

	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	set label(label: string) {
		this._label = label;
		this._proxy.$updateGroupLabel(this._sourceControlHandle, this._handle, label);
	}

	private _hideWhenEmpty: boolean | undefined = undefined;

	get hideWhenEmpty(): boolean | undefined {
		return this._hideWhenEmpty;
	}

	set hideWhenEmpty(hideWhenEmpty: boolean | undefined) {
		this._hideWhenEmpty = hideWhenEmpty;
		this._proxy.$updateGroup(this._sourceControlHandle, this._handle, { hideWhenEmpty });
	}

	get resourceStates(): vscode.SourceControlResourceState[] {
		return [...this._resourceStates];
	}

	set resourceStates(resources: vscode.SourceControlResourceState[]) {
		this._resourceStates = [...resources];

		const handles: number[] = [];
		const rawResources = resources.map(r => {
			const handle = this._resourceHandlePool++;
			this._resourceStatesMap.set(handle, r);
			handles.push(handle);

			const sourceUri = r.resourceUri.toString();
			const command = this._commands.toInternal(r.command);
			const iconPath = getIconPath(r.decorations);
			const lightIconPath = r.decorations && getIconPath(r.decorations.light) || iconPath;
			const darkIconPath = r.decorations && getIconPath(r.decorations.dark) || iconPath;
			const icons: string[] = [];

			if (lightIconPath || darkIconPath) {
				icons.push(lightIconPath);
			}

			if (darkIconPath !== lightIconPath) {
				icons.push(darkIconPath);
			}

			const tooltip = (r.decorations && r.decorations.tooltip) || '';
			const strikeThrough = r.decorations && !!r.decorations.strikeThrough;
			const faded = r.decorations && !!r.decorations.faded;

			return [handle, sourceUri, command, icons, tooltip, strikeThrough, faded] as SCMRawResource;
		});

		const disposable = () => handles.forEach(handle => this._resourceStatesMap.delete(handle));
		this._resourceStatesRollingDisposables.push(disposable);

		while (this._resourceStatesRollingDisposables.length >= 10) {
			this._resourceStatesRollingDisposables.shift()();
		}

		this._proxy.$updateGroupResourceStates(this._sourceControlHandle, this._handle, rawResources);
	}

	private _handle: GroupHandle = ExtHostSourceControlResourceGroup._handlePool++;
	get handle(): GroupHandle {
		return this._handle;
	}

	constructor(
		private _proxy: MainThreadSCMShape,
		private _commands: CommandsConverter,
		private _sourceControlHandle: number,
		private _id: string,
		private _label: string,
	) {
		this._proxy.$registerGroup(_sourceControlHandle, this._handle, _id, _label);
	}

	getResourceState(handle: number): vscode.SourceControlResourceState | undefined {
		return this._resourceStatesMap.get(handle);
	}

	dispose(): void {
		this._proxy.$unregisterGroup(this._sourceControlHandle, this._handle);
	}
}

class ExtHostSourceControl implements vscode.SourceControl {

	private static _handlePool: number = 0;
	private _groups: Map<GroupHandle, ExtHostSourceControlResourceGroup> = new Map<GroupHandle, ExtHostSourceControlResourceGroup>();

	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	private _inputBox: ExtHostSCMInputBox;
	get inputBox(): ExtHostSCMInputBox { return this._inputBox; }

	private _specifierBox: ExtHostSCMInputBox;
	get specifierBox(): ExtHostSCMInputBox { return this._specifierBox; }

	public commandExecutor?: vscode.CommandExecutor;

	private _count: number | undefined = undefined;

	get count(): number | undefined {
		return this._count;
	}

	set count(count: number | undefined) {
		this._count = count;
		this._proxy.$updateSourceControl(this._handle, { count });
	}

	private _quickDiffProvider: vscode.QuickDiffProvider | undefined = undefined;

	get quickDiffProvider(): vscode.QuickDiffProvider | undefined {
		return this._quickDiffProvider;
	}

	set quickDiffProvider(quickDiffProvider: vscode.QuickDiffProvider | undefined) {
		this._quickDiffProvider = quickDiffProvider;
		this._proxy.$updateSourceControl(this._handle, { hasQuickDiffProvider: !!quickDiffProvider });
	}

	private _commitTemplate: string | undefined = undefined;

	get commitTemplate(): string | undefined {
		return this._commitTemplate;
	}

	set commitTemplate(commitTemplate: string | undefined) {
		this._commitTemplate = commitTemplate;
		this._proxy.$updateSourceControl(this._handle, { commitTemplate });
	}

	private _acceptInputCommand: vscode.Command | undefined = undefined;

	get acceptInputCommand(): vscode.Command | undefined {
		return this._acceptInputCommand;
	}

	set acceptInputCommand(acceptInputCommand: vscode.Command | undefined) {
		this._acceptInputCommand = acceptInputCommand;

		const internal = this._commands.toInternal(acceptInputCommand);
		this._proxy.$updateSourceControl(this._handle, { acceptInputCommand: internal });
	}

	private _acceptSpecifierCommand: vscode.Command | undefined = undefined;

	get acceptSpecifierCommand(): vscode.Command | undefined {
		return this._acceptSpecifierCommand;
	}

	set acceptSpecifierCommand(acceptSpecifierCommand: vscode.Command | undefined) {
		this._acceptSpecifierCommand = acceptSpecifierCommand;

		const internal = this._commands.toInternal(acceptSpecifierCommand);
		this._proxy.$updateSourceControl(this._handle, { acceptSpecifierCommand: internal });
	}

	private _statusBarCommands: vscode.Command[] | undefined = undefined;

	get statusBarCommands(): vscode.Command[] | undefined {
		return this._statusBarCommands;
	}

	set statusBarCommands(statusBarCommands: vscode.Command[] | undefined) {
		this._statusBarCommands = statusBarCommands;

		const internal = (statusBarCommands || []).map(c => this._commands.toInternal(c));
		this._proxy.$updateSourceControl(this._handle, { statusBarCommands: internal });
	}

	get rootFolder(): vscode.Uri | undefined {
		return this._rootFolder;
	}

	private _revision: vscode.SCMRevision | undefined = undefined;

	get revision(): vscode.SCMRevision {
		return this._revision;
	}

	set revision(revision: vscode.SCMRevision) {
		this._revision = revision;

		this._proxy.$updateSourceControl(this._handle, { revision });
	}

	private _setRevisionCommand: vscode.Command | undefined = undefined;

	get setRevisionCommand(): vscode.Command | undefined {
		return this._setRevisionCommand;
	}

	set setRevisionCommand(setRevisionCommand: vscode.Command | undefined) {
		this._setRevisionCommand = setRevisionCommand;

		const internal = this._commands.toInternal(setRevisionCommand);
		this._proxy.$updateSourceControl(this._handle, { setRevisionCommand: internal });
	}

	private _remoteResources: vscode.Uri[] | undefined = undefined;

	get remoteResources(): vscode.Uri[] | undefined {
		return this._remoteResources;
	}

	set remoteResources(resources: vscode.Uri[] | undefined) {
		this._remoteResources = resources;

		this._proxy.$updateSourceControl(this._handle, { remoteResources: resources as URI[] });
	}

	private _handle: number = ExtHostSourceControl._handlePool++;

	constructor(
		private _scm: ExtHostSCM,
		private _proxy: MainThreadSCMShape,
		private _commands: CommandsConverter,
		private _id: string,
		private _label: string,
		private _rootFolder: URI,
	) {
		this._inputBox = new ExtHostSCMInputBox(this._proxy, this._handle, InputHandle.InputBox);
		this._specifierBox = new ExtHostSCMInputBox(this._proxy, this._handle, InputHandle.SpecifierBox);
		this._proxy.$registerSourceControl(this._handle, _id, _label, _rootFolder);
	}

	createResourceGroup(id: string, label: string): ExtHostSourceControlResourceGroup {
		const group = new ExtHostSourceControlResourceGroup(this._proxy, this._commands, this._handle, id, label);
		this._groups.set(group.handle, group);
		return group;
	}

	getResourceGroup(handle: GroupHandle): ExtHostSourceControlResourceGroup | undefined {
		return this._groups.get(handle);
	}

	dispose(): void {
		this._proxy.$unregisterSourceControl(this._handle);
	}
}

type ProviderHandle = number;
type GroupHandle = number;
type ResourceStateHandle = number;

type SourceControlRootFolder = { handle: number, rootFolder: string };
type SourceControlHandle = { handle: number };

export class ExtHostSCM {

	private static _handlePool: number = 0;

	private _proxy: MainThreadSCMShape;
	private _sourceControls: Map<ProviderHandle, ExtHostSourceControl> = new Map<ProviderHandle, ExtHostSourceControl>();
	private _sourceControlsByExtension: Map<string, ExtHostSourceControl[]> = new Map<string, ExtHostSourceControl[]>();

	private _onDidChangeActiveProvider = new Emitter<vscode.SourceControl>();
	get onDidChangeActiveProvider(): Event<vscode.SourceControl> { return this._onDidChangeActiveProvider.event; }

	/**
	 * All associations between a root folder and the source control that provides SCM
	 * information about resources inside the folder.
	 */
	private _folderSourceControls: SourceControlRootFolder[] = [];

	/**
	 * Map of source control root folders to the source control that is used to provide
	 * SCM information about resources inside the folder. This data structure is kept in
	 * sync with the equivalent map in the main process.
	 */
	private _folderSourceControlsMap: TrieMap<SourceControlHandle>;

	constructor(
		mainContext: IMainContext,
		private _commands: ExtHostCommands
	) {
		this._proxy = mainContext.get(MainContext.MainThreadSCM);

		this.updateFolderSourceControlsMap();

		_commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.$mid === 3) {
					const sourceControl = this._sourceControls.get(arg.sourceControlHandle);

					if (!sourceControl) {
						return arg;
					}

					const group = sourceControl.getResourceGroup(arg.groupHandle);

					if (!group) {
						return arg;
					}

					return group.getResourceState(arg.handle);
				} else if (arg && arg.$mid === 4) {
					const sourceControl = this._sourceControls.get(arg.sourceControlHandle);

					if (!sourceControl) {
						return arg;
					}

					return sourceControl.getResourceGroup(arg.groupHandle);
				} else if (arg && arg.$mid === 5) {
					const sourceControl = this._sourceControls.get(arg.handle);

					if (!sourceControl) {
						return arg;
					}

					return sourceControl;
				}

				return arg;
			}
		});
	}

	createSourceControl(extension: IExtensionDescription, id: string, label: string): vscode.SourceControl;
	createSourceControl(extension: IExtensionDescription, id: string, options: vscode.SourceControlOptions): vscode.SourceControl;
	createSourceControl(extension: IExtensionDescription, id: string, arg: string | vscode.SourceControlOptions): vscode.SourceControl {
		if (types.isString(arg)) {
			arg = { label: arg };
		}
		const handle = ExtHostSCM._handlePool++;
		const sourceControl = new ExtHostSourceControl(this, this._proxy, this._commands.converter, id, arg.label, arg.rootFolder as URI);
		this._sourceControls.set(handle, sourceControl);

		if (arg.rootFolder) {
			this._folderSourceControls.push({ handle, rootFolder: arg.rootFolder.toString() });
			this.updateFolderSourceControlsMap();
		}

		const sourceControls = this._sourceControlsByExtension.get(extension.id) || [];
		sourceControls.push(sourceControl);
		this._sourceControlsByExtension.set(extension.id, sourceControls);

		return sourceControl;
	}

	// Deprecated
	getLastInputBox(extension: IExtensionDescription): ExtHostSCMInputBox {
		const sourceControls = this._sourceControlsByExtension.get(extension.id);
		const sourceControl = sourceControls && sourceControls[sourceControls.length - 1];
		const inputBox = sourceControl && sourceControl.inputBox;

		return inputBox;
	}

	$provideOriginalResource(sourceControlHandle: number, uri: URI): TPromise<URI> {
		const sourceControl = this._sourceControls.get(sourceControlHandle);

		if (!sourceControl || !sourceControl.quickDiffProvider) {
			return TPromise.as(null);
		}

		return asWinJsPromise(token => {
			const result = sourceControl.quickDiffProvider.provideOriginalResource(uri, token);
			return result && URI.parse(result.toString());
		});
	}

	$onInputBoxValueChange(sourceControlHandle: number, inputHandle: InputHandle, value: string): TPromise<void> {
		const sourceControl = this._sourceControls.get(sourceControlHandle);

		console.log('$onInputBoxValueChange', InputHandle[inputHandle], value, sourceControl);

		if (!sourceControl || !sourceControl.quickDiffProvider) {
			return TPromise.as(null);
		}

		switch (inputHandle) {
			case InputHandle.InputBox: sourceControl.inputBox.$onInputBoxValueChange(value); break;
			case InputHandle.SpecifierBox: sourceControl.specifierBox.$onInputBoxValueChange(value); break;
		}

		return TPromise.as(null);
	}

	$executeCommand(sourceControlHandle: number, args: string[], options?: vscode.CommandOptions): TPromise<string> {
		const sourceControl = this._sourceControls.get(sourceControlHandle);
		if (!sourceControl || !sourceControl.commandExecutor) {
			return TPromise.wrapError(new Error('no source control or command executor'));
		}
		return asWinJsPromise(token => {
			return sourceControl.commandExecutor.executeCommand(args, options);
		});
	}

	getSourceControlForResource(resource: vscode.Uri): vscode.SourceControl | undefined {
		const handle = this._folderSourceControlsMap.findSubstr(resource.toString());
		if (!handle) {
			return undefined;
		}
		return this._sourceControls.get(handle.handle);
	}

	private updateFolderSourceControlsMap(): void {
		this._folderSourceControlsMap = new TrieMap<SourceControlHandle>(TrieMap.PathSplitter);
		for (const { handle, rootFolder } of this._folderSourceControls) {
			this._folderSourceControlsMap.insert(rootFolder, { handle });
		}
	}
}
