/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/reviewViewlet';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter, chain, mapEvent } from 'vs/base/common/event';
import { domEvent, stop } from 'vs/base/browser/event';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, dispose, combinedDisposable, empty as EmptyDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { PanelViewlet, ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { append, $, addClass, toggleClass, trackFocus } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListContextMenuEvent, IListEvent } from 'vs/base/browser/ui/list/list';
import { VIEWLET_ID } from 'vs/workbench/parts/review/common/review';
import { FileLabel } from 'vs/workbench/browser/labels';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IReviewService, IReviewItem, IReviewResourceGroup, IReviewResource } from 'vs/workbench/services/review/common/review';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextViewService, IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService } from 'vs/platform/message/common/message';
import { IListService } from 'vs/platform/list/browser/listService';
import { MenuItemAction, IMenuService, MenuId } from 'vs/platform/actions/common/actions';
import { IAction, Action, IActionItem, ActionRunner } from 'vs/base/common/actions';
import { MenuItemActionItem, fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { ReviewMenus } from './reviewMenus';
import { ActionBar, IActionItemProvider, Separator, ActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { isReviewResource } from './reviewUtil';
import { attachListStyler, attachBadgeStyler } from 'vs/platform/theme/common/styler';
import Severity from 'vs/base/common/severity';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IExtensionsViewlet, VIEWLET_ID as EXTENSIONS_VIEWLET_ID } from 'vs/workbench/parts/extensions/common/extensions';
import { Command } from 'vs/editor/common/modes';
import { render as renderOcticons } from 'vs/base/browser/ui/octiconLabel/octiconLabel';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';

// TODO@Joao
// Need to subclass MenuItemActionItem in order to respect
// the action context coming from any action bar, without breaking
// existing users
class ReviewMenuItemActionItem extends MenuItemActionItem {

	onClick(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();

		this.actionRunner.run(this._commandAction, this._context)
			.done(undefined, err => this._messageService.show(Severity.Error, err));
	}
}

export interface ISpliceEvent<T> {
	index: number;
	deleteCount: number;
	elements: T[];
}

export interface IViewModel {
	readonly reviewItems: IReviewItem[];
	readonly selectedReviewItem: IReviewItem[];
	readonly onDidSplice: Event<ISpliceEvent<IReviewItem>>;
	hide(repository: IReviewItem): void;
}

class ProvidersListDelegate implements IDelegate<IReviewItem> {

	getHeight(element: IReviewItem): number {
		return 22;
	}

	getTemplateId(element: IReviewItem): string {
		return 'provider';
	}
}

class StatusBarAction extends Action {

	constructor(
		private command: Command,
		private commandService: ICommandService
	) {
		super(`statusbaraction{${command.id}}`, command.title, '', true);
		this.tooltip = command.tooltip;
	}

	run(): TPromise<void> {
		return this.commandService.executeCommand(this.command.id, ...this.command.arguments);
	}
}

class StatusBarActionItem extends ActionItem {

	constructor(action: StatusBarAction) {
		super(null, action, {});
	}

	_updateLabel(): void {
		if (this.options.label) {
			this.$e.innerHtml(renderOcticons(this.getAction().label));
		}
	}
}

interface RepositoryTemplateData {
	title: HTMLElement;
	type: HTMLElement;
	countContainer: HTMLElement;
	count: CountBadge;
	actionBar: ActionBar;
	disposable: IDisposable;
	templateDisposable: IDisposable;
}

class ProviderRenderer implements IRenderer<IReviewItem, RepositoryTemplateData> {

	readonly templateId = 'provider';

	constructor(
		@ICommandService protected commandService: ICommandService,
		@IThemeService protected themeService: IThemeService
	) { }

	renderTemplate(container: HTMLElement): RepositoryTemplateData {
		const provider = append(container, $('.review-provider'));
		const name = append(provider, $('.name'));
		const title = append(name, $('span.title'));
		const type = append(name, $('span.type'));
		const countContainer = append(provider, $('.count'));

		append(provider, $('.spacer'));

		const count = new CountBadge(countContainer);
		const badgeStyler = attachBadgeStyler(count, this.themeService);
		const actionBar = new ActionBar(provider, { actionItemProvider: a => new StatusBarActionItem(a as StatusBarAction) });
		const disposable = EmptyDisposable;
		const templateDisposable = combinedDisposable([actionBar, badgeStyler]);

		return { title, type, countContainer, count, actionBar, disposable, templateDisposable };
	}

	renderElement(reviewItem: IReviewItem, index: number, templateData: RepositoryTemplateData): void {
		templateData.disposable.dispose();
		const disposables: IDisposable[] = [];

		templateData.title.textContent = reviewItem.provider.label;
		templateData.type.textContent = '';

		// const disposables = commands.map(c => this.statusbarService.addEntry({
		// 	text: c.title,
		// 	tooltip: `${repository.provider.label} - ${c.tooltip}`,
		// 	command: c.id,
		// 	arguments: c.arguments
		// }, MainThreadStatusBarAlignment.LEFT, 10000));

		const actions = [];
		const disposeActions = () => dispose(actions);
		disposables.push({ dispose: disposeActions });

		const update = () => {
			disposeActions();

			const commands = reviewItem.provider.reviewCommands || [];
			actions.splice(0, actions.length, ...commands.map(c => new StatusBarAction(c, this.commandService)));
			templateData.actionBar.clear();
			templateData.actionBar.push(actions);

			const count = /*reviewItem.provider.count || */0;
			toggleClass(templateData.countContainer, 'hidden', count === 0);
			templateData.count.setCount(count);
		};

		reviewItem.provider.onDidChange(update, null, disposables);
		update();

		templateData.disposable = combinedDisposable(disposables);
	}

	disposeTemplate(templateData: RepositoryTemplateData): void {
		templateData.disposable.dispose();
		templateData.templateDisposable.dispose();
	}
}

/**
 * The thing that switches repositories in SCM and branches in review viewlet
 */
class MainPanel extends ViewletPanel {

	private list: List<IReviewItem>;

	private _onSelectionChange = new Emitter<IReviewItem[]>();
	readonly onSelectionChange: Event<IReviewItem[]> = this._onSelectionChange.event;

	constructor(
		protected viewModel: IViewModel,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IReviewService protected reviewService: IReviewService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService
	) {
		super(localize('review providers', "Review Providers"), {}, keybindingService, contextMenuService);
		this.updateBodySize();
	}

	focus(): void {
		super.focus();
		this.list.domFocus();
	}

	hide(repository: IReviewItem): void {
		const selectedElements = this.list.getSelectedElements();
		const index = selectedElements.indexOf(repository);

		if (index === -1) {
			return;
		}

		const selection = this.list.getSelection();
		this.list.setSelection([...selection.slice(0, index), ...selection.slice(index + 1)]);
	}

	private splice(index: number, deleteCount: number, repositories: IReviewItem[] = []): void {
		const wasEmpty = this.list.length === 0;

		this.list.splice(index, deleteCount, repositories);
		this.updateBodySize();

		// Automatically select the first one
		if (wasEmpty && this.list.length > 0) {
			this.list.setSelection([0]);
		}
	}

	protected renderBody(container: HTMLElement): void {
		const delegate = new ProvidersListDelegate();
		const renderer = this.instantiationService.createInstance(ProviderRenderer);

		this.list = new List<IReviewItem>(container, delegate, [renderer], {
			identityProvider: repository => repository.provider.id
		});

		this.disposables.push(this.list);
		this.disposables.push(attachListStyler(this.list, this.themeService));
		this.list.onSelectionChange(this.onListSelectionChange, this, this.disposables);
		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);

		this.viewModel.onDidSplice(({ index, deleteCount, elements }) => this.splice(index, deleteCount, elements), null, this.disposables);
		this.splice(0, 0, this.viewModel.reviewItems);
	}

	protected layoutBody(size: number): void {
		this.list.layout(size);
	}

	private updateBodySize(): void {
		const count = this.viewModel.reviewItems.length;

		if (count <= 5) {
			const size = count * 22;
			this.minimumBodySize = size;
			this.maximumBodySize = size;
		} else {
			this.minimumBodySize = 5 * 22;
			this.maximumBodySize = Number.POSITIVE_INFINITY;
		}
	}

	private onListContextMenu(e: IListContextMenuEvent<IReviewItem>): void {
		const repository = e.element;

		const contextKeyService = this.contextKeyService.createScoped();
		const reviewItemsProviderKey = contextKeyService.createKey<string | undefined>('reviewProvider', void 0);
		reviewItemsProviderKey.set(repository.provider.contextValue);

		const menu = this.menuService.createMenu(MenuId.Review, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };

		fillInActions(menu, { shouldForwardArgs: true }, result, g => g === 'inline');

		menu.dispose();
		contextKeyService.dispose();

		if (secondary.length === 0) {
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => TPromise.as(secondary),
			getActionsContext: () => repository.provider
		});
	}

	private onListSelectionChange(e: IListEvent<IReviewItem>): void {
		// select one repository if the selected one is gone
		if (e.elements.length === 0 && this.list.length > 0) {
			this.list.setSelection([0]);
			return;
		}

		this._onSelectionChange.fire(e.elements);
	}
}

