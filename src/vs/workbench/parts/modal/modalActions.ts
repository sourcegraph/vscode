/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { ModalIdentifiers } from 'vs/workbench/parts/modal/modal';
import { TPromise } from 'vs/base/common/winjs.base';
import { Action } from 'vs/base/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

/**
 * Onboarding modal
 */
export class ShowOnboardingModalAction extends Action {
	public static ID = 'sg.modal.showOnboardingModal';
	public static LABEL = localize('sg.modal.showOnboardingModal', "Show Welcome Tour Modal");

	constructor(id: string, label: string, @ICommandService private commandService: ICommandService, @ITelemetryService private telemetryService: ITelemetryService) {
		super(id, label);
	}
	public run(): TPromise<void> {
		this.telemetryService.publicLog('OnboardingModalInitiated');
		return this.commandService.executeCommand('sg.modal.pushModal', ModalIdentifiers.ONBOARDING) as TPromise<any>;
	}
}

/**
 * Sign in modal
 */
export class ShowSignInModalAction extends Action {
	public static ID = 'sg.modal.showSignInModal';
	public static LABEL = localize('sg.modal.showSignInModal', "Show Sign In Modal");

	constructor(id: string, label: string, @ICommandService private commandService: ICommandService, @ITelemetryService private telemetryService: ITelemetryService) {
		super(id, label);
	}
	public run(): TPromise<void> {
		this.telemetryService.publicLog('SignInModalInitiated');
		return this.commandService.executeCommand('sg.modal.pushModal', ModalIdentifiers.SIGNIN) as TPromise<any>;
	}
}

/**
 * Clear all modals
 */
export class ClearAllModalsAction extends Action {
	public static ID = 'sg.modal.clearAllModals';
	public static LABEL = localize('sg.modal.clearAllModals', "Clear All Modals");

	constructor(id: string, label: string, @ICommandService private commandService: ICommandService) {
		super(id, label);
	}
	public run(): TPromise<void> {
		return this.commandService.executeCommand('sg.modal.clearAllModalsCommand') as TPromise<any>;
	}
}