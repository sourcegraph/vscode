/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import paths = require('vs/base/common/paths');
import { isEqualOrParent } from 'vs/platform/files/common/files';
import { isLinux } from 'vs/base/common/platform';

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export interface IWorkspaceContextService {
	_serviceBrand: any;

	/**
	 * Returns iff the application was opened with a workspace or not.
	 */
	hasWorkspace(): boolean;

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
	toWorkspaceRelativePath: (resource: URI, toOSPath?: boolean) => string;

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

	/**
	 * Registers (but doesn't change) a workspace (unless overwrite is 'true').
	 */
	registerWorkspace(workspace: IWorkspace, overwrite?: boolean): void;

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
	zapRev?: string; // the original (possibly fuzzy) Zap rev
	zapRef?: string; // the full (non-fuzzy) Zap ref name
}

export class WorkspaceContextService implements IWorkspaceContextService {

	public _serviceBrand: any;

	private workspace: IWorkspace;
	private workspaceEmitter: Emitter<IWorkspace>;
	private workspaceRegistry: { [key: string]: IWorkspace } = {};

	constructor(workspace: IWorkspace) {
		this.workspace = workspace;
		this.workspaceEmitter = new Emitter<IWorkspace>();
		if (workspace && workspace.resource) {
			const workspaceRegistryKey = workspace.resource.toString();
			this.workspaceRegistry[workspaceRegistryKey] = workspace;
		}
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public hasWorkspace(): boolean {
		return !!this.workspace;
	}

	public isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return isEqualOrParent(resource.fsPath, this.workspace.resource.fsPath, !isLinux /* ignorecase */);
		}

		return false;
	}

	public toWorkspaceRelativePath(resource: URI, toOSPath?: boolean): string {
		if (this.isInsideWorkspace(resource)) {
			return paths.normalize(paths.relative(this.workspace.resource.fsPath, resource.fsPath), toOSPath);
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
		const resourceString = resource.toString();
		for (const registryKey of Object.keys(this.workspaceRegistry)) {
			// The resource must be identical to the workspace or a subpath of workspace.
			// Select the closest match, e.g. for `file://github.com/gorilla/muxy/file`
			// match `file://github.com/gorilla/muxy` not `github.com/gorilla/mux`.
			if (resourceString.indexOf(registryKey) !== -1) {
				if (resourceString === registryKey || resourceString.substr(registryKey.length)[0] === '/') {
					return this.workspaceRegistry[registryKey];
				}
			}
		}
		return undefined;
	}

	public setWorkspace(workspace: IWorkspace): void {
		this.workspace = workspace;
		const workspaceRegistryKey = workspace.resource.toString();
		this.workspaceRegistry[workspaceRegistryKey] = workspace;
		this.workspaceEmitter.fire(workspace);
	}

	public registerWorkspace(workspace: IWorkspace, overwrite?: boolean): void {
		const workspaceRegistryKey = workspace.resource.toString();
		if (this.workspaceRegistry[workspaceRegistryKey] && !overwrite) {
			return;
		}
		this.workspaceRegistry[workspaceRegistryKey] = workspace;
	}

	public get onWorkspaceUpdated(): Event<IWorkspace> {
		return this.workspaceEmitter.event;
	}
}