interface ResourceGroupTemplate {
	name: HTMLElement;
	count: CountBadge;
	actionBar: ActionBar;
	dispose: () => void;
}

class ResourceGroupRenderer implements IRenderer<IReviewResourceGroup, ResourceGroupTemplate> {

	static TEMPLATE_ID = 'resource group';
	get templateId(): string { return ResourceGroupRenderer.TEMPLATE_ID; }

	constructor(
		private reviewMenus: ReviewMenus,
		private actionItemProvider: IActionItemProvider,
		private themeService: IThemeService
	) { }
	renderTemplate(container: HTMLElement): ResourceGroupTemplate {
		const element = append(container, $('.resource-group'));
		const name = append(element, $('.name'));
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, { actionItemProvider: this.actionItemProvider });
		const countContainer = append(element, $('.count'));
		const count = new CountBadge(countContainer);
		const styler = attachBadgeStyler(count, this.themeService);

		return {
			name, count, actionBar, dispose: () => {
				actionBar.dispose();
				styler.dispose();
			}
		};
	}

	renderElement(group: IReviewResourceGroup, index: number, template: ResourceGroupTemplate): void {
		template.name.textContent = group.label;
		template.count.setCount(group.resourceCollection.resources.length);
		template.actionBar.clear();
		template.actionBar.context = group;
		template.actionBar.push(this.reviewMenus.getResourceGroupActions(group), { icon: true, label: false });
	}

	disposeTemplate(template: ResourceGroupTemplate): void {
		template.dispose();
	}
}

