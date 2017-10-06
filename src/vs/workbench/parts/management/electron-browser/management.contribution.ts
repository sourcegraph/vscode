/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/management';
import { localize } from 'vs/nls';
import { GlobalViewletRegistry, Extensions as ViewletExtensions, GlobalViewletDescriptor } from 'vs/workbench/browser/viewlet';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { VIEWLET_ID } from 'vs/workbench/parts/management/common/management';
import { Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ManagementUpdater } from 'vs/workbench/parts/management/electron-browser/managementActivity';
import { UpdateContribution } from 'vs/workbench/parts/update/electron-browser/update';
import { ManagementViewlet } from 'vs/workbench/parts/management/electron-browser/managementViewlet';

// Register WorkbenchContributiont for updating the badge on the global activity.
Registry.as(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(ManagementUpdater);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'management',
	'order': 12,
	'title': localize('managementConfigurationTitle', "Management"),
	'type': 'object',
	'properties': {}
});

let descriptor = new GlobalViewletDescriptor(
	ManagementViewlet,
	VIEWLET_ID,
	localize('accountManagement', "Account Management"),
	'management',
	80,
	UpdateContribution
);

Registry.as<GlobalViewletRegistry>(ViewletExtensions.Viewlets)
	.registerViewlet(descriptor);
