/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/checklistViewlet';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { chain } from 'vs/base/common/event';
import { onUnexpectedError } from 'vs/base/common/errors';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer, IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IChecklistService, IChecklistProvider, IChecklistItemGroup, IChecklistItem } from 'vs/workbench/services/checklist/common/checklist';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IMessageService } from 'vs/platform/message/common/message';
import { IListService } from 'vs/platform/list/browser/listService';
import { MenuItemAction } from 'vs/platform/actions/common/actions';
import { IAction, IActionItem, ActionRunner } from 'vs/base/common/actions';
import { MenuItemActionItem } from 'vs/platform/actions/browser/menuItemActionItem';
import { ChecklistMenus } from './checklistMenus';
import { ActionBar, IActionItemProvider } from 'vs/base/browser/ui/actionbar/actionbar';
import { IThemeService, LIGHT } from 'vs/platform/theme/common/themeService';
import { isChecklistItem } from './checklistUtil';
import { attachListStyler, attachBadgeStyler } from 'vs/platform/theme/common/styler';
import Severity from 'vs/base/common/severity';
import { Widget } from 'vs/base/browser/ui/widget';

// TODO@Joao
// Need to subclass MenuItemActionItem in order to respect
// the action context coming from any action bar, without breaking
// existing users
class ChecklistMenuItemActionItem extends MenuItemActionItem {

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
	readonly providers: IChecklistProvider[];
	readonly selectedRepositories: IChecklistProvider[];
	readonly onDidSplice: Event<ISpliceEvent<IChecklistProvider>>;
	hide(provider: IChecklistProvider): void;
}

interface ItemGroupTemplate {
	name: HTMLElement;
	count: CountBadge;
	actionBar: ActionBar;
	dispose: () => void;
}

class ItemGroupRenderer implements IRenderer<IChecklistItemGroup, ItemGroupTemplate> {

	static TEMPLATE_ID = 'item group';
	get templateId(): string { return ItemGroupRenderer.TEMPLATE_ID; }

	constructor(
		private actionItemProvider: IActionItemProvider,
		private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) { }

	renderTemplate(container: HTMLElement): ItemGroupTemplate {
		const element = append(container, $('.item-group'));
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

	renderElement(group: IChecklistItemGroup, index: number, template: ItemGroupTemplate): void {
		const menus = this.instantiationService.createInstance(ChecklistMenus, group.provider);

		template.name.textContent = group.label;
		template.count.setCount(group.itemCollection.items.length);
		template.actionBar.clear();
		template.actionBar.context = group;
		template.actionBar.push(menus.getItemGroupActions(group), { icon: true, label: false });
	}

	disposeTemplate(template: ItemGroupTemplate): void {
		template.dispose();
	}
}

interface ItemTemplate {
	element: HTMLElement;
	name: HTMLElement;
	label: IconLabel;
	decorationIcon: HTMLElement;
	actionBar: ActionBar;
	dispose: () => void;
}

class MultipleSelectionActionRunner extends ActionRunner {

	constructor(private getSelectedItems: () => IChecklistItem[]) {
		super();
	}

	runAction(action: IAction, context: IChecklistItem): TPromise<any> {
		if (action instanceof MenuItemAction) {
			const selection = this.getSelectedItems();
			const filteredSelection = selection.filter(s => s !== context);

			if (selection.length === filteredSelection.length || selection.length === 1) {
				return action.run(context);
			}

			return action.run(context, ...filteredSelection);
		}

		return super.runAction(action, context);
	}
}

class ItemRenderer implements IRenderer<IChecklistItem, ItemTemplate> {

	static TEMPLATE_ID = 'item';
	get templateId(): string { return ItemRenderer.TEMPLATE_ID; }

	constructor(
		private actionItemProvider: IActionItemProvider,
		private getSelectedItems: () => IChecklistItem[],
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService
	) { }

	renderTemplate(container: HTMLElement): ItemTemplate {
		const element = append(container, $('.item'));
		const name = append(element, $('.name'));
		const label = new IconLabel(name, { supportHighlights: false });
		const actionsContainer = append(element, $('.actions'));
		const actionBar = new ActionBar(actionsContainer, {
			actionItemProvider: this.actionItemProvider,
			actionRunner: new MultipleSelectionActionRunner(this.getSelectedItems)
		});

		const decorationIcon = append(element, $('.decoration-icon'));

		return {
			element, name, label, decorationIcon, actionBar, dispose: () => {
				actionBar.dispose();
				label.dispose();
			}
		};
	}

	renderElement(item: IChecklistItem, index: number, template: ItemTemplate): void {
		// TODO(sqs): cache this
		const menus = this.instantiationService.createInstance(ChecklistMenus, item.itemGroup.provider);

		template.label.setValue(item.name, item.description);
		template.actionBar.clear();
		template.actionBar.context = item;
		template.actionBar.push(menus.getItemActions(item), { icon: true, label: false });
		toggleClass(template.name, 'strike-through', item.decorations.strikeThrough);
		toggleClass(template.element, 'faded', item.decorations.faded);

		const theme = this.themeService.getTheme();
		const icon = theme.type === LIGHT ? item.decorations.icon : item.decorations.iconDark;

		if (icon) {
			template.decorationIcon.style.backgroundImage = `url('${icon}')`;
			template.decorationIcon.title = item.decorations.tooltip;
		} else {
			template.decorationIcon.style.backgroundImage = '';
		}
	}

