/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const INavService = createDecorator<INavService>('navService');

export interface INavService {

	_serviceBrand: any;

	/**
	 * An event that is fired after the current location changes. The payload
	 * is the URI of the new location.
	 */
	onDidNavigate: Event<URI | undefined>;

	/**
	 * Handles URIs referring to remote resources, of the form:
	 *
	 *   code:open?
	 *     repo=encodeURIComponent(cloneURL)&
	 *     vcs=git&
	 *     revision=encodeURIComponent(revision)&
	 *     path=encodeURIComponent(path)&
	 *     selection=1:2-3:4&selection=5:6-7-8&
	 *     thread=123
	 *
	 * The application may be registered as an OS-level protocol handler for the
	 * URI protocol, in which case this method is called for handled URIs. The actual
	 * protocol depends on OS-specific configuration and/or the urlProtocol field in
	 * product.json.
	 */
	handle(location: URI): TPromise<void>;

	/**
	 * Returns the current location, which is URI that represents the current application
	 * state (typically the active editor's document's repository and file path).
	 */
	getLocation(): URI | undefined;

	/**
	 * Returns a web URL that either opens the application to the current location (from
	 * getLocation) or guides the user through installing the application if it isn't yet
	 * installed.
	 */
	getShareableLocation(): string;
}
