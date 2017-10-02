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
import { ViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IConfigurationService, IConfigurationServiceEvent } from 'vs/platform/configuration/common/configuration';

/**
 * CodeHostView is a collapasble viewlet rendered when the ManagementViewlet is triggered.
 * This view is responsible for exposing commands from the service-git and service-bitbucket-cloud extensions so that
 * a user can add an authentication token.
 */
export class CodeHostView extends ViewsViewletPanel {

	public static readonly ID = 'management.codeHost';

	private gitHubAccessTokenButton: Button;
	private bitbucketAccessTokenButton: Button;

	constructor(
		options: IViewletViewOptions,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IThemeService private themeService: IThemeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ICommandService private commandService: ICommandService,
		@IExtensionService private extensionService: IExtensionService,
		@IConfigurationService private configurationService: IConfigurationService
	) {
		super({ ...(options as IViewOptions) }, keybindingService, contextMenuService);
		this.minimumBodySize = 180;

		this.configurationService.onDidUpdateConfiguration(async (e) => {
			await this.updateButtonLabelsForConfigEvent(e);
		});
	}

	public renderHeader(container: HTMLElement): void {
		let titleDiv = $('div.title').appendTo(container);
		$('span').text(this.name).appendTo(titleDiv);
	}

	protected renderBody(container: HTMLElement): void {
		DOM.addClass(container, 'management-view');

		let titleDiv = $('div.section').appendTo(container);
		$('h4').text(nls.localize('codeHostHeaderTitle', "Connect to Code Hosts")).appendTo(titleDiv);
		$('p').text(nls.localize('codeHostSubtext', "A GitHub personal access token or Bitbucket app password is required to enable remote repository search.")).appendTo(titleDiv);

		let section = $('div.section').appendTo(container);

		// Wait for the extension host to be ready.
		this.extensionService.onReady().then(async () => {
			// Ensure that eager extensions are loaded.
			await this.extensionService.activateByEvent('*');

			const gitHubToken = await this.hasGitHubAccessToken();
			this.gitHubAccessTokenButton = this.createGitHubAccessTokenButton(section);
			await this.setGitHubButtonLabel(this.gitHubAccessTokenButton, gitHubToken);

			const bitbucketAppPassword = await this.hasBitbucketAppPassword();
			this.bitbucketAccessTokenButton = await this.createBitbucketAccessTokenButton(section, bitbucketAppPassword);
			await this.setBitbucketAppPasswordLabel(this.bitbucketAccessTokenButton, bitbucketAppPassword);
		});
	}

	private createGitHubAccessTokenButton(section: Builder): Button {
		const container = $('div').padding(5, 0, 0, 0).appendTo(section);
		const button = new Button(container);
		attachButtonStyler(button, this.themeService);
		button.addListener('click', () => {
			this.telemetryService.publicLog('management.addGitHubTokenClicked');
			this.commandService.executeCommand('github.showCreateAccessTokenWalkthrough', true);
		});

		return button;
	}

	private async createBitbucketAccessTokenButton(section: Builder, hasToken: boolean): TPromise<Button> {
		const container = $('div').padding(5, 0, 0, 0).appendTo(section);
		const button = new Button(container);
		attachButtonStyler(button, this.themeService);

		button.addListener('click', () => {
			this.telemetryService.publicLog('management.addBitbucketAppClicked');
			this.commandService.executeCommand('bitbucket.showBitbucketAppPasswordWalkthrough', true);
		});

		return button;
	}

	private async setGitHubButtonLabel(button: Button, hasToken: boolean): TPromise<void> {
		button.label = hasToken ? nls.localize('updateGitHubAccessToken', "Update GitHub token") : nls.localize('addGitHubAccessToken', "Add GitHub token");
	}

	private async setBitbucketAppPasswordLabel(button: Button, hasToken: boolean): TPromise<void> {
		button.label = hasToken ? nls.localize('updateBitbucketAccessToken', "Update Bitbucket app password") : nls.localize('addBitbucketAccessToken', "Set Bitbucket app password");
	}

	private async updateButtonLabelsForConfigEvent(e: IConfigurationServiceEvent): TPromise<void> {
		const { bitbucket, github } = e.sourceConfig;
		const bitbucketAppPassword = bitbucket && bitbucket.cloud && bitbucket.cloud.appPassword && bitbucket.cloud.username;
		this.setGitHubButtonLabel(this.gitHubAccessTokenButton, github && github.token);
		this.setBitbucketAppPasswordLabel(this.bitbucketAccessTokenButton, bitbucketAppPassword);
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
