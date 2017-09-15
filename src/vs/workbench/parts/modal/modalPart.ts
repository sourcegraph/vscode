/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as dom from 'vs/base/browser/dom';
import { Builder, $ } from 'vs/base/browser/builder';
import { Part } from 'vs/workbench/browser/part';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { OnboardingModal } from 'vs/workbench/parts/modal/onboarding/onboarding';
import { SignInModal } from 'vs/workbench/parts/modal/signIn/signInModal';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IModal, Modal, ModalIdentifiers } from 'vs/workbench/parts/modal/modal';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IPartService } from 'vs/workbench/services/part/common/partService';

/**
 * ModalPart is layed out above the workbench and has it's own layout that displays modal content based
 * on URL query params
 */
export class ModalPart extends Part {
	// Singleton modals
	private onboardingSingleton: OnboardingModal;

	/**
	 * Stack of visible modals, organized from bottom to top, with position in the array
	 * corresponding to their z-index on the parent container.
	 * (new modals are pushed/popped, not shifted/unshifted: this stack is LIFO)
	 */
	private modals: IModal[];

	constructor(
		id: string,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IThemeService themeService: IThemeService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService
	) {
		super(id, { hasTitle: false }, themeService);
		this.modals = [];
	}

	protected createContentArea(parent: Builder): Builder {
		$(parent).div({
			class: 'launcher-modal-overlay', id: this.getId(),
		});

		// Initialize listener for users clicking on typehe container to close a modal
		const container = this.getContainer();
		$(container).on('click', e => {
			if (e.target === container.getHTMLElement()) {
				this.popModal();
			}
		});

		return parent;
	}

	/**
	 * Add one more modal to appear on top
	 */
	public pushModal(modal: IModal | ModalIdentifiers): void {
		const container = this.getContainer();
		if (!(modal instanceof Modal)) {
			switch (modal as ModalIdentifiers) {
				case ModalIdentifiers.ONBOARDING:
					this.onboardingSingleton = this.onboardingSingleton || this.instantiationService.createInstance(OnboardingModal, this);
					modal = this.onboardingSingleton;
					break;
				case ModalIdentifiers.SIGNIN:
					modal = this.instantiationService.createInstance(SignInModal, this);
					break;
				default:
					throw new Error(`Modal type "${modal}" not supported.`);
			}
		}

		if (!modal.shouldShow()) {
			return;
		}

		// No duplicate modals
		// Note this only checks for duplicate additions of the exact same modal object, preventing singleton modals
		// from being pushed twice. Multiple instances of non-singleton modals, however, can be stacked.
		for (let i = 0; i < this.modals.length; i++) {
			if (this.modals[i] === modal) {
				return;
			}
		}

		this.modals.push(modal);
		// Show the modal and its container
		modal.show(container, { zIndex: this.modals.length });
		if (container.isHidden()) {
			container.show();
		}

		// Blur the background
		const workbench = document.getElementById(this.partService.getWorkbenchElementId()) as HTMLElement;
		dom.addClass(workbench, 'blur-background-all');
		return;
	}

	/**
	 * Close the top most modal
	 */
	public popModal(): void {
		if (this.modals.length === 0) {
			return;
		}

		const modal = this.modals.pop();
		// Hide modal (the modal itself handles disposal, if necessary)
		modal.hide();

		if (this.modals.length === 0) {
			const container = this.getContainer();
			container.hide();
			container.clearChildren();

			// Unblur the background
			const workbench = document.getElementById(this.partService.getWorkbenchElementId()) as HTMLElement;
			dom.removeClass(workbench, 'blur-background-all');
		}
	}

	/**
	 * Close all modals
	 */
	public clearAllModals(): void {
		while (this.modals.length > 0) {
			this.popModal();
		}
	}

	protected updateStyles(): void {
		super.updateStyles();
		this.getContainer().style({
			position: 'absolute',
			top: 0,
			left: 0,
			width: '100%',
			height: '100%',
			zIndex: 500,
			backgroundColor: 'rgba(0, 0, 0, 0)',
		});
	}
}