interface ResourceTemplate {
	element: HTMLElement;
	name: HTMLElement;
	fileLabel: FileLabel;
	decorationIcon: HTMLElement;
	actionBar: ActionBar;
	dispose: () => void;
}

class MultipleSelectionActionRunner extends ActionRunner {

	constructor(private getSelectedResources: () => IReviewResource[]) {
		super();
	}

	runAction(action: IAction, context: IReviewResource): TPromise<any> {
		if (action instanceof MenuItemAction) {
			const selection = this.getSelectedResources();
			const filteredSelection = selection.filter(s => s !== context);

			if (selection.length === filteredSelection.length || selection.length === 1) {
				return action.run(context);
			}

			return action.run(context, ...filteredSelection);
		}

		return super.runAction(action, context);
	}
}

class ResourceRenderer implements IRenderer<IReviewResource, ResourceTemplate> {

	static TEMPLATE_ID = 'resource';
	get templateId(): string { return ResourceRenderer.TEMPLATE_ID; }

	constructor(
		private reviewMenus: ReviewMenus,
		private actionItemProvider: IActionItemProvider,
		private getSelectedResources: () => IReviewResource[],
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService
	) { }

	renderTemplate(container: HTMLElement): ResourceTemplate {
		const element = append(container, $('.resource'));
		const name = append(element, $('.name'));
		const fileLabel = this.instantiationService.createInstance(FileLabel, name, void 0);
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionItemProvider: this.actionItemProvider,
			actionRunner: new MultipleSelectionActionRunner(this.getSelectedResources)
		});

		const decorationIcon = append(element, $('.decoration-icon'));

		return {
			element, name, fileLabel, decorationIcon, actionBar, dispose: () => {
				actionBar.dispose();
				fileLabel.dispose();
			}
		};
	}

	renderElement(resource: IReviewResource, index: number, template: ResourceTemplate): void {
		template.fileLabel.setFile(resource.sourceUri);
		template.actionBar.clear();
		template.actionBar.context = resource;
		template.actionBar.push(this.reviewMenus.getResourceActions(resource), { icon: true, label: false });
		toggleClass(template.name, 'strike-through', resource.decorations.strikeThrough);
		toggleClass(template.element, 'faded', resource.decorations.faded);

		const theme = this.themeService.getTheme();
		const icon = theme.type === LIGHT ? resource.decorations.icon : resource.decorations.iconDark;

		if (icon) {
			template.decorationIcon.style.backgroundImage = `url('${icon}')`;
			template.decorationIcon.title = resource.decorations.tooltip;
		} else {
			template.decorationIcon.style.backgroundImage = '';
		}
	}

	disposeTemplate(template: ResourceTemplate): void {
		template.dispose();
	}
}

