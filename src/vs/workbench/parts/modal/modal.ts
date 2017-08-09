/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { Builder } from 'vs/base/browser/builder';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ModalPart } from 'vs/workbench/parts/modal/modalPart';
import { registerColor, inputBorder, inputBackground, inputForeground, buttonBackground, buttonForeground, inputValidationErrorBackground, inputValidationInfoBackground } from 'vs/platform/theme/common/colorRegistry';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ProgressBar } from 'vs/base/browser/ui/progressbar/progressbar';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_FOREGROUND, PANEL_BORDER } from 'vs/workbench/common/theme';

export enum ModalIdentifiers {
	ONBOARDING
};

export interface IModal {
	readonly closeable: boolean;
	shouldShow(): boolean;
	show(container: Builder, styles?: any): void;
	hide(): void;
}

/**
 * Callback for when a user closes a Modal
 */
export interface IModalClosedHandler {
	(): void;
}

/**
 * Abstract class implementing basic modal interface and functionality
 */
export abstract class Modal implements IModal {
	readonly closeable: boolean = true;
	modalBackgroundContainer: Builder;
	private _onClose: Set<IModalClosedHandler> = new Set();
	private _progressBar?: ProgressBar;

	protected constructor(
		protected parent: ModalPart,
		@ITelemetryService protected telemetryService: ITelemetryService,
		closeable?: boolean
	) {
		this.parent = parent;
		if (closeable !== undefined) {
			this.closeable = closeable;
		}
	}

	/**
	 * Abstract method to indicate whether this modal should be displayed or not
	 */
	public abstract shouldShow(): boolean;

	/**
	 * Abstract method to generate the contents of this particular modal
	 */
	protected abstract createContents(container: Builder): TPromise<void>;

	/**
	 * Displays the modal, attached to container
	 * NOTE: this should never be called directly, only added to to DOM through a
	 * call to ModalPart.pushModal()
	 */
	public show(container: Builder, styles?: any): void {
		if (!this.shouldShow()) {
			return;
		}

		if (!this.modalBackgroundContainer) {
			let loadingContents;

			container.asContainer().div({ class: 'modal-background-layer' }, background => {
				// Store Builder that points at the background DOM element
				// (note clone doesn't clone the element, just the Builder wrapper)
				this.modalBackgroundContainer = background.clone();

				background.on('click', e => {
					if (e.target === this.modalBackgroundContainer.getHTMLElement() && this.closeable) {
						this.telemetryService.publicLog('ModalSkipped', { location_on_page: 'background' });
						this.parent.popModal();
					}
				});

				background.div({ class: 'modal-body' }, body => {
					this._progressBar = new ProgressBar(body);
					this._progressBar.infinite().getContainer().show();

					body.div({ class: 'modal-contents' }, div => {
						loadingContents = this.createContents(div);
					});
				});
			});

			loadingContents.then(() => {
				loadingContents = undefined;
				this._progressBar.done();
			});
		} else {
			// If already generated, re-append to the container
			this.modalBackgroundContainer.appendTo(container);
		}

		this.modalBackgroundContainer.style(styles).show();
	}

	/**
	 * Add a handler to be executed when a modal is hidden
	 */
	protected onClose(handler: IModalClosedHandler): void {
		this._onClose.add(handler);
	}

	/**
	 * Method to hide this modal — can be called by the inheriting subclass
	 * NOTE: this should never be called directly, only through ModalPart.popModal()
	 */
	public hide(): void {
		if (this.modalBackgroundContainer) {
			this.modalBackgroundContainer.hide();
		}
		this._onClose.forEach((closeHandler) => {
			closeHandler();
		});
		this._onClose.clear();
	}
}

/**
 * Themes
 */
export const modalBackground = registerColor('modal.background', {
	dark: SIDE_BAR_BACKGROUND,
	light: SIDE_BAR_BACKGROUND,
	hc: SIDE_BAR_BACKGROUND
}, localize('modalBackground', "Modal background"));

export const modalForeground = registerColor('modal.foreground', {
	dark: SIDE_BAR_FOREGROUND,
	light: SIDE_BAR_FOREGROUND,
	hc: SIDE_BAR_FOREGROUND
}, localize('modalForeground', "Modal foreground"));

export const modalBorder = registerColor('modal.border', {
	dark: PANEL_BORDER,
	light: PANEL_BORDER,
	hc: PANEL_BORDER
}, localize('modalBorder', "Modal border"));

