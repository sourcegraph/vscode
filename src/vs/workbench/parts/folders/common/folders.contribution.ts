/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';

// Configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	'id': 'folders',
	'order': 12,
	'title': nls.localize('foldersConfigurationTitle', "Folders"),
	'type': 'object',
	'properties': {
		'folders.path': {
			'type': 'string',
			'default': '${homePath}${separator}src${separator}${folderRelativePath}',
			'description': nls.localize({ comment: ['This is the description for a setting. Values surrounded by curly braces are not to be translated.'], key: 'path' },
				`Controls the path used for temporary workspace folders. Variables are substituted based on the context:
\${homePath}: the current user's home directory (e.g. /home/myUser or /Users/myUser)
\${folderRelativePath}: e.g. github.com/myUser/myFolder (derived from the clone URL for a repository)
\${separator}: the path separator for the OS (slash on macOS and Linux, backslash on Windows)`)
		},
	}
});