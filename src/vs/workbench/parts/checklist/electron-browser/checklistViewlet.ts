/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/checklistViewlet';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, $, addClass, toggleClass } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { VIEWLET_ID } from 'vs/workbench/parts/checklist/common/checklist';
import { IChecklistService } from 'vs/workbench/services/checklist/common/checklist';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService } from 'vs/platform/message/common/message';
import { IListService } from 'vs/platform/list/browser/listService';
import { IAction, Action } from 'vs/base/common/actions';
import { ChecklistMenus } from './checklistMenus';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IExtensionsViewlet, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { ChecklistResultsWidget } from './checklistResults';

class InstallAdditionalChecklistProvidersAction extends Action {

	constructor( @IViewletService private viewletService: IViewletService) {
		super('check.installAdditionalChecklistProviders', localize('installAdditionalChecklistProviders', "Install Additional Checklist Providers..."), '', true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true).then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('category:"Checklist Providers" @sort:installs');
				viewlet.focus();
			});
	}
}

export class ChecklistViewlet extends Viewlet {

	private el: HTMLElement;
	private results: ChecklistResultsWidget;
	private menus: ChecklistMenus;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IChecklistService protected checkService: IChecklistService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IContextViewService protected contextViewService: IContextViewService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IMessageService protected messageService: IMessageService,
		@IListService protected listService: IListService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IThemeService protected themeService: IThemeService,
		@ICommandService protected commandService: ICommandService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(VIEWLET_ID, telemetryService, themeService);

		this.menus = instantiationService.createInstance(ChecklistMenus, undefined);
		this._register(this.menus.onDidChangeTitle(() => this.updateTitleArea()));
	}

	async create(parent: Builder): TPromise<void> {
		await super.create(parent);

		this.el = parent.getHTMLElement();
		addClass(this.el, 'checklist-viewlet');
		addClass(this.el, 'empty');
		append(parent.getHTMLElement(), $('div.empty-message', null, localize('no checklist items', "The checklist is empty.")));

		this.createResultsView(parent);

		this.handleChecklistChange();
	}

	private createResultsView(builder: Builder): void {
		builder.div({ 'class': 'results' }, (div) => {
			this.results = this.instantiationService.createInstance(ChecklistResultsWidget, div.getHTMLElement());
		});
	}

	layout(dimension: Dimension): void {
		this.results.layoutBody(dimension.height);
	}

	private handleChecklistChange(): void {
		toggleClass(this.el, 'empty', this.checkService.providers.length === 0);
	}

	getOptimalWidth(): number {
		return 400;
	}

	getTitle(): string {
		const title = localize('checklist', "Checklist");
		// TODO(sqs): include scoped repo (if any), etc., in title
		return title;
	}

	getActions(): IAction[] {
		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		const result = this.menus.getTitleSecondaryActions();

		if (result.length > 0) {
			result.push(new Separator());
		}

		result.push(this.instantiationService.createInstance(InstallAdditionalChecklistProvidersAction));

		return result;
	}
}