export const modalTitleForeground = registerColor('modal.titleForeground', {
	dark: SIDE_BAR_FOREGROUND,
	light: SIDE_BAR_FOREGROUND,
	hc: SIDE_BAR_FOREGROUND
}, localize('modalTitleForeground', "Modal title foreground"));

export const modalPanelBackground = registerColor('modal.panelBackground', {
	dark: SIDE_BAR_BACKGROUND,
	light: SIDE_BAR_BACKGROUND,
	hc: SIDE_BAR_BACKGROUND
}, localize('modalPanelBackground', "Modal panel background"));

export const modalPanelSecondaryForeground = registerColor('modal.panelSecondaryForeground', {
	dark: SIDE_BAR_FOREGROUND,
	light: SIDE_BAR_FOREGROUND,
	hc: SIDE_BAR_FOREGROUND
}, localize('modalPanelSecondaryForeground', "Modal panel secondary foreground"));

export const modalPanelBorder = registerColor('modal.panelBorder', {
	dark: PANEL_BORDER,
	light: PANEL_BORDER,
	hc: PANEL_BORDER
}, localize('modalPanelBorder', "Modal panel border"));

export const modalInputBorder = registerColor('modal.inputBorder', {
	dark: inputBorder,
	light: inputBorder,
	hc: inputBorder
}, localize('modalInputBorder', "Modal panel border"));

export const modalInputBackground = registerColor('modal.inputBackground', {
	dark: inputBackground,
	light: inputBackground,
	hc: inputBackground
}, localize('modalInputBackground', "Modal input background"));

export const modalInputForeground = registerColor('modal.inputForeground', {
	dark: inputForeground,
	light: inputForeground,
	hc: inputForeground
}, localize('modalInputForeground', "Modal input foreground"));

export const modalButtonBackground = registerColor('modal.buttonBackground', {
	dark: buttonBackground,
	light: buttonBackground,
	hc: buttonBackground
}, localize('modalButtonBackground', "Modal button background"));

export const modalButtonForeground = registerColor('modal.buttonForeground', {
	dark: buttonForeground,
	light: buttonForeground,
	hc: buttonForeground
}, localize('modalButtonForeground', "Modal button foreground"));

export const modalButtonErrorBackground = registerColor('modal.buttonErrorBackground', {
	dark: inputValidationErrorBackground,
	light: inputValidationErrorBackground,
	hc: inputValidationErrorBackground
}, localize('modalButtonErrorBackground', "Modal button error background"));

export const modalButtonErrorForeground = registerColor('modal.buttonErrorForeground', {
	dark: SIDE_BAR_FOREGROUND,
	light: SIDE_BAR_FOREGROUND,
	hc: SIDE_BAR_FOREGROUND
}, localize('modalButtonErrorForeground', "Modal button error foreground"));

export const modalButtonDisabledBackground = registerColor('modal.buttonDisabledBackground', {
	dark: inputValidationInfoBackground,
	light: inputValidationInfoBackground,
	hc: inputValidationInfoBackground
}, localize('modalButtonDisbledBackground', "Modal button disabled background"));

export const modalButtonDisabledForeground = registerColor('modal.buttonDisabledForeground', {
	dark: SIDE_BAR_FOREGROUND,
	light: SIDE_BAR_FOREGROUND,
	hc: SIDE_BAR_FOREGROUND
}, localize('modalButtonDisbledForeground', "Modal button disabled foreground"));

