/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import DOM = require('vs/base/browser/dom');
import nls = require('vs/nls');
import { Button } from 'vs/base/browser/ui/button/button';
import { $ } from 'vs/base/browser/builder';
import { ViewsViewletPanel, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IAuthService } from 'vs/platform/auth/common/auth';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IAction } from 'vs/base/common/actions';
import { prepareActions } from 'vs/workbench/browser/actions';
import { CreateOrganizationAction } from 'vs/workbench/parts/management/browser/managementActions';
import { listInactiveSelectionBackground } from 'vs/platform/theme/common/colorRegistry';

/**
 * OrganizationView is a collapasble viewlet rendered in the ManagementViewlet
 * and is displayed when an update is available.
 */
export class OrganizationView extends ViewsViewletPanel {

	public static readonly ID = 'management.organizationView';
	private root: HTMLElement;
	private createOrgAction: CreateOrganizationAction;

	constructor(
		options: IViewletViewOptions,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IThemeService private themeService: IThemeService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IAuthService private authService: IAuthService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super(options as IViewOptions, keybindingService, contextMenuService);
		this.updateCurrentSizeConstraints();

		this.authService.onDidChangeCurrentUser(() => {
			this.updateCurrentSizeConstraints();
			if (this.root) {
				this.renderBody(this.root);
			}
		});

		this.createActions();
	}

	private createActions(): void {
		this.createOrgAction = this.instantiationService.createInstance(CreateOrganizationAction, this.getViewer(), true, 'explorer-action add-org');
	}

	private updateCurrentSizeConstraints(): void {
		if (this.authService.currentUser && this.authService.currentUser.currentOrgMember) {
			this.minimumBodySize = this.authService.currentUser.orgMemberships.length * 50;
			this.maximumBodySize = this.authService.currentUser.orgMemberships.length * 50;
		} else {
			this.minimumBodySize = 50;
			this.maximumBodySize = 50;
		}
	}

	protected renderBody(container: HTMLElement): void {
		if (!this.root) {
			this.root = container;
		}
		if (this.toolbar) {
			this.toolbar.setActions(prepareActions(this.getActions()), this.getSecondaryActions())();
		}

		$(this.root).clearChildren();

		if (!this.authService.currentUser) {
			return;
		}

		DOM.addClass(container, 'organization-view');
		const { orgMemberships, currentOrgMember } = this.authService.currentUser;
		const orgsContainer = $('div.section').appendTo(container);

		if (!orgMemberships.length) {
			const manageOrgRow = $('div').addClass('add-organization-row').appendTo(orgsContainer);
			const manageOrganizationsButton = new Button(manageOrgRow);
			attachButtonStyler(manageOrganizationsButton, this.themeService);
			manageOrganizationsButton.label = nls.localize('management.organization.addOrg', "Add organization");
			this.disposables.push(manageOrganizationsButton.addListener('click', () => {
				this.createOrgAction.run();
			}));
			return;
		}

		orgMemberships.forEach(orgMember => {
			const orgContainer = $('div').addClass('organization-row-container').appendTo(orgsContainer);
			const nameContainer = $('div').addClass('organization-container').appendTo(orgContainer);
			if (orgMember.id === currentOrgMember.id) {
				$(orgContainer).style('cursor', 'auto');
				orgContainer.addClass('selected-organization');
			} else {
				$(orgContainer).style('cursor', 'pointer');
				orgContainer.getHTMLElement().addEventListener('click', () => {
					this.telemetryService.publicLog('SwitchActiveOrgClicked');
					this.authService.currentUser.currentOrgMember = orgMember;
					this.renderBody(this.root);
				});
			}

			const { name } = orgMember.org;
			$('div').text(name).addClass('organization-title').appendTo(nameContainer);

			const buttonContainer = $('div').addClass('organization-button-container').appendTo(orgContainer);
			const inviteButton = new Button(buttonContainer);
			attachButtonStyler(inviteButton, this.themeService);
			inviteButton.label = nls.localize('management.organization.invite', 'Invite');
			this.disposables.push(inviteButton.addListener('click', () => {
				this.telemetryService.publicLog('InviteOrgMemberClicked');
				window.open(`https://sourcegraph.com/settings/team/${name}`);
			}));
		});
	}

	getActions(): IAction[] {
		return [this.createOrgAction];
	}
}

registerThemingParticipant((theme, collector) => {
	const buttonBackground = theme.getColor(listInactiveSelectionBackground);
	if (buttonBackground) {
		collector.addRule(`.management-viewlet .organization-view .selected-organization { background-color: ${buttonBackground}; }`);
	}
});
