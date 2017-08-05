/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import * as errors from 'vs/base/common/errors';
import DOM = require('vs/base/browser/dom');
import { TPromise } from 'vs/base/common/winjs.base';
import { IAction } from 'vs/base/common/actions';
import { Button } from 'vs/base/browser/ui/button/button';
import { $ } from 'vs/base/browser/builder';
import { IActionItem } from 'vs/base/browser/ui/actionbar/actionbar';
import { CollapsibleView, IViewletViewOptions, IViewOptions } from 'vs/workbench/parts/views/browser/views';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { NewWorkspaceAction, SaveWorkspaceAsAction } from 'vs/workbench/browser/actions/workspaceActions';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ViewSizing } from 'vs/base/browser/ui/splitview/splitview';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

export class EmptyView extends CollapsibleView {

	private openWorkspaceButton: Button;

	constructor(
		options: IViewletViewOptions,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
	) {
		super({ ...(options as IViewOptions), sizing: ViewSizing.Flexible }, keybindingService, contextMenuService);
	}

	public renderHeader(container: HTMLElement): void {
		let titleDiv = $('div.title').appendTo(container);
		$('span').text(this.name).appendTo(titleDiv);
	}

	protected renderBody(container: HTMLElement): void {
		DOM.addClass(container, 'non-multi-root-workspace-view');

		let titleDiv = $('div.section').appendTo(container);
		$('p').text(nls.localize('noWorkspaceHelp', "A workspace lets you work with multiple repositories and folders at once.")).appendTo(titleDiv);

		let section = $('div.section').appendTo(container);

		const actionClass = this.contextService.hasWorkspace() ? SaveWorkspaceAsAction : NewWorkspaceAction;

		this.openWorkspaceButton = new Button(section);
		attachButtonStyler(this.openWorkspaceButton, this.themeService);
		this.openWorkspaceButton.label = nls.localize('createWorkspace', "Create Workspace");
		this.openWorkspaceButton.addListener('click', () => {
			const action = this.instantiationService.createInstance<string, string, IAction>(actionClass, actionClass.ID, actionClass.LABEL);
			this.actionRunner.run(action).done(() => {
				action.dispose();
			}, err => {
				action.dispose();
				errors.onUnexpectedError(err);
			});
		});
	}

	layoutBody(size: number): void {
		// no-op
	}

	public create(): TPromise<void> {
		return TPromise.as(null);
	}

	public setVisible(visible: boolean): TPromise<void> {
		return TPromise.as(null);
	}

	public focusBody(): void {
		if (this.openWorkspaceButton) {
			this.openWorkspaceButton.getElement().focus();
		}
	}

	protected reveal(element: any, relativeTop?: number): TPromise<void> {
		return TPromise.as(null);
	}

	public getActions(): IAction[] {
		return [];
	}

	public getSecondaryActions(): IAction[] {
		return [];
	}

	public getActionItem(action: IAction): IActionItem {
		return null;
	}

	public shutdown(): void {
		// Subclass to implement
	}
}