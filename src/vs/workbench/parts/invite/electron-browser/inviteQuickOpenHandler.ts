/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Mode, IEntryRunContext, IAutoFocus, IQuickNavigateConfiguration, IModel } from 'vs/base/parts/quickopen/common/quickOpen';
import { QuickOpenModel, QuickOpenEntry } from 'vs/base/parts/quickopen/browser/quickOpenModel';
import { QuickOpenHandler } from 'vs/workbench/browser/quickopen';
import { OPEN_INVITE_QUICK_OPEN_ID, INVITE_PREFIX } from 'vs/workbench/parts/invite/common/constants';
import { IAuthService } from 'vs/platform/auth/common/auth';

class InviteEntry extends QuickOpenEntry {
	constructor(
		@IAuthService private authService: IAuthService,
		public readonly emailAddress: string,
		private readonly orgName: string,
	) {
		super();
	}

	public getLabel(): string {
		return localize('quickOpenInvite.entry', "Invite {0} to the {1} organization", this.emailAddress, this.orgName);
	}

	public run(mode: Mode, context: IEntryRunContext): boolean {
		if (mode === Mode.OPEN) {
			this.authService.inviteTeammate(this.emailAddress);
			return true;
		}
		return false;
	}
}


export class InviteQuickOpenHandler extends QuickOpenHandler {

	public static readonly ID = OPEN_INVITE_QUICK_OPEN_ID;
	public static readonly PREFIX = INVITE_PREFIX;

	private orgName: string;

	private model?: QuickOpenModel;

	constructor(
		@IAuthService private authService: IAuthService,
	) {
		super();
		this.orgName = this.authService.currentUser.currentOrgMember.org.name;
	}

	public onOpen(): void {
		this.model = new QuickOpenModel([]);
	}

	public onClose(): void {
		this.model = undefined;
	}

	public getResults(searchTerm: string): TPromise<QuickOpenModel> {
		searchTerm = searchTerm.trim().toLowerCase();
		if (searchTerm) {
			const entry = new InviteEntry(this.authService, searchTerm, this.orgName);
			return TPromise.as(new QuickOpenModel([entry]));
		}
		return TPromise.as(new QuickOpenModel([]));
	}

	public canRun(): boolean | string {
		if (!this.authService.currentUser) {
			return localize('quickOpenInvite.unAuthed', 'You must be signed in and a member of an organization to send an invite.');
		}
		if (!this.authService.currentUser.currentOrgMember || !this.authService.currentUser.currentOrgMember.org) {
			return localize('quickOpenInvite.noOrg', 'You must be a member of an organization to send an invite.');
		}

		return true;
	}

	/**
	 * Allows to return a label that will be used when there are no results found
	 */
	public getEmptyLabel(searchString: string): string {
		return localize('quickOpenInvite.enterEmail', "Enter the email address of the person that you would like to invite to {0}", this.orgName);
	}

	public getAutoFocus(searchValue: string, context: { model: IModel<QuickOpenEntry>, quickNavigateConfiguration?: IQuickNavigateConfiguration }): IAutoFocus {
		return {
			autoFocusFirstEntry: !!searchValue || !!context.quickNavigateConfiguration
		};
	}
}
