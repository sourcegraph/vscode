/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { Severity, IChoiceService } from 'vs/platform/message/common/message';
import { Action } from 'vs/base/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import URI from 'vs/base/common/uri';
import { IRemoteConfiguration } from 'vs/platform/remote/common/remote';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';

Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration({
		id: 'sharing',
		type: 'object',
		title: localize('sharingConfigurationTitle', "Sharing"),
		properties: {
			'sharing.stableBranches': {
				type: 'array',
				description: localize('stableBranchesDescription', "It is assumed that a stable branch will never be deleted and never have its history rewritten."),
				default: ['master'],
			},
			items: {
				type: 'string',
			},
		},
	});

export interface ISharingConfiguration {
	sharing?: {
		stableBranches?: string[],
	};
}

/**
 * ShareContextConfigurationAction checks if the user has the correct configuration settings required to post a comment
 * or to share a code snippet. If the user does not have the correct configuration settings this action shows a prompt.
 * If the user clicks "Allow" the configuration value is updated and the promise is returned as true otherwise the promise
 * is returned as false.
 */
export class ShareContextConfigurationAction extends Action {
	static ID = 'remote.configuration.shareContextAction';
	static LABEL = localize('shareContextConfigurationPrompt', 'Show share context configuration prompt');

	constructor(
		id: string,
		label: string,
		private branch: string,
		private isShareLink: boolean,
		@IConfigurationService private configurationService: IConfigurationService,
		@IChoiceService private choiceService: IChoiceService,
		@IOpenerService private openerService: IOpenerService,
	) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return TPromise.wrap(this.runAsync());
	}

	public async runAsync(): TPromise<any> {
		const { remote } = this.configurationService.getConfiguration<IRemoteConfiguration>();
		if (remote && remote.shareContext) {
			return true;
		}

		const { sharing } = this.configurationService.getConfiguration<ISharingConfiguration>();
		if (sharing && sharing.stableBranches) {
			if (sharing.stableBranches.indexOf(this.branch) !== -1) {
				return true;
			}
		}

		const message = this.isShareLink ?
			localize('config.remote.shareContextLink', "Creating a shared snippet uploads the selected code (plus a few surrounding lines) to {0}, and you will be given a secret URL. Allow?", remote.endpoint) :
			localize('config.remote.shareContextComment', "Commenting on branches requires uploading the selected code (plus a few surrounding lines) to preserve position. Allow sending this to {0}?", remote.endpoint);
		const options = [
			localize('alwaysAllow', "Always allow"),
			localize('learnMore', "Learn More")
		];
		const index = await this.choiceService.choose(Severity.Info, message, options, 1, false);
		if (index === 0) {
			this.configurationService.updateValue('remote.shareContext', true);
			return true;
		}
		this.openerService.open(URI.parse('https://about.sourcegraph.com/docs/editor/share-code/'));
		return false;
	}
}
