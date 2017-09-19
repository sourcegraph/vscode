/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { WebBrowserEditor } from 'vs/workbench/parts/webbrowser/electron-browser/webBrowserEditor';
import { BrowserOpenLocationAction } from 'vs/workbench/parts/webbrowser/electron-browser/webBrowserActions';
import { WebBrowserInput } from 'vs/workbench/parts/webbrowser/common/webBrowser';

// Editor
const editorDescriptor = new EditorDescriptor(
	WebBrowserEditor.ID,
	nls.localize('webbrowser', "Web Browser"),
	'vs/workbench/parts/webbrowser/electron-browser/webBrowserEditor',
	'WebBrowserEditor'
);

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(editorDescriptor, [new SyncDescriptor(WebBrowserInput)]);

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'webbrowser',
	'order': 13,
	'title': nls.localize('webbrowserConfigurationTitle', "Web Browser"),
	'type': 'object',
	'properties': {
		'webbrowser.kind': {
			'type': 'string',
			'enum': [
				'integrated',
				'external',
			],
			'default': 'integrated',
			'description': nls.localize('kind', "Customizes what kind of browser to launch.")
		},
	}
});

// Actions
const actionRegistry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

actionRegistry.registerWorkbenchAction(new SyncActionDescriptor(BrowserOpenLocationAction, BrowserOpenLocationAction.ID, BrowserOpenLocationAction.LABEL), 'Web Browser: Open URL', nls.localize('viewCategory', "View"));
