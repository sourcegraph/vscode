/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { DynamicContentContribution, DynamicContentAction } from 'vs/workbench/parts/content/dynamicContent';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
	.registerConfiguration({
		'id': 'workbench',
		'order': 7,
		'title': localize('workbenchConfigurationTitle', "Workbench"),
		'properties': {
			'workbench.dynamicContent.enabled': {
				'type': 'boolean',
				'default': true,
				'description': localize('welcomePage.enabled', "When enabled, will show the Welcome page on startup.")
			},
		}
	});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(DynamicContentContribution);

Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(DynamicContentAction, DynamicContentAction.ID, DynamicContentAction.LABEL), 'Help: Welcome', localize('help', "Help"));
