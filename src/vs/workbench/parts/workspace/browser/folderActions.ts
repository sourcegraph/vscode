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
import { VIEWLET_ID, IWorkspaceViewlet, IFolder, WorkspaceFolderState, IFolderCatalogService, FolderOperation } from 'vs/workbench/parts/workspace/common/workspace';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ToggleViewletAction } from 'vs/workbench/browser/viewlet';
import { ExplorerViewlet } from 'vs/workbench/parts/files/browser/explorerViewlet';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { BaseWorkspacesAction, NewWorkspaceFromExistingAction } from 'vs/workbench/browser/actions/workspaceActions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerThemingParticipant, ITheme, ICssStyleCollector } from 'vs/platform/theme/common/themeService';
import { buttonBackground, buttonForeground, buttonHoverBackground, contrastBorder, registerColor, lighten, darken } from 'vs/platform/theme/common/colorRegistry';
import { FolderSCMSwitchRevisionAction } from './scmFolderActions';
import { IEnvironmentService } from "vs/platform/environment/common/environment";
import { IWindowService } from 'vs/platform/windows/common/windows';
import { mnemonicButtonLabel } from "vs/base/common/labels";
import { Color } from 'vs/base/common/color';

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
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IFolderCatalogService private catalogService: IFolderCatalogService,
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
		const promise = this.workspaceEditingService.addRoots([this.folder.uri])
			.then(() => this.configurationService.reloadConfiguration());
		this.catalogService.monitorFolderOperation(this.folder, FolderOperation.Adding, promise);
		return promise;
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
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IFolderCatalogService private catalogService: IFolderCatalogService,
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
		const promise = this.workspaceEditingService.removeRoots([this.folder.uri])
			.then(() => this.configurationService.reloadConfiguration());
		this.catalogService.monitorFolderOperation(this.folder, FolderOperation.Removing, promise);
		return promise;
	}

	dispose(): void {
		super.dispose();
		this.disposables = dispose(this.disposables);
	}
}

export class ExploreWorkspaceFolderAction extends Action {

	private static LABEL = localize('exploreFolderAction', "Show in File Explorer");

	private _folder: IFolder;
	get folder(): IFolder { return this._folder; }
	set folder(folder: IFolder) { this._folder = folder; this.update(); }

	constructor(
		@IViewletService private viewletService: IViewletService,
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
				explorerView.select(this.folder.uri, true);
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
		@IConfigurationService private configurationService: IConfigurationService,
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
			.then(() => this.configurationService.reloadConfiguration())
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

		this.disposables.push(this.workspaceContextService.onDidChangeWorkspaceRoots(() => this.update()));
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
			return this.windowService.newWorkspace();
		}

		if (this.contextService.hasFolderWorkspace()) {
			return this.instantiationService.createInstance(NewWorkspaceFromExistingAction, NewWorkspaceFromExistingAction.ID, NewWorkspaceFromExistingAction.LABEL).run();
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

export const folderLabelBackground = registerColor('folderLabel.background', {
	dark: null,
	light: null,
	hc: null,
}, localize('folderLabelBackground', "Background color for folder labels (e.g. SCM status)."));

export const folderLabelForeground = registerColor('folderLabel.foreground', {
	dark: '#aaaaaa',
	light: '#555555',
	hc: null,
}, localize('folderLabelForeground', "Foreground color for folder labels (e.g. SCM status)."));

export const folderLabelBorder = registerColor('folderLabel.border', {
	dark: '#888888',
	light: '#777777',
	hc: null,
}, localize('folderLabelBorder', "Border color for folder labels (e.g. SCM status)."));

export const folderLabelHoverBackground = registerColor('folderLabel.hoverBackground', {
	dark: Color.white.transparent(0.05),
	light: Color.black.transparent(0.05),
	hc: Color.white.transparent(0.05),
}, localize('folderLabelHoverBackground', "Background hover color for folder labels (e.g. SCM status)."));

export const folderLabelHoverForeground = registerColor('folderLabel.hoverForeground', {
	dark: lighten(folderLabelForeground, 0.2),
	light: darken(folderLabelForeground, 0.2),
	hc: null,
}, localize('folderLabelHoverForeground', "Foreground hover color for folder labels (e.g. SCM status)."));

export const folderLabelHoverBorder = registerColor('folderLabel.hoverBorder', {
	dark: lighten(folderLabelBorder, 0.3),
	light: darken(folderLabelBorder, 0.3),
	hc: null,
}, localize('folderLabelHoverBorder', "Border hover color for folder labels (e.g. SCM status)."));

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

	const folderLabelBackgroundColor = theme.getColor(folderLabelBackground);
	if (folderLabelBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label { background: ${folderLabelBackgroundColor}; }`);
	}

	const folderLabelForegroundColor = theme.getColor(folderLabelForeground);
	if (folderLabelForegroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label { color: ${folderLabelForegroundColor}; }`);
	}

	const folderLabelBorderColor = theme.getColor(folderLabelBorder);
	if (folderLabelBorderColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label:not(:empty) { border: 1px solid ${folderLabelBorderColor}; border-radius: 2px; }`);
	}

	const folderLabelHoverBackgroundColor = theme.getColor(folderLabelHoverBackground);
	if (folderLabelHoverBackgroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label:hover { background: ${folderLabelHoverBackgroundColor}; }`);
	}

	const folderLabelHoverForegroundColor = theme.getColor(folderLabelHoverForeground);
	if (folderLabelHoverForegroundColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label:hover { color: ${folderLabelHoverForegroundColor}; }`);
	}

	const folderLabelHoverBorderColor = theme.getColor(folderLabelHoverBorder);
	if (folderLabelHoverBorderColor) {
		collector.addRule(`.monaco-action-bar .action-item .action-label.folder-label:hover:not(:empty) { border: 1px solid ${folderLabelHoverBorderColor}; border-radius: 2px; }`);
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