class ProviderListDelegate implements IDelegate<IReviewResourceGroup | IReviewResource> {

	getHeight() { return 22; }

	getTemplateId(element: IReviewResourceGroup | IReviewResource) {
		return isReviewResource(element) ? ResourceRenderer.TEMPLATE_ID : ResourceGroupRenderer.TEMPLATE_ID;
	}
}

function reviewResourceIdentityProvider(r: IReviewResourceGroup | IReviewResource): string {
	if (isReviewResource(r)) {
		const group = r.resourceGroup;
		const provider = group.provider;
		return `${provider.contextValue}/${group.id}/${r.sourceUri.toString()}`;
	} else {
		const provider = r.provider;
		return `${provider.contextValue}/${r.id}`;
	}
}

/**
 * This renders one review item, e.g. the "changes" and "discussions" wrapper for one branch.
 */
export class ReviewItemPanel extends ViewletPanel {

	private cachedHeight: number | undefined = undefined;
	private listContainer: HTMLElement;
	private list: List<IReviewResourceGroup | IReviewResource>;
	private menus: ReviewMenus;

	constructor(
		readonly reviewItem: IReviewItem,
		private viewModel: IViewModel,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IThemeService protected themeService: IThemeService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IContextViewService protected contextViewService: IContextViewService,
		@IListService protected listService: IListService,
		@ICommandService protected commandService: ICommandService,
		@IMessageService protected messageService: IMessageService,
		@IWorkbenchEditorService protected editorService: IWorkbenchEditorService,
		@IEditorGroupService protected editorGroupService: IEditorGroupService,
		@IInstantiationService protected instantiationService: IInstantiationService
	) {
		super(reviewItem.provider.label, {}, keybindingService, contextMenuService);
		this.menus = instantiationService.createInstance(ReviewMenus, reviewItem.provider);
	}

	render(container: HTMLElement): void {
		super.render(container);
		this.menus.onDidChangeTitle(this.updateActions, this, this.disposables);
	}