registerThemingParticipant((theme, collector) => {
	const baseModalSelector = '.monaco-shell .monaco-shell-content .part.modal .modal-body';
	let background = theme.getColor(modalBackground, true);
	if (background) {
		collector.addRule(`${baseModalSelector} { background-color: ${background}; }`);
	}
	let foreground = theme.getColor(modalForeground, true);
	if (foreground) {
		collector.addRule(`${baseModalSelector} { color: ${foreground}; }`);
	}
	let border = theme.getColor(modalBorder, true);
	if (border) {
		collector.addRule(`${baseModalSelector} { border-color: ${border}; }`);
	}
	let titleForeground = theme.getColor(modalTitleForeground, true);
	if (titleForeground) {
		collector.addRule(`${baseModalSelector} .modal-title { color: ${titleForeground}; }`);
	}
	let panelBackground = theme.getColor(modalPanelBackground, true);
	if (panelBackground) {
		collector.addRule(`${baseModalSelector} .modal-panel { background-color: ${panelBackground}; }`);
	}
	let panelSecondaryForeground = theme.getColor(modalPanelSecondaryForeground, true);
	if (panelSecondaryForeground) {
		collector.addRule(`${baseModalSelector} .modal-panel .member-email { color: ${panelSecondaryForeground}; }`);
		collector.addRule(`${baseModalSelector} .modal-panel .terms { color: ${panelSecondaryForeground}; }`);
		collector.addRule(`${baseModalSelector} .modal-panel .panel-secondary-text { color: ${panelSecondaryForeground}; }`);
	}
	let panelBorder = theme.getColor(modalPanelBorder, true);
	if (panelBorder) {
		collector.addRule(`${baseModalSelector} .modal-panel { border-color: ${panelBorder}; }`);
	}
	let inputForeground = theme.getColor(modalInputForeground, true);
	if (inputForeground) {
		collector.addRule(`${baseModalSelector} input[type=text] { color: ${inputForeground}; }`);
		collector.addRule(`${baseModalSelector} input[type=email] { color: ${inputForeground}; }`);
	}
	let inputBackground = theme.getColor(modalInputBackground, true);
	if (inputBackground) {
		collector.addRule(`${baseModalSelector} input[type=text] { background-color: ${inputBackground}; }`);
		collector.addRule(`${baseModalSelector} input[type=email] { background-color: ${inputBackground}; }`);
	}
	let inputBorder = theme.getColor(modalInputBorder, true);
	if (inputBorder) {
		collector.addRule(`${baseModalSelector} input[type=text] { border-color: ${inputBorder}; }`);
		collector.addRule(`${baseModalSelector} input[type=email] { border-color: ${inputBorder}; }`);
	}
	let buttonBackground = theme.getColor(modalButtonBackground, true);
	if (buttonBackground) {
		collector.addRule(`${baseModalSelector} input[type=button] { background-color: ${buttonBackground}; }`);
		collector.addRule(`${baseModalSelector} input[type=submit] { background-color: ${buttonBackground}; }`);
		collector.addRule(`${baseModalSelector} .modal-button { background-color: ${buttonBackground}; }`);
	}
	let buttonForeground = theme.getColor(modalButtonForeground, true);
	if (buttonForeground) {
		collector.addRule(`${baseModalSelector} input[type=button] { color: ${buttonForeground}; }`);
		collector.addRule(`${baseModalSelector} input[type=submit] { color: ${buttonForeground}; }`);
		collector.addRule(`${baseModalSelector} .modal-button { color: ${buttonForeground}; }`);
	}
	let buttonErrorBackground = theme.getColor(modalButtonErrorBackground, true);
	if (buttonErrorBackground) {
		collector.addRule(`${baseModalSelector} input[type=button].modal-button-error { background-color: ${buttonErrorBackground}; }`);
		collector.addRule(`${baseModalSelector} input[type=submit].modal-button-error { background-color: ${buttonErrorBackground}; }`);
		collector.addRule(`${baseModalSelector} .modal-button.modal-button-error { background-color: ${buttonErrorBackground}; }`);
	}
	let buttonErrorForeground = theme.getColor(modalButtonErrorForeground, true);
	if (buttonErrorForeground) {
		collector.addRule(`${baseModalSelector} input[type=button].modal-button-error { color: ${buttonErrorForeground}; }`);
		collector.addRule(`${baseModalSelector} input[type=submit].modal-button-error { color: ${buttonErrorForeground}; }`);
		collector.addRule(`${baseModalSelector} .modal-button.modal-button-error { color: ${buttonErrorForeground}; }`);
	}
	let buttonDisabledBackground = theme.getColor(modalButtonDisabledBackground, true);
	if (buttonDisabledBackground) {
		collector.addRule(`${baseModalSelector} input[type=button].modal-button-disabled { background-color: ${buttonDisabledBackground}; }`);
		collector.addRule(`${baseModalSelector} input[type=submit].modal-button-disabled { background-color: ${buttonDisabledBackground}; }`);
		collector.addRule(`${baseModalSelector} .modal-button.modal-button-disabled { background-color: ${buttonDisabledBackground}; }`);
	}
	let buttonDisabledForeground = theme.getColor(modalButtonDisabledForeground, true);
	if (buttonDisabledForeground) {
		collector.addRule(`${baseModalSelector} input[type=button].modal-button-disabled { color: ${buttonDisabledForeground}; }`);
		collector.addRule(`${baseModalSelector} input[type=submit].modal-button-disabled { color: ${buttonDisabledForeground}; }`);
		collector.addRule(`${baseModalSelector} .modal-button.modal-button-disabled { color: ${buttonDisabledForeground}; }`);
	}
});