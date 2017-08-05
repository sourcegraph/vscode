/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/workspaceViewlet';
import { isMacintosh } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { ThrottledDelayer, always } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { isPromiseCanceledError, create as createError } from 'vs/base/common/errors';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import EventOf, { mapEvent, chain } from 'vs/base/common/event';
import { IAction } from 'vs/base/common/actions';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { append, $, addStandardDisposableListener, EventType, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IWorkspaceViewlet, VIEWLET_ID, IFolderCatalogService } from '../common/workspace';
import {
	ClearWorkspaceViewletInputAction, AddLocalWorkspaceFolderAction
} from 'vs/workbench/parts/workspace/browser/folderActions';
import { FoldersListView, CurrentWorkspaceFoldersView, OtherFoldersView, SearchFoldersView } from './foldersViews';
import { EmptyView } from './emptyView';
import { OpenGlobalSettingsAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { inputForeground, inputBackground, inputBorder } from 'vs/platform/theme/common/colorRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ViewsRegistry, ViewLocation, IViewDescriptor } from 'vs/workbench/parts/views/browser/viewsRegistry';
import { ComposedViewsViewlet, IView } from 'vs/workbench/parts/views/browser/views';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, ContextKeyExpr, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { OpenWorkspaceAction, SaveWorkspaceAsAction, OpenWorkspaceConfigFileAction } from 'vs/workbench/browser/actions/workspaceActions';

interface SearchInputEvent extends Event {
	target: HTMLInputElement;
	immediate?: boolean;
}

const WorkspaceViewletVisibleContext = new RawContextKey<boolean>('workspaceViewletVisible', false);
const SearchFoldersContext = new RawContextKey<boolean>('searchFolders', false);

export class WorkspaceViewlet extends ComposedViewsViewlet implements IWorkspaceViewlet {

	private onSearchChange: EventOf<string>;
	private workspaceViewletVisibleContextKey: IContextKey<boolean>;
	private searchFoldersContextKey: IContextKey<boolean>;

	private searchDelayer: ThrottledDelayer<any>;
	private root: HTMLElement;

	private searchBox: HTMLInputElement;
	private foldersBox: HTMLElement;
	private primaryActions: IAction[];
	private secondaryActions: IAction[];
	private disposables: IDisposable[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorInputService: IEditorGroupService,
		@IMessageService private messageService: IMessageService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IFolderCatalogService catalogService: IFolderCatalogService,
	) {
		super(VIEWLET_ID, ViewLocation.Workspace, `${VIEWLET_ID}.state`, true, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);

		this.registerViews();
		this.searchDelayer = new ThrottledDelayer(500);
		this.workspaceViewletVisibleContextKey = WorkspaceViewletVisibleContext.bindTo(contextKeyService);
		this.searchFoldersContextKey = SearchFoldersContext.bindTo(contextKeyService);

		this.disposables.push(catalogService.onChange(() => this.updateViews(true), null, this.disposables));
	}

	private get showEmptyView(): boolean {
		return !this.contextService.hasMultiFolderWorkspace();
	}

	private registerViews(): void {
		let viewDescriptors = [];

		if (this.showEmptyView) {
			viewDescriptors.push(this.createEmptyViewDescriptor());
		} else {
			viewDescriptors.push(this.createCurrentWorkspaceFoldersListViewDescriptor());
			viewDescriptors.push(this.createOtherFoldersListViewDescriptor());
			viewDescriptors.push(this.createSearchFoldersListViewDescriptor());
		}

		ViewsRegistry.registerViews(viewDescriptors);
	}

	private createCurrentWorkspaceFoldersListViewDescriptor(): IViewDescriptor {
		return {
			id: 'workspace.currentWorkspaceFolders',
			name: localize('currentWorkspaceFolders', "Current Workspace"),
			location: ViewLocation.Workspace,
			ctor: CurrentWorkspaceFoldersView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('workspaceViewletVisible'), ContextKeyExpr.not('searchFolders')),
			order: 0,
			size: 50,
		};
	}

	private createOtherFoldersListViewDescriptor(): IViewDescriptor {
		return {
			id: 'workspace.otherFolders',
			name: localize('otherFolders', "Other Repositories and Folders"),
			location: ViewLocation.Workspace,
			ctor: OtherFoldersView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('workspaceViewletVisible'), ContextKeyExpr.not('searchFolders')),
			order: 2,
			size: 35,
			canToggleVisibility: true
		};
	}

	private createSearchFoldersListViewDescriptor(): IViewDescriptor {
		return {
			id: 'workspace.searchFolders',
			name: localize('searchFoldersView', "Search"),
			location: ViewLocation.Workspace,
			ctor: SearchFoldersView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('workspaceViewletVisible'), ContextKeyExpr.has('searchFolders')),
			size: 100,
		};
	}

	private createEmptyViewDescriptor(): IViewDescriptor {
		return {
			id: 'workspace.empty',
			name: localize('workspaceEmpty', "Empty"),
			location: ViewLocation.Workspace,
			ctor: EmptyView,
			size: 100,
		};
	}

	create(parent: Builder): TPromise<void> {
		parent.addClass('workspace-viewlet');
		this.root = parent.getHTMLElement();

		let viewBox: HTMLElement;
		if (this.showEmptyView) {
			viewBox = this.root;
		} else {
			viewBox = this.createViewBox();
		}

		return super.create(new Builder(viewBox));
	}

	private createViewBox(): HTMLElement {
		const header = append(this.root, $('.header'));

		this.searchBox = append(header, $<HTMLInputElement>('input.search-box'));
		this.searchBox.placeholder = localize('searchFolders', "Search for repositories and folders");
		this.disposables.push(addStandardDisposableListener(this.searchBox, EventType.FOCUS, () => addClass(this.searchBox, 'synthetic-focus')));
		this.disposables.push(addStandardDisposableListener(this.searchBox, EventType.BLUR, () => removeClass(this.searchBox, 'synthetic-focus')));

		this.foldersBox = append(this.root, $('.folders'));

		const onKeyDown = chain(domEvent(this.searchBox, 'keydown'))
			.map(e => new StandardKeyboardEvent(e));
		onKeyDown.filter(e => e.keyCode === KeyCode.Escape).on(this.onEscape, this, this.disposables);

		const onKeyDownForList = onKeyDown.filter(() => this.count() > 0);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.Enter).on(this.onEnter, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.Enter && (e.ctrlKey || (isMacintosh && e.metaKey))).on(this.onModifierEnter, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.Delete).on(this.onDelete, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.UpArrow).on(this.onUpArrow, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.DownArrow).on(this.onDownArrow, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.PageUp).on(this.onPageUpArrow, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.PageDown).on(this.onPageDownArrow, this, this.disposables);

		const onSearchInput = domEvent(this.searchBox, 'input') as EventOf<SearchInputEvent>;
		onSearchInput(e => this.triggerSearch(e.immediate), null, this.disposables);

		this.onSearchChange = mapEvent(onSearchInput, e => e.target.value);

		return this.foldersBox;
	}

	public updateStyles(): void {
		super.updateStyles();

		if (this.searchBox) {
			this.searchBox.style.backgroundColor = this.getColor(inputBackground);
			this.searchBox.style.color = this.getColor(inputForeground);

			const inputBorderColor = this.getColor(inputBorder);
			this.searchBox.style.borderWidth = inputBorderColor ? '1px' : null;
			this.searchBox.style.borderStyle = inputBorderColor ? 'solid' : null;
			this.searchBox.style.borderColor = inputBorderColor;
		}
	}

	setVisible(visible: boolean): TPromise<void> {
		const isVisibilityChanged = this.isVisible() !== visible;
		return super.setVisible(visible).then(() => {
			if (isVisibilityChanged) {
				this.workspaceViewletVisibleContextKey.set(visible);
				if (visible && this.searchBox) {
					this.searchBox.focus();
					this.searchBox.setSelectionRange(0, this.searchBox.value.length);
				}
			}
		});
	}

	focus(): void {
		if (this.searchBox) {
			this.searchBox.focus();
		}
	}

	layout(dimension: Dimension): void {
		toggleClass(this.root, 'narrow', dimension.width <= 300);
		super.layout(new Dimension(dimension.width, dimension.height - 38));
	}

	getOptimalWidth(): number {
		return 400;
	}

	getActions(): IAction[] {
		if (this.showEmptyView) {
			return [];
		}

		if (!this.primaryActions) {
			this.primaryActions = [
				this.instantiationService.createInstance(AddLocalWorkspaceFolderAction, AddLocalWorkspaceFolderAction.ID, AddLocalWorkspaceFolderAction.LABEL, this.onSearchChange),
				this.instantiationService.createInstance(ClearWorkspaceViewletInputAction, ClearWorkspaceViewletInputAction.ID, ClearWorkspaceViewletInputAction.LABEL, this.onSearchChange),
			];
		}
		return this.primaryActions;
	}

	getSecondaryActions(): IAction[] {
		if (!this.secondaryActions) {
			this.secondaryActions = [
				this.instantiationService.createInstance(OpenWorkspaceAction, OpenWorkspaceAction.ID, OpenWorkspaceAction.LABEL),
				this.instantiationService.createInstance(SaveWorkspaceAsAction, SaveWorkspaceAsAction.ID, SaveWorkspaceAsAction.LABEL),
				this.instantiationService.createInstance(OpenWorkspaceConfigFileAction, OpenWorkspaceConfigFileAction.ID, OpenWorkspaceConfigFileAction.LABEL),
			];
		}

		return this.secondaryActions;
	}

	search(value: string): void {
		if (!this.searchBox) {
			return;
		}

		const event = new Event('input', { bubbles: true }) as SearchInputEvent;
		event.immediate = true;

		this.searchBox.value = value;
		this.searchBox.dispatchEvent(event);
	}

	private triggerSearch(immediate = false): void {
		this.searchDelayer.trigger(() => this.doSearch(), immediate || !this.searchBox.value ? 0 : 500)
			.done(null, err => this.onError(err));
	}

	private async doSearch(): TPromise<any> {
		const value = this.searchBox.value || '';
		this.searchFoldersContextKey.set(!!value);

		await this.updateViews(!!value);
	}

	protected async updateViews(showAll?: boolean): TPromise<IView[]> {
		const created = await super.updateViews();
		const toShow = showAll ? this.views : created;
		if (toShow.length) {
			await this.progress(TPromise.join(toShow.map(view => {
				if (view instanceof FoldersListView) {
					return view.show(this.searchBox.value);
				}
				return TPromise.as(null);
			})));
		}
		return created;
	}

	private count(): number {
		return this.views.reduce((count, view) => (<FoldersListView>view).count() + count, 0);
	}

	private onEscape(): void {
		this.search('');
	}

	private onModifierEnter(e: StandardKeyboardEvent): void {
		(<FoldersListView>this.views[0]).onModifierEnter(e);
	}

	private onEnter(): void {
		(<FoldersListView>this.views[0]).select();
	}

	private onDelete(e: StandardKeyboardEvent): void {
		// Only propagate to list if a list item is selected, to avoid interfering with
		// Delete keypresses intended to edit the search query.
		const listView = this.views[0] as FoldersListView;
		if (listView.hasFocusedElements()) {
			(<FoldersListView>this.views[0]).onDelete(e);
		}
	}

	private onUpArrow(): void {
		(<FoldersListView>this.views[0]).showPrevious();
	}

	private onDownArrow(): void {
		(<FoldersListView>this.views[0]).showNext();
	}

	private onPageUpArrow(): void {
		(<FoldersListView>this.views[0]).showPreviousPage();
	}

	private onPageDownArrow(): void {
		(<FoldersListView>this.views[0]).showNextPage();
	}

	private progress<T>(promise: TPromise<T>): TPromise<T> {
		const progressRunner = this.progressService.show(true);
		return always(promise, () => progressRunner.done());
	}

	private onError(err: any): void {
		if (isPromiseCanceledError(err)) {
			return;
		}

		const message = err && err.message || '';

		if (/ECONNREFUSED/.test(message)) {
			const error = createError(localize('suggestProxyError', "Marketplace returned 'ECONNREFUSED'. Please check the 'http.proxy' setting."), {
				actions: [
					this.instantiationService.createInstance(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL),
					CloseAction
				]
			});

			this.messageService.show(Severity.Error, error);
			return;
		}

		this.messageService.show(Severity.Error, err);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