	/**
	 * Renders the header
	 */
	protected renderHeaderTitle(container: HTMLElement): void {
		const header = append(container, $('.title.review-provider'));
		const name = append(header, $('.name'));
		const title = append(name, $('span.title'));
		const type = append(name, $('span.type'));

		title.textContent = this.reviewItem.provider.label;
		type.textContent = '';

		const onContextMenu = mapEvent(stop(domEvent(container, 'contextmenu')), e => new StandardMouseEvent(e));
		onContextMenu(this.onContextMenu, this, this.disposables);
	}

	private onContextMenu(event: StandardMouseEvent): void {
		if (this.viewModel.selectedReviewItem.length <= 1) {
			return;
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: event.posx, y: event.posy }),
			getActions: () => TPromise.as([<IAction>{
				id: `review.hideReviewItem`,
				label: localize('hideReviewItem', "Hide"),
				enabled: true,
				run: () => this.viewModel.hide(this.reviewItem)
			}]),
		});
	}

	protected renderBody(container: HTMLElement): void {
		const focusTracker = trackFocus(container);
		this.disposables.push(focusTracker.addFocusListener(() => this.reviewItem.focus()));
		this.disposables.push(focusTracker);

		// List

		this.listContainer = append(container, $('.review-status.show-file-icons'));
		const delegate = new ProviderListDelegate();

		const actionItemProvider = (action: IAction) => this.getActionItem(action);

		const renderers = [
			new ResourceGroupRenderer(this.menus, actionItemProvider, this.themeService),
			this.instantiationService.createInstance(ResourceRenderer, this.menus, actionItemProvider, () => this.getSelectedResources()),
		];

		this.list = new List(this.listContainer, delegate, renderers, {
			identityProvider: reviewResourceIdentityProvider,
			keyboardSupport: false
		});

		this.disposables.push(attachListStyler(this.list, this.themeService));
		this.disposables.push(this.listService.register(this.list));

		chain(this.list.onOpen)
			.map(e => e.elements[0])
			.filter(e => !!e && isReviewResource(e))
			.on(this.open, this, this.disposables);

		chain(this.list.onPin)
			.map(e => e.elements[0])
			.filter(e => !!e && isReviewResource(e))
			.on(this.pin, this, this.disposables);

		this.list.onContextMenu(this.onListContextMenu, this, this.disposables);
		this.disposables.push(this.list);

		this.reviewItem.provider.onDidChangeResources(this.updateList, this, this.disposables);
		this.updateList();
	}

	layoutBody(height: number = this.cachedHeight): void {
		if (height === undefined) {
			return;
		}

		this.list.layout(height);
		this.cachedHeight = height;

		const listHeight = height - 12 /* margin */;
		this.listContainer.style.height = `${listHeight}px`;
		this.list.layout(listHeight);
	}

	getActions(): IAction[] {
		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		return this.menus.getTitleSecondaryActions();
	}

	getActionItem(action: IAction): IActionItem {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ReviewMenuItemActionItem(action, this.keybindingService, this.messageService);
	}

	getActionsContext(): any {
		return this.reviewItem.provider;
	}

	private updateList(): void {
		const elements = this.reviewItem.provider.resources
			.reduce<(IReviewResourceGroup | IReviewResource)[]>((r, g) => {
				if (g.resourceCollection.resources.length === 0 && g.hideWhenEmpty) {
					return r;
				}

				return [...r, g, ...g.resourceCollection.resources];
			}, []);

		this.list.splice(0, this.list.length, elements);
	}

	private open(e: IReviewResource): void {
		e.open().done(undefined, onUnexpectedError);
	}

	private pin(): void {
		const activeEditor = this.editorService.getActiveEditor();
		const activeEditorInput = this.editorService.getActiveEditorInput();

		if (!activeEditor) {
			return;
		}

		this.editorGroupService.pinEditor(activeEditor.position, activeEditorInput);
	}

	private onListContextMenu(e: IListContextMenuEvent<IReviewResourceGroup | IReviewResource>): void {
		const element = e.element;
		let actions: IAction[];

		if (isReviewResource(element)) {
			actions = this.menus.getResourceContextActions(element);
		} else {
			actions = this.menus.getResourceGroupContextActions(element);
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => TPromise.as(actions),
			getActionsContext: () => element,
			actionRunner: new MultipleSelectionActionRunner(() => this.getSelectedResources())
		});
	}

	private getSelectedResources(): IReviewResource[] {
		return this.list.getSelectedElements()
			.filter(r => isReviewResource(r)) as IReviewResource[];
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

class InstallAdditionalReviewItemsProvidersAction extends Action {

	constructor( @IViewletService private viewletService: IViewletService) {
		super('review.installAdditionalReviewItemsProviders', localize('installAdditionalReviewItemsProviders', "Install Additional Review Providers..."), '', true);
	}

	run(): TPromise<void> {
		return this.viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true).then(viewlet => viewlet as IExtensionsViewlet)
			.then(viewlet => {
				viewlet.search('category:"Review Providers" @sort:installs');
				viewlet.focus();
			});
	}
}

