/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/folderActions';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction, Action } from 'vs/base/common/actions';
import * as DOM from 'vs/base/browser/dom';
import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { ActionItem, IActionItem, Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { VIEWLET_ID, IWorkspaceViewlet, IFolder, WorkspaceFolderState, IFoldersWorkbenchService } from 'vs/workbench/parts/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { ExplorerViewlet } from 'vs/workbench/parts/files/browser/explorerViewlet';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { BaseWorkspacesAction } from 'vs/workbench/browser/actions/workspaceActions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { buttonBackground, buttonForeground, buttonHoverBackground, contrastBorder, tagBackground, tagForeground, tagBorder, tagHoverBackground, tagHoverForeground, tagHoverBorder, registerColor } from 'vs/platform/theme/common/colorRegistry';
import { FolderSCMSwitchRevisionAction } from './scmFolderActions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IQuickOpenService } from 'vs/platform/quickOpen/common/quickOpen';

/**
 * For developer convenience. Shows a quickopen input field and adds the root folder
 * with the URI from user input.
 */
export class AddRootFolderResourceAction extends Action {

	public static ID = 'workbench.action.addRootFolderResource';
	public static LABEL = localize('openResource', "Add Folder to Workspace by URI");

	private static LAST_VALUE_STORAGE_KEY = 'addRootFolderResource.last';

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IStorageService private storageService: IStorageService,
		@IFoldersWorkbenchService private foldersWorkbenchService: IFoldersWorkbenchService,
		@IViewletService private viewletService: IViewletService
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const lastValue = this.storageService.get(AddRootFolderResourceAction.LAST_VALUE_STORAGE_KEY, StorageScope.GLOBAL);

		return this.quickOpenService.input({
			prompt: localize('openResourcePrompt', "Enter Folder URI"),
			value: lastValue,
		})
			.then(value => {
				if (!value) {
					return undefined;
				}

				this.storageService.store(AddRootFolderResourceAction.LAST_VALUE_STORAGE_KEY, value, StorageScope.GLOBAL);

				return this.foldersWorkbenchService.addFoldersAsWorkspaceRootFolders([URI.parse(value)]).then(() => {
					return this.viewletService.openViewlet(this.viewletService.getDefaultViewletId(), true);
				});
			});
	}
}

export class AddWorkspaceFolderAction extends Action {

	private static AddLabel = localize('addAction', "Add");
	private static AddingLabel = localize('adding', "Adding");

	private static Class = 'folder-action prominent add';
	private static AddingClass = 'folder-action add adding';

	private disposables: IDisposable[] = [];
	private _folder: IFolder;
	get folder(): IFolder { return this._folder; }
	set folder(folder: IFolder) { this._folder = folder; this.update(); }

	constructor(
		@IFoldersWorkbenchService private catalogService: IFoldersWorkbenchService,
	) {
		super('workspace.folder.add', AddWorkspaceFolderAction.AddLabel, AddWorkspaceFolderAction.Class, false);

		this.disposables.push(this.catalogService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.folder) {
			this.enabled = false;
			this.class = AddWorkspaceFolderAction.Class;
			this.label = AddWorkspaceFolderAction.AddLabel;
			return;
		}

		this.enabled = this.folder.state === WorkspaceFolderState.Inactive;

		if (this.folder.state === WorkspaceFolderState.Adding) {
			this.label = AddWorkspaceFolderAction.AddingLabel;
			this.class = AddWorkspaceFolderAction.AddingClass;
		} else {
			this.label = AddWorkspaceFolderAction.AddLabel;
			this.class = AddWorkspaceFolderAction.Class;
		}
	}

