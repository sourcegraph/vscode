/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

/**
 * Provides a method to resolve resources for a particular scheme (e.g. 'git+exp').
 */
export interface IResourceResolutionProvider {
	/**
	 * Resolves a (possibly abstract) resource URI to a concrete resource URI (typically file:). If a
	 * provider is unable to resolve the resource, it can pass through the original input URI (which
	 * will most likely result in an error from workbench because workbench will be unable to handle
	 * the custom scheme URI) or throw an error.
	 *
	 * For example, a resource resolution provider might be registered that resolves URIs with scheme 'git'.
	 * The user could then open a URI such as git://example.com/my/repo.git. The provider decides how to
	 * resolve this URI. One possible provider implementation could clone that repository to a temporary
	 * directory and return the directory's file URI, to allow the user to open and edit a repository's
	 * files without needing to manually clone it.
	 */
	resolveResource(resource: URI): TPromise<URI>;
}

export const IResourceResolverService = createDecorator<IResourceResolverService>('resourceResolverService');

/**
 * Manages a registry of IResourceResolutionProviders.
 */
export interface IResourceResolverService {
	_serviceBrand: any;

	/**
	 * Registers a IResourceResolutionProvider for the given scheme (e.g. 'git+ssh').
	 */
	registerResourceResolutionProvider(scheme: string, provider: IResourceResolutionProvider): IDisposable;

	/**
	 * If a resource resolver (resource resolution provider) is registered for the resource's scheme,
	 * it is used to resolve the resource. Resources with no registered providers for their scheme
	 * resolve to themselves.
	 */
	resolveResource(resource: URI): TPromise<URI>;
}

export const NullResourceResolverService: IResourceResolverService = {
	_serviceBrand: undefined,
	registerResourceResolutionProvider(scheme: string, provider: IResourceResolutionProvider): IDisposable {
		throw new Error('not implemented');
	},
	resolveResource(resource: URI): TPromise<URI> {
		return TPromise.as(resource);
	},
};