export class ReviewViewlet extends PanelViewlet implements IViewModel {

	private el: HTMLElement;
	private menus: ReviewMenus;
	private mainPanel: MainPanel | null = null;
	private mainPanelDisposable: IDisposable = EmptyDisposable;
	private _reviewItems: IReviewItem[] = [];
	private reviewItemPanels: ReviewItemPanel[] = [];
	private disposables: IDisposable[] = [];

	private _onDidSplice = new Emitter<ISpliceEvent<IReviewItem>>();
	readonly onDidSplice: Event<ISpliceEvent<IReviewItem>> = this._onDidSplice.event;

	private _height: number | undefined = undefined;
	get height(): number | undefined { return this._height; }

	get reviewItems(): IReviewItem[] { return this._reviewItems; }
	get selectedReviewItem(): IReviewItem[] { return this.reviewItemPanels.map(p => p.reviewItem); }

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IReviewService protected reviewService: IReviewService,
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
		super(VIEWLET_ID, { showHeaderInTitleWhenSingleView: true }, telemetryService, themeService);

		this.menus = instantiationService.createInstance(ReviewMenus, undefined);
		this.menus.onDidChangeTitle(this.updateTitleArea, this, this.disposables);
	}

	async create(parent: Builder): TPromise<void> {
		await super.create(parent);

		this.el = parent.getHTMLElement();
		addClass(this.el, 'review-viewlet');
		addClass(this.el, 'empty');
		append(parent.getHTMLElement(), $('div.empty-message', null, localize('no open repo', "There are no active review providers.")));

		this.reviewService.onDidAddReviewItem(this.onDidAddReviewItem, this, this.disposables);
		this.reviewService.onDidRemoveReviewItem(this.onDidRemoveReviewItem, this, this.disposables);
		this.reviewService.reviewItems.forEach(r => this.onDidAddReviewItem(r));
		this.onDidChangeReviewItems();
	}

	private onDidAddReviewItem(reviewItem: IReviewItem): void {
		const index = this._reviewItems.length;
		this._reviewItems.push(reviewItem);
		this._onDidSplice.fire({ index, deleteCount: 0, elements: [reviewItem] });
		this.onDidChangeReviewItems();

		if (!this.mainPanel) {
			this.onSelectionChange(this.reviewItems);
		}
	}

	private onDidRemoveReviewItem(reviewItem: IReviewItem): void {
		const index = this._reviewItems.indexOf(reviewItem);

		if (index === -1) {
			return;
		}

		this._reviewItems.splice(index, 1);
		this._onDidSplice.fire({ index, deleteCount: 1, elements: [] });
		this.onDidChangeReviewItems();

		if (!this.mainPanel) {
			this.onSelectionChange(this.reviewItems);
		}
	}

	private onDidChangeReviewItems(): void {
		toggleClass(this.el, 'empty', this.reviewService.reviewItems.length === 0);

		const shouldMainPanelBeVisible = this.reviewService.reviewItems.length > 0;

		if (!!this.mainPanel === shouldMainPanelBeVisible) {
			return;
		}

		if (shouldMainPanelBeVisible) {
			this.mainPanel = this.instantiationService.createInstance(MainPanel, this);
			const selectionChangeDisposable = this.mainPanel.onSelectionChange(this.onSelectionChange, this);
			this.addPanel(this.mainPanel, this.mainPanel.minimumSize, 0);

			this.mainPanelDisposable = toDisposable(() => {
				this.removePanel(this.mainPanel);
				selectionChangeDisposable.dispose();
				this.mainPanel.dispose();
			});
		} else {
			this.mainPanelDisposable.dispose();
			this.mainPanelDisposable = EmptyDisposable;
			this.mainPanel = null;
		}
	}

	getOptimalWidth(): number {
		return 400;
	}

	getTitle(): string {
		const title = localize('review', "Review");

		if (this.reviewItems.length === 1) {
			const [repository] = this.reviewItems;
			return localize('viewletTitle', "{0}: {1}", title, repository.provider.label);
		} else {
			return title;
		}
	}

	getActions(): IAction[] {
		if (this.isSingleView()) {
			const [panel] = this.reviewItemPanels;
			return panel.getActions();
		}

		return this.menus.getTitleActions();
	}

	getSecondaryActions(): IAction[] {
		let result: IAction[];

		if (this.isSingleView()) {
			const [panel] = this.reviewItemPanels;

			result = [
				...panel.getSecondaryActions(),
				new Separator()
			];
		} else {
			result = this.menus.getTitleSecondaryActions();

			if (result.length > 0) {
				result.push(new Separator());
			}
		}

		result.push(this.instantiationService.createInstance(InstallAdditionalReviewItemsProvidersAction));

		return result;
	}

	getActionItem(action: IAction): IActionItem {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ReviewMenuItemActionItem(action, this.keybindingService, this.messageService);
	}

	layout(dimension: Dimension): void {
		super.layout(dimension);
		this._height = dimension.height;
	}

	// TODO don't allow multi selection
	private onSelectionChange(reviewItems: IReviewItem[]): void {
		// Remove unselected panels
		this.reviewItemPanels
			.filter(p => reviewItems.every(r => p.reviewItem !== r))
			.forEach(panel => this.removePanel(panel));

		// Collect panels still selected
		const repositoryPanels = this.reviewItemPanels
			.filter(p => reviewItems.some(r => p.reviewItem === r));

		// Collect new selected panels
		const newRepositoryPanels = reviewItems
			.filter(r => this.reviewItemPanels.every(p => p.reviewItem !== r))
			.map(r => this.instantiationService.createInstance(ReviewItemPanel, r, this));

		// Add new selected panels
		this.reviewItemPanels = [...repositoryPanels, ...newRepositoryPanels];
		newRepositoryPanels.forEach(panel => {
			this.addPanel(panel, panel.minimumSize, this.length);
			panel.reviewItem.focus();
		});

		// Resize all panels equally
		const height = typeof this.height === 'number' ? this.height : 1000;
		const mainPanelHeight = this.mainPanel ? this.mainPanel.minimumSize : 0;
		const size = (height - mainPanelHeight) / reviewItems.length;

		for (const panel of this.reviewItemPanels) {
			this.resizePanel(panel, size);
		}
	}

	protected isSingleView(): boolean {
		return super.isSingleView() && this.reviewItems.length === 1;
	}

	hide(reviewItem: IReviewItem): void {
		if (!this.mainPanel) {
			return;
		}

		this.mainPanel.hide(reviewItem);
	}


	dispose(): void {
		this.disposables = dispose(this.disposables);
		this.mainPanelDisposable.dispose();
		super.dispose();
	}
}