	run(): TPromise<any> {
		return this.catalogService.addFoldersAsWorkspaceRootFolders([this.folder]);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class RemoveWorkspaceFolderAction extends Action {

	private static RemoveLabel = localize('removeAction', "Remove");
	private static RemovingLabel = localize('Removing', "Removing");

	private static RemoveClass = 'folder-action remove';
	private static RemovingClass = 'folder-action remove removing';

	private disposables: IDisposable[] = [];
	private _folder: IFolder;
	get folder(): IFolder { return this._folder; }
	set folder(folder: IFolder) { this._folder = folder; this.update(); }

	constructor(
		@IFoldersWorkbenchService private catalogService: IFoldersWorkbenchService,
	) {
		super('workspace.folder.remove', RemoveWorkspaceFolderAction.RemoveLabel, RemoveWorkspaceFolderAction.RemoveClass, false);

		this.disposables.push(this.catalogService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		if (!this.folder) {
			this.enabled = false;
			return;
		}

		const state = this.folder.state;

		if (state === WorkspaceFolderState.Removing) {
			this.label = RemoveWorkspaceFolderAction.RemovingLabel;
			this.class = RemoveWorkspaceFolderAction.RemovingClass;
			this.enabled = false;
			return;
		}

		this.label = RemoveWorkspaceFolderAction.RemoveLabel;
		this.class = RemoveWorkspaceFolderAction.RemoveClass;

		this.enabled = state === WorkspaceFolderState.Active;
	}

	run(): TPromise<any> {
		return this.catalogService.removeFoldersAsWorkspaceRootFolders([this.folder]);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

/**
 * Remove multiple workspace folders.
 */
export class RemoveWorkspaceFoldersAction extends Action {

	constructor(
		private foldersToRemove: IFolder[],
		@IFoldersWorkbenchService private catalogService: IFoldersWorkbenchService,
	) {
		super('workspace.folder.removeMultiple');
	}

	run(): TPromise<any> {
		return this.catalogService.removeFoldersAsWorkspaceRootFolders(this.foldersToRemove);
	}
}

export class RemoveWorkspaceFolderExplorerAction extends Action {

	private static LABEL = localize('removeFolderFromWorkspace', "Remove Folder from Workspace");

	constructor(
		private folder: URI,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
		super('workspace.folder.remove', RemoveWorkspaceFolderExplorerAction.LABEL, 'remove-action');
	}

	run(): TPromise<any> {
		return this.workspaceEditingService.removeRoots([this.folder])
			.then(() => this.configurationService.reloadConfiguration());
	}
}

export class ExploreWorkspaceFolderAction extends Action {

	private static LABEL = localize('exploreFolderAction', "Show in File Explorer");

	private _folder: IFolder;
	get folder(): IFolder { return this._folder; }
	set folder(folder: IFolder) { this._folder = folder; this.update(); }

	constructor(
		@IViewletService private viewletService: IViewletService,
		@IFoldersWorkbenchService private catalogService: IFoldersWorkbenchService,
	) {
		super('workspace.folder.showInExplorer', ExploreWorkspaceFolderAction.LABEL, 'folder-action explore', false);

		this.update();
	}

	private update(): void {
		this.enabled = this.folder && this.folder.state === WorkspaceFolderState.Active;
	}

	run(): TPromise<any> {
		return this.viewletService.openViewlet(EXPLORER_VIEWLET_ID, true).then((viewlet: ExplorerViewlet) => {
			const explorerView = viewlet.getExplorerView();
			if (explorerView) {
				explorerView.select(this.catalogService.getWorkspaceFolderForCatalogFolder(this.folder), true);
				explorerView.expand();
			}
			return void 0;
		});
	}
}

export class AddAndExploreWorkspaceFolderAction extends Action {

	private static LABEL = localize('addAndExploreFolderAction', "Add and Show in File Explorer");

	private _folder: IFolder;
	get folder(): IFolder { return this._folder; }
	set folder(folder: IFolder) {
		this._folder = folder;
		this.addAction.folder = this.folder;
		this.exploreAction.folder = this.folder;
		this.update();
	}

	private addAction: AddWorkspaceFolderAction;
	private exploreAction: ExploreWorkspaceFolderAction;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super('workspace.folder.addAndShowInExplorer', AddAndExploreWorkspaceFolderAction.LABEL, 'folder-action add-explore', false);

		this.addAction = instantiationService.createInstance(AddWorkspaceFolderAction);
		this.exploreAction = instantiationService.createInstance(ExploreWorkspaceFolderAction);

		this.update();
	}

	private update(): void {
		this.enabled = this.folder && this.folder.state === WorkspaceFolderState.Inactive;
	}

	run(): TPromise<any> {
		return this.addAction.run()
			.then(() => this.exploreAction.run());
	}
}

export interface IFolderAction extends IAction {
	folder: IFolder;
}

export class DropDownMenuActionItem extends ActionItem {

	private disposables: IDisposable[] = [];
	private _folder: IFolder;

	constructor(action: IAction, private menuActionGroups: IFolderAction[][],
		@IContextMenuService private contextMenuService: IContextMenuService
	) {
		super(null, action, { icon: true, label: true });
		for (const menuActions of menuActionGroups) {
			this.disposables = [...this.disposables, ...menuActions];
		}
	}

	get folder(): IFolder { return this._folder; }

	set folder(folder: IFolder) {
		this._folder = folder;
		for (const menuActions of this.menuActionGroups) {
			for (const menuAction of menuActions) {
				menuAction.folder = folder;
			}
		}
	}

	public showMenu(): void {
		const actions = this.getActions();
		let elementPosition = DOM.getDomNodePagePosition(this.builder.getHTMLElement());
		const anchor = { x: elementPosition.left, y: elementPosition.top + elementPosition.height + 10 };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => TPromise.wrap(actions),
			actionRunner: this.actionRunner
		});
	}

	private getActions(): IAction[] {
		let actions: IAction[] = [];
		const menuActionGroups = this.menuActionGroups.filter(group => group.some(action => action.enabled));
		for (const menuActions of menuActionGroups) {
			actions = [...actions, ...menuActions, new Separator()];
		}
		return actions.length ? actions.slice(0, actions.length - 1) : actions;
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class ManageWorkspaceFolderAction extends Action {

	static ID = 'workspace.folder.manage';

	private static Class = 'folder-action manage';
	private static HideManageWorkspaceFolderClass = `${ManageWorkspaceFolderAction.Class} hide`;

	private _actionItem: DropDownMenuActionItem;
	get actionItem(): IActionItem { return this._actionItem; }

	private disposables: IDisposable[] = [];
	private _folder: IFolder;
	get folder(): IFolder { return this._folder; }
	set folder(folder: IFolder) { this._folder = folder; this._actionItem.folder = folder; this.update(); }

	constructor(
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IFoldersWorkbenchService private catalogService: IFoldersWorkbenchService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(ManageWorkspaceFolderAction.ID);

		this._actionItem = this.instantiationService.createInstance(DropDownMenuActionItem, this, [
			[
				instantiationService.createInstance(FolderSCMSwitchRevisionAction),
			],
			[
				instantiationService.createInstance(ExploreWorkspaceFolderAction),
			],
			[
				instantiationService.createInstance(RemoveWorkspaceFolderAction)
			]
		]);
		this.disposables.push(this._actionItem);

		this.disposables.push(this.catalogService.onChange(() => this.update()));
		this.update();
	}

	private update(): void {
		this.class = ManageWorkspaceFolderAction.HideManageWorkspaceFolderClass;
		this.tooltip = '';
		this.enabled = false;
		if (this.folder) {
			const state = this.folder.state;
			this.enabled = state === WorkspaceFolderState.Active;
			this.class = this.enabled || state === WorkspaceFolderState.Removing ? ManageWorkspaceFolderAction.Class : ManageWorkspaceFolderAction.HideManageWorkspaceFolderClass;
			this.tooltip = state === WorkspaceFolderState.Removing ? localize('ManageWorkspaceFolderAction.removingTooltip', "Removing") : '';
		}
	}

	public run(): TPromise<any> {
		this._actionItem.showMenu();
		return TPromise.wrap(null);
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class OpenWorkspaceViewletAction extends ToggleViewletAction {
	public static ID = VIEWLET_ID;
	public static LABEL = localize('showWorkspaceViewlet', "Show Workspace");

	constructor(
		id: string,
		label: string,
		@IViewletService viewletService: IViewletService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService
	) {
		super(id, label, VIEWLET_ID, viewletService, editorService);
	}
}

export class AddLocalWorkspaceFolderAction extends BaseWorkspacesAction {

	static ID = 'workbench.workspace.action.addLocalFolder';
	static LABEL = localize('addLocalFolder', "Add Local Folder...");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		onSearchChange: Event<string>,
		@IWindowService windowService: IWindowService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IConfigurationService private configurationService: IConfigurationService,
	) {
		super(id, label, windowService, environmentService, contextService);
		this.class = 'add-local-folder';
		this.enabled = true;
		onSearchChange(this.onSearchChange, this, this.disposables);
	}

	private onSearchChange(value: string): void {
		this.enabled = !value;
	}

	public run(): TPromise<any> {
		if (!this.contextService.hasWorkspace()) {
			return this.windowService.createAndOpenWorkspace([]);
		}

		if (this.contextService.hasFolderWorkspace()) {
			return this.windowService.createAndOpenWorkspace([this.contextService.getWorkspace().roots[0].toString()]);
		}

		const folders = super.pickFolders(mnemonicButtonLabel(localize({ key: 'add', comment: ['&& denotes a mnemonic'] }, "&&Add")), localize('addFolderToWorkspaceTitle', "Add Folder to Workspace"));
		if (!folders || !folders.length) {
			return TPromise.as(null);
		}

		return this.workspaceEditingService.addRoots(folders.map(folder => URI.file(folder)))
			.then(() => this.configurationService.reloadConfiguration());;
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class ClearWorkspaceViewletInputAction extends Action {

	static ID = 'workbench.workspace.action.clearWorkspaceViewletInput';
	static LABEL = localize('clearWorkspaceViewletInput', "Clear Workspace Viewlet Input");

	private disposables: IDisposable[] = [];

	constructor(
		id: string,
		label: string,
		onSearchChange: Event<string>,
		@IViewletService private viewletService: IViewletService,
	) {
		super(id, label, 'clear-workspace-viewlet', true);
		this.enabled = false;
		onSearchChange(this.onSearchChange, this, this.disposables);
	}

	private onSearchChange(value: string): void {
		this.enabled = !!value;
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(VIEWLET_ID, true)
			.then(viewlet => viewlet as IWorkspaceViewlet)
			.then(viewlet => {
				viewlet.search('');
				viewlet.focus();
			});
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

import { extensionButtonProminentBackground, extensionButtonProminentForeground, extensionButtonProminentHoverBackground } from 'vs/workbench/parts/extensions/browser/extensionsActions';

export const folderButtonProminentBackground = registerColor('folderButton.prominentBackground', {
	dark: extensionButtonProminentBackground,
	light: extensionButtonProminentBackground,
	hc: extensionButtonProminentBackground,
}, localize('folderButtonProminentBackground', "Button background color for folder actions that stand out (e.g. add button)."));

export const folderButtonProminentForeground = registerColor('folderButton.prominentForeground', {
	dark: extensionButtonProminentForeground,
	light: extensionButtonProminentForeground,
	hc: extensionButtonProminentForeground,
}, localize('folderButtonProminentForeground', "Button foreground color for folder actions that stand out (e.g. add button)."));

export const folderButtonProminentHoverBackground = registerColor('folderButton.prominentHoverBackground', {
	dark: extensionButtonProminentHoverBackground,
	light: extensionButtonProminentHoverBackground,
	hc: extensionButtonProminentHoverBackground,
}, localize('folderButtonProminentHoverBackground', "Button background hover color for folder actions that stand out (e.g. add button)."));

registerThemingParticipant((theme: ITheme, collector: ICssStyleCollector) => {
	const buttonBackgroundColor = theme.getColor(buttonBackground);
	if (buttonBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-action { background-color: ${buttonBackgroundColor}; }`);
	}

	const buttonForegroundColor = theme.getColor(buttonForeground);
	if (buttonForegroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-action { color: ${buttonForegroundColor}; }`);
	}

	const buttonHoverBackgroundColor = theme.getColor(buttonHoverBackground);
	if (buttonHoverBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item:hover .action-label.folder-action { background-color: ${buttonHoverBackgroundColor}; }`);
	}

	const contrastBorderColor = theme.getColor(contrastBorder);
	if (contrastBorderColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-action { border: 1px solid ${contrastBorderColor}; }`);
	}

	const tagBackgroundColor = theme.getColor(tagBackground);
	if (tagBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label { background: ${tagBackgroundColor}; }`);
	}

	const tagForegroundColor = theme.getColor(tagForeground);
	if (tagForegroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label { color: ${tagForegroundColor}; }`);
	}

	const tagBorderColor = theme.getColor(tagBorder);
	if (tagBorderColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label:not(:empty) { border: 1px solid ${tagBorderColor}; border-radius: 2px; }`);
	}

	const tagHoverBackgroundColor = theme.getColor(tagHoverBackground);
	if (tagHoverBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label:hover { background: ${tagHoverBackgroundColor}; }`);
	}

	const tagHoverForegroundColor = theme.getColor(tagHoverForeground);
	if (tagHoverForegroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label:hover { color: ${tagHoverForegroundColor}; }`);
	}

	const tagHoverBorderColor = theme.getColor(tagHoverBorder);
	if (tagHoverBorderColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label:hover:not(:empty) { border: 1px solid ${tagHoverBorderColor}; border-radius: 2px; }`);
	}

	const folderButtonProminentBackgroundColor = theme.getColor(folderButtonProminentBackground);
	if (folderButtonProminentBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-action.prominent { background-color: ${folderButtonProminentBackgroundColor}; }`);
	}

	const folderButtonProminentForegroundColor = theme.getColor(folderButtonProminentForeground);
	if (folderButtonProminentForegroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-action.prominent { color: ${folderButtonProminentForegroundColor}; }`);
	}

	const folderButtonProminentHoverBackgroundColor = theme.getColor(folderButtonProminentHoverBackground);
	if (folderButtonProminentHoverBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item:hover .action-label.folder-action.prominent { background-color: ${folderButtonProminentHoverBackgroundColor}; }`);
	}
});