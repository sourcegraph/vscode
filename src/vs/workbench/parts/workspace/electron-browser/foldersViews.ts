/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as errors from 'vs/base/common/errors';
import { isMacintosh } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { chain } from 'vs/base/common/event';
import { PagedModel, IPagedModel } from 'vs/base/common/paging';
import { ViewSizing } from 'vs/base/browser/ui/splitview/splitview';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Delegate, Renderer } from 'vs/workbench/parts/workspace/browser/foldersList';
import { IFolder, IFolderCatalogService, WorkspaceFolderState } from 'vs/workbench/parts/workspace/common/workspace';
import { IFolderAction, AddWorkspaceFolderAction, RemoveWorkspaceFoldersAction, ExploreWorkspaceFolderAction, AddAndExploreWorkspaceFolderAction } from 'vs/workbench/parts/workspace/browser/folderActions';
import { IListService } from 'vs/platform/list/browser/listService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachListStyler, attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { CollapsibleView, IViewletViewOptions, IViewOptions } from 'vs/workbench/parts/views/browser/views';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';

export abstract class FoldersListView extends CollapsibleView {

	private messageBox: HTMLElement;
	private foldersList: HTMLElement;
	private badge: CountBadge;

	private list: PagedList<IFolder>;
	private disposables: IDisposable[] = [];

	constructor(
		private options: IViewletViewOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IListService private listService: IListService,
		@IThemeService private themeService: IThemeService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@ICommandService private commandService: ICommandService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorInputService: IEditorGroupService,
		@IModeService private modeService: IModeService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IProgressService private progressService: IProgressService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IFolderCatalogService protected catalogService: IFolderCatalogService,
		@IViewletService private viewletService: IViewletService,
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: options.name, sizing: ViewSizing.Flexible, collapsed: !!options.collapsed, initialBodySize: 1 * 62 }, keybindingService, contextMenuService);
	}

	renderHeader(container: HTMLElement): void {
		const titleDiv = append(container, $('div.title'));
		append(titleDiv, $('span')).textContent = this.options.name;
		this.badge = new CountBadge(append(container, $('.count-badge-wrapper')));
		this.disposables.push(attachBadgeStyler(this.badge, this.themeService));
	}

	renderBody(container: HTMLElement): void {
		this.foldersList = append(container, $('.folders-list'));
		this.messageBox = append(container, $('.message'));
		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(Renderer);
		this.list = new PagedList(this.foldersList, delegate, [renderer], {
			ariaLabel: localize('folders', "Folders"),
			keyboardSupport: false,
		});

		const onKeyDown = chain(domEvent(this.foldersList, 'keydown'))
			.map(e => new StandardKeyboardEvent(e));

		const onKeyDownForList = onKeyDown.filter(() => this.count() > 0);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.Enter && (e.ctrlKey || (isMacintosh && e.metaKey)))
			.on(this.onModifierEnter, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.Delete || e.keyCode === KeyCode.Backspace)
			.on(this.onDelete, this, this.disposables);

		this.disposables.push(attachListStyler(this.list.widget, this.themeService));
		this.disposables.push(this.listService.register(this.list.widget));

		chain(this.list.onPin)
			.map(e => e.elements[0])
			.filter(e => !!e)
			.on(this.pin, this, this.disposables);
	}

	setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			if (!visible) {
				this.setModel(new PagedModel([]));
			}
		});
	}

	layoutBody(size: number): void {
		this.foldersList.style.height = size + 'px';
		this.list.layout(size);
	}

	async show(query: string): TPromise<IPagedModel<IFolder>> {
		const model = await this.query(query);
		this.setModel(model);
		return model;
	}

	select(): void {
		this.list.setSelection(this.list.getFocus());
	}

	showPrevious(): void {
		this.list.focusPrevious();
		this.list.reveal(this.list.getFocus()[0]);
	}

	showPreviousPage(): void {
		this.list.focusPreviousPage();
		this.list.reveal(this.list.getFocus()[0]);
	}

	showNext(): void {
		this.list.focusNext();
		this.list.reveal(this.list.getFocus()[0]);
	}

	showNextPage(): void {
		this.list.focusNextPage();
		this.list.reveal(this.list.getFocus()[0]);
	}

	count(): number {
		return this.list.length;
	}

	protected abstract async query(value: string): TPromise<IPagedModel<IFolder>>;

	private setModel(model: IPagedModel<IFolder>) {
		this.list.model = model;
		this.list.scrollTop = 0;
		const count = this.count();

		toggleClass(this.foldersList, 'hidden', count === 0);
		toggleClass(this.messageBox, 'hidden', count > 0);
		this.badge.setCount(count);

		if (count === 0 && this.isVisible()) {
			this.messageBox.textContent = localize('workspaceFolders.noResults', "No repositories or folders found.");
		} else {
			this.messageBox.textContent = '';
		}
	}

	public hasFocusedElements(): boolean {
		return !!this.list.getFocus().length;
	}

	public onDelete(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const folders = this.list.widget.getSelection().map(i => this.list.model.get(i));
		if (folders.length) {
			this.list.focusNext();
		}

		const foldersToRemove = folders.filter(f => f.state === WorkspaceFolderState.Active);
		const removeAction = this.instantiationService.createInstance(RemoveWorkspaceFoldersAction, foldersToRemove);
		removeAction.run().done(null, errors.onUnexpectedError);
	}

	public onModifierEnter(e: StandardKeyboardEvent): void {
		e.preventDefault();
		e.stopPropagation();

		const folders = this.list.getFocus().map(index => this.list.model.get(index));
		let selectNext = false;
		const promises = folders.map(folder => {
			const actionClass = folder.state === WorkspaceFolderState.Active ? ExploreWorkspaceFolderAction : AddAndExploreWorkspaceFolderAction;
			const action = this.instantiationService.createInstance<IFolderAction>(actionClass);
			action.folder = folder;
			return action.run();
		});

		TPromise.join(promises)
			.then(() => {
				if (selectNext) {
					this.list.selectNext();
				}
			})
			.done(null, errors.onUnexpectedError);
	}

	private pin(folder: IFolder): void {
		const actionClass = folder.state === WorkspaceFolderState.Active ? ExploreWorkspaceFolderAction : AddWorkspaceFolderAction;
		const action = this.instantiationService.createInstance<IFolderAction>(actionClass);
		action.folder = folder;
		action.run().done(null, errors.onUnexpectedError);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class CurrentWorkspaceFoldersView extends FoldersListView {
	protected query(value: string): TPromise<IPagedModel<IFolder>> {
		return this.catalogService.getCurrentWorkspaceFolders().then(folders => new PagedModel(folders));
	}
}

export class OtherFoldersView extends FoldersListView {
	protected query(value: string): TPromise<IPagedModel<IFolder>> {
		return TPromise.join([
			this.catalogService.getContainingFolders(),
			this.catalogService.getOtherFolders(),
		]).then(([containingFolders, otherFolders]) => {
			return new PagedModel(containingFolders.concat(otherFolders));
		});
	}
}

export class SearchFoldersView extends FoldersListView {
	protected query(value: string): TPromise<IPagedModel<IFolder>> {
		return this.catalogService.search(value);
	}
}
