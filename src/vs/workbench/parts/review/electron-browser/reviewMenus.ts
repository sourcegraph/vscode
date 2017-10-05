/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/reviewViewlet';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IMenuService, MenuId, IMenu } from 'vs/platform/actions/common/actions';
import { IAction } from 'vs/base/common/actions';
import { fillInActions } from 'vs/platform/actions/browser/menuItemActionItem';
import { getReviewResourceContextKey } from './reviewUtil';
import { IReviewProvider, IReviewResourceGroup, IReviewResource } from 'vs/workbench/services/review/common/review';

export class ReviewMenus implements IDisposable {

	private contextKeyService: IContextKeyService;
	private titleMenu: IMenu;
	private titleActions: IAction[] = [];
	private titleSecondaryActions: IAction[] = [];

	private _onDidChangeTitle = new Emitter<void>();
	get onDidChangeTitle(): Event<void> { return this._onDidChangeTitle.event; }

	private disposables: IDisposable[] = [];

	constructor(
		private provider: IReviewProvider | undefined,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService private menuService: IMenuService
	) {
		this.contextKeyService = contextKeyService.createScoped();
		const reviewProviderKey = this.contextKeyService.createKey<string | undefined>('reviewProvider', void 0);

		if (provider) {
			reviewProviderKey.set(provider.contextValue);
		} else {
			reviewProviderKey.set('');
		}

		this.titleMenu = this.menuService.createMenu(MenuId.ReviewTitle, this.contextKeyService);
		this.disposables.push(this.titleMenu);

		this.titleMenu.onDidChange(this.updateTitleActions, this, this.disposables);
		this.updateTitleActions();
	}

	private updateTitleActions(): void {
		this.titleActions = [];
		this.titleSecondaryActions = [];
		// TODO@joao: second arg used to be null
		fillInActions(this.titleMenu, { shouldForwardArgs: true }, { primary: this.titleActions, secondary: this.titleSecondaryActions });
		this._onDidChangeTitle.fire();
	}

	getTitleActions(): IAction[] {
		return this.titleActions;
	}

	getTitleSecondaryActions(): IAction[] {
		return this.titleSecondaryActions;
	}

	getResourceGroupActions(group: IReviewResourceGroup): IAction[] {
		return this.getActions(MenuId.ReviewResourceGroupContext, group).primary;
	}

	getResourceGroupContextActions(group: IReviewResourceGroup): IAction[] {
		return this.getActions(MenuId.ReviewResourceGroupContext, group).secondary;
	}

	getResourceActions(resource: IReviewResource): IAction[] {
		return this.getActions(MenuId.ReviewResourceContext, resource).primary;
	}

	getResourceContextActions(resource: IReviewResource): IAction[] {
		return this.getActions(MenuId.ReviewResourceContext, resource).secondary;
	}

	private getActions(menuId: MenuId, resource: IReviewResourceGroup | IReviewResource): { primary: IAction[]; secondary: IAction[]; } {
		const contextKeyService = this.contextKeyService.createScoped();
		contextKeyService.createKey('reviewResourceGroup', getReviewResourceContextKey(resource));

		const menu = this.menuService.createMenu(menuId, contextKeyService);
		const primary: IAction[] = [];
		const secondary: IAction[] = [];
		const result = { primary, secondary };
		fillInActions(menu, { shouldForwardArgs: true }, result, g => g === 'inline');

		menu.dispose();
		contextKeyService.dispose();

		return result;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}