/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/platform';
import { DynamicContentContribution } from 'vs/workbench/parts/content/dynamicContent';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { DynamicContentInput } from 'vs/workbench/parts/content/dynamicContentInput';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { WalkThroughPart } from 'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThroughPart';
import { DynamicContentContentProvider, DynamicContentSnippetContentProvider } from "vs/workbench/parts/content/dynamicContentContentProvider";

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

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(DynamicContentContentProvider);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(DynamicContentSnippetContentProvider);

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(new EditorDescriptor(WalkThroughPart.ID,
		localize('walkThrough.editor.label', "Interactive Playground"),
		'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThroughPart',
		'WalkThroughPart'),
	[new SyncDescriptor(DynamicContentInput)]);