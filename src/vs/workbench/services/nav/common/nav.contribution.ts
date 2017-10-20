/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INavService } from 'vs/workbench/services/nav/common/nav';
import URI from 'vs/base/common/uri';
import { onUnexpectedError } from 'vs/base/common/errors';

CommandsRegistry.registerCommand('workbench.nav.open', (accessor: ServicesAccessor, ...args: any[]) => {
	const arg = args[0];
	let location: URI;
	if (arg instanceof URI) {
		location = arg;
	} else if (typeof arg === 'string') {
		location = URI.parse(arg);
	} else {
		throw new Error('Expected URI or string for workbench.nav.open');
	}

	const navService = accessor.get(INavService);
	navService.handle(location).done(undefined, onUnexpectedError);
});