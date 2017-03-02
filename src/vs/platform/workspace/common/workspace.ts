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
	revState?: {
		commitID?: string;
		branch?: string;
		zapRef?: string;
	};

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

export class WorkspaceContextService implements IWorkspaceContextService {

	public _serviceBrand: any;

	private workspace: IWorkspace;
	private workspaceEmitter: Emitter<IWorkspace>;

	constructor(workspace: IWorkspace) {
		this.workspace = workspace;
		this.workspaceEmitter = new Emitter<IWorkspace>();
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

	public setWorkspace(workspace: IWorkspace): void {
		this.workspace = workspace;
		this.workspaceEmitter.fire(workspace);
	}

	public get onWorkspaceUpdated(): Event<IWorkspace> {
		return this.workspaceEmitter.event;
	}
}