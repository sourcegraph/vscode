/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { first } from 'vs/base/common/async';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IResourceResolutionProvider, IResourceResolverService } from 'vs/platform/resourceResolver/common/resourceResolver';

export class ResourceResolverService implements IResourceResolverService, IDisposable {

	_serviceBrand: any;

	private providers: { [scheme: string]: IResourceResolutionProvider[] } = Object.create(null);

	constructor() { }

	public registerResourceResolutionProvider(scheme: string, provider: IResourceResolutionProvider): IDisposable {
		const registry = this.providers;
		const providers = registry[scheme] || (registry[scheme] = []);

		providers.unshift(provider);

		return toDisposable(() => {
			const array = registry[scheme];

			if (!array) {
				return;
			}

			const index = array.indexOf(provider);

			if (index === -1) {
				return;
			}

			array.splice(index, 1);

			if (array.length === 0) {
				delete registry[scheme];
			}
		});
	}

	public resolveResource(resource: URI): TPromise<URI> {
		const providers = this.providers[resource.scheme] || [];
		const resolvedResources = providers.map(p => () => p.resolveResource(resource));

		if (resolvedResources.length === 0) {
			return TPromise.as(resource);
		}

		return first(resolvedResources).then(resolvedResource => {
			if (!resolvedResource) {
				return TPromise.wrapError<URI>(new Error(`resource resolution failed (for scheme '${resource.scheme}')`));
			}

			return resolvedResource;
		});
	}

	public dispose(): void { }
}
