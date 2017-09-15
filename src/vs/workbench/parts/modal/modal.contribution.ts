/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ClearAllModalsAction, ShowOnboardingModalAction } from 'vs/workbench/parts/modal/modalActions';
import { Registry } from 'vs/platform/registry/common/platform';
import { localize } from 'vs/nls';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actions';
import { ModalIdentifiers } from 'vs/workbench/parts/modal/modal';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { Workbench } from 'vs/workbench/electron-browser/workbench';

/**
 * Command to display a modal on top of all other modals
 */
CommandsRegistry.registerCommand('sg.modal.pushModal', (accessor: ServicesAccessor, modalIdentifier: ModalIdentifiers) => {
	const partService = accessor.get(IPartService);

	if (partService instanceof Workbench) {
		partService.joinCreation().then(() => {
			const modalPart = partService.getModalPart();
			modalPart.pushModal(modalIdentifier);
		});
	}
});

/**
 * Command to remove the top modal
 */
CommandsRegistry.registerCommand('sg.modal.popModal', (accessor: ServicesAccessor) => {
	const partService = accessor.get(IPartService);

	if (partService instanceof Workbench) {
		partService.joinCreation().then(() => {
			const modalPart = partService.getModalPart();
			modalPart.popModal();
		});
	}
});

/**
 * Command to hide all modals
 */
CommandsRegistry.registerCommand('sg.modal.clearAllModalsCommand', (accessor: ServicesAccessor) => {
	const partService = accessor.get(IPartService);

	if (partService instanceof Workbench) {
		partService.joinCreation().then(() => {
			const modalPart = partService.getModalPart();
			modalPart.clearAllModals();
		});
	}
});

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(
	new SyncActionDescriptor(ShowOnboardingModalAction, ShowOnboardingModalAction.ID, ShowOnboardingModalAction.LABEL),
	null, localize('view', "View"));

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(
	new SyncActionDescriptor(ClearAllModalsAction, ClearAllModalsAction.ID, ClearAllModalsAction.LABEL),
	null, localize('view', "View"));