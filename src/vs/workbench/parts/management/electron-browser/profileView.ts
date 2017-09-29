/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
import { Button } from 'vs/base/browser/ui/button/button';
import { $ } from 'vs/base/browser/builder';
import { ViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IAuthService } from 'vs/platform/auth/common/auth';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';

/**
 * AuthView is a collapasble viewlet rendered when the ManagementViewlet is triggered.
 * This view is responsible for exposing commands to allow the user to sign in.
 */
export class ProfileView extends ViewsViewletPanel {

	public static readonly ID = 'management.authView';
	private root: HTMLElement;

	constructor(
		options: IViewletViewOptions,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IThemeService private themeService: IThemeService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IAuthService private authService: IAuthService
	) {
		super({ ...(options as IViewOptions), minimumBodySize: authService.currentUser ? 50 : 150 }, keybindingService, contextMenuService);

		this.updateCurrentSizeConstraints();

		this.authService.onDidChangeCurrentUser(() => {
			this.updateCurrentSizeConstraints();
			if (this.root) {
				this.renderBody(this.root);
			}
		});
	}

	private updateCurrentSizeConstraints(): void {
		if (this.authService.currentUser) {
			this.minimumBodySize = 50;
			this.maximumBodySize = 50;
		} else {
			this.minimumBodySize = 150;
			this.maximumBodySize = 150;
		}
	}

	public renderHeader(container: HTMLElement): void {
		const titleDiv = $('div.title').appendTo(container);
		$('span').text(this.name).appendTo(titleDiv);
	}

	protected renderBody(container: HTMLElement): void {
		if (!this.root) {
			this.root = container;
		}
		$(this.root).clearChildren();

		DOM.addClass(container, 'management-view');
		if (this.authService.currentUser) {
			const nameContainer = $('div.section').addClass('row-container').appendTo(container);
			const { avatarUrl, email } = this.authService.currentUser;
			let name = email;
			if (this.authService.currentUser && this.authService.currentUser.currentOrgMember && this.authService.currentUser.currentOrgMember.displayName) {
				name = this.authService.currentUser.currentOrgMember.displayName;
			}
			$('img').src(avatarUrl).size('30').style('border-radius', '15px').verticalAlign('middle').appendTo(nameContainer);
			$('p').text(name).display('inline').verticalAlign('middle').padding(0, 10, 0, 10).appendTo(nameContainer);

			const buttonContainer = $('div').display('inline').float('right').verticalAlign('middle').style('border-radius', '3px').padding(2).appendTo(nameContainer);
			const signoutButton = new Button(buttonContainer);
			attachButtonStyler(signoutButton, this.themeService);
			signoutButton.label = nls.localize('management.profile.signoutLabel', 'Sign out');
			signoutButton.addListener('click', () => {
				this.authService.signOut();
			});
			return;
		}

		const userTitleDiv = $('div.section').appendTo(container);
		$('h4').text(nls.localize('management.profile.title', "You are signed out")).appendTo(userTitleDiv);
		const signInContainer = $('div').appendTo(userTitleDiv);
		$('p').text(nls.localize('management.profile.signInSubTitle', 'Sign in to Sourcegraph to manage your account settings.')).appendTo(signInContainer);
		const buttonContainer = $('div').appendTo(signInContainer);
		const signoutButton = new Button(buttonContainer);
		signoutButton.label = nls.localize('management.profile.signInLabel', 'Sign in to Sourcegraph');
		attachButtonStyler(signoutButton, this.themeService);
		signoutButton.addListener('click', () => {
			this.authService.showSignInFlow();
		});
	}
}
