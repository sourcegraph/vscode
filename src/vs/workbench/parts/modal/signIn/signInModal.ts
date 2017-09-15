/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/workbench/parts/modal/media/modal';
import 'vs/css!./media/signIn';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { $, Builder } from 'vs/base/browser/builder';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Modal } from 'vs/workbench/parts/modal/modal';
import { ModalPart } from 'vs/workbench/parts/modal/modalPart';
import { IAuthService } from 'vs/platform/auth/common/auth';
import { urlToSignIn } from 'vs/platform/auth/node/authService';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { IRemoteConfiguration } from 'vs/platform/remote/node/remote';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

/**
 * SignInModal is the modal rendered when a user attempts to authenticate
 * with Sourcegraph. It guides the user through connecting their remote authentication
 * to their local editor.
 */
export class SignInModal extends Modal {
	constructor(
		parent: ModalPart,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@IAuthService protected authService: IAuthService,
		@IConfigurationEditingService protected configEditingService: IConfigurationEditingService,
		@IConfigurationService protected configurationService: IConfigurationService,
		@ICommandService protected commandService: ICommandService
	) {
		super(parent, telemetryService, true, true);
	}

	public shouldShow(): boolean {
		return true;
	}

	/**
	 * Creates the modal
	 */
	protected createContents(container: Builder): TPromise<void> {
		const remoteConfig = this.configurationService.getConfiguration<IRemoteConfiguration>();
		if (!remoteConfig || !remoteConfig.remote || !remoteConfig.remote.endpoint) {
			throw new Error('unable to sign in because remote.endpoint configuration setting is not present');
		}

		container.addClass('sign-in-modal');
		const $form = $('form').attr({
			tabIndex: '-1',
		}).on('submit', e => {
			e.preventDefault();

			this.configEditingService.writeConfiguration(ConfigurationTarget.USER, {
				key: 'remote.cookie',
				value: $sessionInput.value
			});

			this.parent.popModal();
		})
			.appendTo(container);

		$('div').text(localize('sg.signInForm.title', 'Sign in or sign up')).addClass('modal-title').appendTo($form);

		const url = urlToSignIn(this.configurationService).toString(true);
		const $link = $('a').text(url).href(url);
		$('div')
			.append($('p')
				.text(localize('sg.signInForm.instructions1', 'Your browser has been opened to '))
				.append($link))
			.append($('p').text(localize('sg.signInForm.instructions2', 'Please sign in or sign up there, and copy the ID you receive below.')))
			.addClass('instructions').appendTo($form);

		$('label').text(localize('sg.signInForm.sessionHeader', "Session ID")).appendTo($form);
		const $sessionInput = $('input').attr({
			rows: 1,
			'aria-label': localize('sg.signInForm.sessionHeader', "Session ID"),
			name: 'session-id',
			type: 'text',
			value: remoteConfig && remoteConfig.remote && remoteConfig.remote.cookie ? remoteConfig.remote.cookie : ''
		})
			.appendTo($form).domFocus().getHTMLElement() as HTMLTextAreaElement;

		if (this.authService.currentUser) {
			$('div')
				.addClass('modal-panel current-user')
				.append($('span')
					.text(localize('sg.signInForm.currentUserText', "You are currently signed in as: ")))
				.append($('span')
					.addClass('current-user-value')
					.text(this.authService.currentUser.handle))
				.appendTo($form);
		}

		const $buttonWrapper = $('div').style({ 'text-align': 'right', 'margin-top': '20px' }).appendTo($form);
		$('input').type('button')
			.style({ width: 'auto', marginRight: '5px' })
			.value(localize('sg.signInForm.cancelButton', 'Cancel'))
			.on('click', () => {
				this.parent.popModal();
			})
			.appendTo($buttonWrapper);
		$('input').type('submit')
			.style({ width: 'auto' })
			.value(localize('sg.signInForm.submitButton', 'Save')).appendTo($buttonWrapper);

		return TPromise.as(void 0);
	}
}