	disposeTemplate(template: ItemTemplate): void {
		template.dispose();
	}
}

class ProviderListDelegate implements IDelegate<IChecklistItemGroup | IChecklistItem> {

	getHeight() { return 22; }

	getTemplateId(element: IChecklistItemGroup | IChecklistItem) {
		return isChecklistItem(element) ? ItemRenderer.TEMPLATE_ID : ItemGroupRenderer.TEMPLATE_ID;
	}
}

function checklistItemIdentityProvider(r: IChecklistItemGroup | IChecklistItem): string {
	if (isChecklistItem(r)) {
		const group = r.itemGroup;
		const provider = group.provider;
		return `${provider.contextValue}/${group.id}/${r.name}`;
	} else {
		const provider = r.provider;
		return `${provider.contextValue}/${r.id}`;
	}
}

export class ChecklistResultsWidget extends Widget {

	private cachedHeight: number | undefined = undefined;
	private list: List<IChecklistItemGroup | IChecklistItem>;

	constructor(
		private domNode: HTMLElement,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IContextMenuService protected contextMenuService: IContextMenuService,
		@IChecklistService protected checklistService: IChecklistService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IListService private listService: IListService,
		@IMessageService private messageService: IMessageService,
		@IThemeService private themeService: IThemeService
	) {
		super();
		this.renderBody();
	}

	focus(): void {
		this.list.domFocus();
	}

	protected renderBody(): void {
		const actionItemProvider = (action: IAction) => this.getActionItem(action);

		const delegate = new ProviderListDelegate();

		const renderers = [
			this.instantiationService.createInstance(ItemGroupRenderer, actionItemProvider, this.themeService),
			this.instantiationService.createInstance(ItemRenderer, actionItemProvider, () => this.getSelectedItems()),
		];

		this.list = new List(this.domNode, delegate, renderers, {
			identityProvider: checklistItemIdentityProvider,
			keyboardSupport: false,
			ariaLabel: localize('listAriaLabel', "Checklist Results"),
		});

		this._register(attachListStyler(this.list, this.themeService));
		this._register(this.listService.register(this.list));

		this._register(chain(this.list.onOpen)
			.map(e => e.elements[0])
			.filter(e => !!e && isChecklistItem(e))
			.on((e: IChecklistItem) => this.open(e)));

		this._register(this.list.onContextMenu(e => this.onListContextMenu(e)));
		this._register(this.list);

		this._register(this.checklistService.onDidItemsChange(() => this.updateList()));

		this.updateList();
	}

	layoutBody(height: number = this.cachedHeight): void {
		if (height === undefined) {
			return;
		}

		this.list.layout(height);
		this.cachedHeight = height;

		this.domNode.style.height = `${height}px`;
		this.list.layout(height);
	}

	getActionItem(action: IAction): IActionItem {
		if (!(action instanceof MenuItemAction)) {
			return undefined;
		}

		return new ChecklistMenuItemActionItem(action, this.keybindingService, this.messageService);
	}

	/**
	 * Updates the list with the latest check list groups and items from the ChecklistService
	 */
	private updateList(): void {
		const elements = this.checklistService.items
			.reduce<(IChecklistItemGroup | IChecklistItem)[]>((r, g) => {
				if (g.itemCollection.items.length === 0 && g.hideWhenEmpty) {
					return r;
				}

				return [...r, g, ...g.itemCollection.items];
			}, []);

		this.list.splice(0, this.list.length, elements);
	}

	private open(e: IChecklistItem): void {
		e.open().done(undefined, onUnexpectedError);
	}

	private onListContextMenu(e: IListContextMenuEvent<IChecklistItemGroup | IChecklistItem>): void {
		const element = e.element;
		let actions: IAction[];

		if (isChecklistItem(element)) {
			const provider = (e.element as IChecklistItem).itemGroup.provider;
			const menus = this.instantiationService.createInstance(ChecklistMenus, provider);
			actions = menus.getItemContextActions(element);
		} else {
			const provider = (e.element as IChecklistItem).itemGroup.provider;
			const menus = this.instantiationService.createInstance(ChecklistMenus, provider);
			actions = menus.getItemGroupContextActions(element);
		}

		this.contextMenuService.showContextMenu({
			getAnchor: () => e.anchor,
			getActions: () => TPromise.as(actions),
			getActionsContext: () => element,
			actionRunner: new MultipleSelectionActionRunner(() => this.getSelectedItems())
		});
	}

	private getSelectedItems(): IChecklistItem[] {
		return this.list.getSelectedElements()
			.filter(r => isChecklistItem(r)) as IChecklistItem[];
	}
}
