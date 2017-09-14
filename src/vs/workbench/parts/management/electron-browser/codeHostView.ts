/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
import { TPromise } from 'vs/base/common/winjs.base';
import { Button } from 'vs/base/browser/ui/button/button';
import { Builder, $ } from 'vs/base/browser/builder';
import { CollapsibleView, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/views';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ViewSizing } from 'vs/base/browser/ui/splitview/splitview';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

/**
 * CodeHostView is a collapasble viewlet rendered when the ManagementViewlet is triggered.
 * This view is responsible for exposing commands from the service-git and service-bitbucket-cloud extensions so that
 * a user can add an authentication token.
 */
export class CodeHostView extends CollapsibleView {

	public static readonly ID = 'management.codeHost';

	private gitHubAccessTokenButton: Button;
	private bitbucketAccessTokenButton: Button;

	constructor(
		initialSize: number,
		options: IViewletViewOptions,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService private commandService: ICommandService,
		@IExtensionService private extensionService: IExtensionService,
	) {
		super(initialSize, { ...(options as IViewOptions), sizing: ViewSizing.Flexible }, keybindingService, contextMenuService);
	}

	public renderHeader(container: HTMLElement): void {
		let titleDiv = $('div.title').appendTo(container);
		$('span').text(this.name).appendTo(titleDiv);
	}

	protected renderBody(container: HTMLElement): void {
		DOM.addClass(container, 'management-view');

		let titleDiv = $('div.section').appendTo(container);
		$('h4').text(nls.localize('codeHostHeaderTitle', "Connect your Code Hosts")).appendTo(titleDiv);
		$('p').text(nls.localize('codeHostSubtext', "Add or update your personal access token to enable remote repository search.")).appendTo(titleDiv);

		let section = $('div.section').appendTo(container);

		// Wait for the extension host to be ready.
		this.extensionService.onReady().then(async () => {
			// Ensure that eager extensions are loaded.
			await this.extensionService.activateByEvent('*');
			this.gitHubAccessTokenButton = await this.createGitHubAccessTokenButton(section);
			this.bitbucketAccessTokenButton = await this.createBitbucketAccessTokenButton(section);
		});
	}

	private async createGitHubAccessTokenButton(section: Builder): TPromise<Button> {
		const container = $('div').padding(5, 0, 0, 0).appendTo(section);
		const button = new Button(container);
		attachButtonStyler(button, this.themeService);
		const hasToken = await this.hasGitHubAccessToken();
		button.label = hasToken ? nls.localize('updateGitHubAccessToken', "Update GitHub Token") : nls.localize('addGitHubAccessToken', "Add GitHub Token");
		button.addListener('click', () => {
			this.telemetryService.publicLog('management.addGitHubTokenClicked');
			this.commandService.executeCommand('github.showCreateAccessTokenWalkthrough');
		});

		return button;
	}

	private async createBitbucketAccessTokenButton(section: Builder): TPromise<Button> {
		const container = $('div').padding(5, 0, 0, 0).appendTo(section);
		const button = new Button(container);
		attachButtonStyler(button, this.themeService);
		const hasToken = await this.hasBitbucketAppPassword();
		button.label = hasToken ? nls.localize('updateBitbucketAccessToken', "Update Bitbucket App") : nls.localize('addBitbucketAccessToken', "Add Bitbucket App");
		button.addListener('click', () => {
			this.telemetryService.publicLog('management.addBitbucketAppClicked');
			this.commandService.executeCommand('bitbucket.showBitbucketAppPasswordWalkthrough');
		});

		return button;
	}

	/**
	 * Fetches the GitHub access token from the service-github extension.
	 * @return Boolean if the access token has been set.
	 */
	private async hasGitHubAccessToken(): Promise<boolean> {
		return Boolean(await this.commandService.executeCommand('github.checkAccessToken'));
	}

	/**
	 * Fetches the bitbucket app password from the service-bitbucket-cloud extension.
	 * @return Boolean if a bitbucket app password as been set before.
	 */
	private async hasBitbucketAppPassword(): Promise<boolean> {
		return Boolean(await this.commandService.executeCommand('bitbucket.checkBitbucketAppPassword'));
	}
}
