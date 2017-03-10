/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import paths = require('vs/base/common/paths');

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export interface IWorkspaceContextService {
	_serviceBrand: any;

	/**
	 * Provides access to the workspace object the platform is running with. This may be null if the workbench was opened
	 * without workspace (empty);
	 */
	getWorkspace(): IWorkspace;

	/**
	 * Returns iff the provided resource is inside the workspace or not.
	 */
	isInsideWorkspace(resource: URI): boolean;

	/**
	 * Given a resource inside the workspace, returns its relative path from the workspace root
	 * without leading or trailing slashes. Returns null if the file is not inside an opened
	 * workspace.
	 */
	toWorkspaceRelativePath: (resource: URI) => string;

	/**
	 * Given a workspace relative path, returns the resource with the absolute path.
	 */
	toResource: (workspaceRelativePath: string) => URI;

	/**
	 * Sets the workspace object. This may happen to e.g. handle cross-repo j2d.
	 */
	setWorkspace(workspace: IWorkspace): void;

	/**
	 * Attempts to get the workspace from the registry instead of using the default.
	 */
	tryGetWorkspaceFromRegistry(resource: URI): IWorkspace | undefined;

	onWorkspaceUpdated: Event<IWorkspace>;
}

export interface IWorkspace {

	/**
	 * the full uri of the workspace. this is a file:// URL to the location
	 * of the workspace on disk.
	 */
	resource: URI;

	/**
	 * the current revision state of the workspace.
	 */
	revState?: IWorkspaceRevState;

	/**
	 * the unique identifier of the workspace. if the workspace is deleted and recreated
	 * the identifier also changes. this makes the uid more unique compared to the id which
	 * is just derived from the workspace name.
	 */
	uid?: number;

	/**
	 * the name of the workspace
	 */
	name?: string;
}

export interface IWorkspaceRevState {
	commitID?: string;
	branch?: string;
	zapRef?: string;
}

declare class Map<K, V> {
	// delete(key: K): boolean;
	get(key: K): V;
	// has(key: K): boolean;
	set(key: K, value?: V): Map<K, V>;
}

export class WorkspaceContextService implements IWorkspaceContextService {

	public _serviceBrand: any;

	private workspace: IWorkspace;
	private workspaceEmitter: Emitter<IWorkspace>;
	private workspaceRegistry = new Map<string, IWorkspace>();

	constructor(workspace: IWorkspace) {
		this.workspace = workspace;
		this.workspaceEmitter = new Emitter<IWorkspace>();
		const workspaceRegistryKey = workspace.resource.with({ fragment: '', query: '' }).toString();
		this.workspaceRegistry.set(workspaceRegistryKey, workspace);
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return paths.isEqualOrParent(resource.fsPath, this.workspace.resource.fsPath);
		}

		return false;
	}

	public toWorkspaceRelativePath(resource: URI): string {
		if (this.isInsideWorkspace(resource)) {
			return paths.normalize(paths.relative(this.workspace.resource.fsPath, resource.fsPath));
		}

		return null;
	}

	public toResource(workspaceRelativePath: string): URI {
		if (typeof workspaceRelativePath === 'string' && this.workspace) {
			return URI.file(paths.join(this.workspace.resource.fsPath, workspaceRelativePath));
		}

		return null;
	}

	public tryGetWorkspaceFromRegistry(resource: URI): IWorkspace | undefined {
		return this.workspaceRegistry.get(resource.toString());
	}

	public setWorkspace(workspace: IWorkspace): void {
		this.workspace = workspace;
		const workspaceRegistryKey = workspace.resource.with({ fragment: '', query: '' }).toString();
		this.workspaceRegistry.set(workspaceRegistryKey, workspace);
		this.workspaceEmitter.fire(workspace);
	}

	public get onWorkspaceUpdated(): Event<IWorkspace> {
		return this.workspaceEmitter.event;
	}
}
