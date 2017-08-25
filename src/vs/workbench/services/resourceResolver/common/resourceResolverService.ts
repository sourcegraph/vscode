/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { IResourceResolutionProvider, IResourceResolverService } from 'vs/platform/resourceResolver/common/resourceResolver';

export class ResourceResolverService implements IResourceResolverService {

	_serviceBrand: any;

	private providers = new Map<string, IResourceResolutionProvider>();

	public registerResourceResolutionProvider(scheme: string, provider: IResourceResolutionProvider): IDisposable {
		if (this.providers.has(scheme)) {
			throw new Error(`provider already exists for scheme '${scheme}'`);
		}

		this.providers.set(scheme, provider);

		return toDisposable(() => {
			if (this.providers.get(scheme) === provider) {
				this.providers.delete(scheme);
			}
		});
	}

	public resolveResource(resource: URI, recursionLimit: number = 5): TPromise<URI> {
		if (recursionLimit === 0) {
			throw new Error('recursion limit reached');
		}

		const provider = this.providers.get(resource.scheme);
		if (provider) {
			return provider.resolveResource(resource).then(resolvedResource => {
				if (resource.toString() !== resolvedResource.toString()) {
					return this.resolveResource(resolvedResource, recursionLimit--);
				}
				return resolvedResource;
			});
		}

		return TPromise.as(resource);
	}
}
