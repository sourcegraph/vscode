/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { once, Emitter } from 'vs/base/common/event';
import { debounce } from 'vs/base/common/decorators';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { MainContext, MainThreadReviewShape, MainThreadSCMShape, SCMRawResourceSplices, IMainContext, SCMProviderFeatures, SCMGroupFeatures } from './extHost.protocol';
import { ExtHostSourceControlResourceGroup } from 'vs/workbench/api/node/extHostSCM';
import * as vscode from 'vscode';

type ProviderHandle = number;
type GroupHandle = number;
type ResourceStateHandle = number;

class MainThreadSCMShapeShim implements MainThreadSCMShape {

	constructor(private proxy: MainThreadReviewShape) {

	}

	$registerSourceControl(handle: number, id: string, label: string, rootUri: string | undefined): void {
		this.proxy.$registerReviewControl(handle, id, label);
	}

	$updateSourceControl(handle: number, features: SCMProviderFeatures): void {
		this.proxy.$updateReviewControl(handle, features);
	}

	$unregisterSourceControl(handle: number): void {
		this.proxy.$unregisterReviewControl(handle);
	}

	$registerGroup(reviewControlHandle: number, handle: number, id: string, label: string): void {
		this.proxy.$registerGroup(reviewControlHandle, handle, id, label);
	}

	$updateGroup(reviewControlHandle: number, handle: number, features: SCMGroupFeatures): void {
		this.proxy.$updateGroup(reviewControlHandle, handle, features);
	}

	$updateGroupLabel(reviewControlHandle: number, handle: number, label: string): void {
		this.proxy.$updateGroupLabel(reviewControlHandle, handle, label);
	}

	$unregisterGroup(reviewControlHandle: number, handle: number): void {
		this.proxy.$unregisterGroup(reviewControlHandle, handle);
	}

	$spliceResourceStates(reviewControlHandle: number, splices: SCMRawResourceSplices[]): void {
		this.proxy.$spliceResourceStates(reviewControlHandle, splices);
	}

	$setInputBoxValue(reviewControlHandle: number, value: string): void {
		throw new Error('not implemented');
	}

	dispose(): void {
		this.proxy.dispose();
	}
}

class ExtHostReviewControl implements vscode.ReviewControl {

	private static _handlePool: number = 0;
	private _groups = new Map<GroupHandle, ExtHostSourceControlResourceGroup>();

	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	private _active = false;
	private didChangeActive = new Emitter<void>();
	public readonly onDidChangeActive = this.didChangeActive.event;
	get active(): boolean { return this._active; }
	set active(active: boolean) {
		if (this._active !== active) {
			this._active = active;
			this.didChangeActive.fire();
		}
	}

	private _reviewCommands: vscode.Command[] | undefined = undefined;

	get reviewCommands(): vscode.Command[] | undefined {
		return this._reviewCommands;
	}

	set reviewCommands(statusBarCommands: vscode.Command[] | undefined) {
		this._reviewCommands = statusBarCommands;

		const internal = (statusBarCommands || []).map(c => this._commands.converter.toInternal(c));
		this._proxy.$updateReviewControl(this.handle, { reviewCommands: internal });
	}

	private _remoteResources: vscode.Uri[] | undefined = undefined;

	get remoteResources(): vscode.Uri[] | undefined {
		return this._remoteResources;
	}

	set remoteResources(resources: vscode.Uri[] | undefined) {
		this._remoteResources = resources;

		this._proxy.$updateReviewControl(this.handle, { remoteResources: resources as URI[] });
	}

	private handle: number = ExtHostReviewControl._handlePool++;

	constructor(
		private _proxy: MainThreadReviewShape,
		private _commands: ExtHostCommands,
		private _id: string,
		private _label: string,
	) {
		this._proxy.$registerReviewControl(this.handle, _id, _label);
	}

	private updatedResourceGroups = new Set<ExtHostSourceControlResourceGroup>();

	createResourceGroup(id: string, label: string): ExtHostSourceControlResourceGroup {
		// For now, we avoid creating our own copy of ExtHostSourceControlResourceGroup (i.e. ExtHostReviewControlResourceGroup)
		// because it has some non-trivial logic and we don't need to copy it yet.
		// Our use case is exacly the same as VS Code here so we just create a shim wrapper an use what they have already implemented.
		const shim = new MainThreadSCMShapeShim(this._proxy);
		const group = new ExtHostSourceControlResourceGroup(shim, this._commands, this.handle, id, label);

		const updateListener = group.onDidUpdateResourceStates(() => {
			this.updatedResourceGroups.add(group);
			this.eventuallyUpdateResourceStates();
		});

		once(group.onDidDispose)(() => {
			this.updatedResourceGroups.delete(group);
			updateListener.dispose();
			this._groups.delete(group.handle);
		});

		this._groups.set(group.handle, group);
		return group;
	}

	@debounce(100)
	eventuallyUpdateResourceStates(): void {
		const splices: SCMRawResourceSplices[] = [];

		this.updatedResourceGroups.forEach(group => {
			const snapshot = group._takeResourceStateSnapshot();

			if (snapshot.length === 0) {
				return;
			}

			splices.push([group.handle, snapshot]);
		});

		if (splices.length > 0) {
			this._proxy.$spliceResourceStates(this.handle, splices);
		}

		this.updatedResourceGroups.clear();
	}

	getResourceGroup(handle: GroupHandle): ExtHostSourceControlResourceGroup | undefined {
		return this._groups.get(handle);
	}

	dispose(): void {
		this._groups.forEach(group => group.dispose());
		this._proxy.$unregisterReviewControl(this.handle);
	}
}

type SourceControlRoot = { handle: number, rootUri: vscode.Uri };

export class ExtHostReview {

	private static _handlePool: number = 0;

	private _proxy: MainThreadReviewShape;
	private reviewControls = new Map<ProviderHandle, ExtHostReviewControl>();
	private reviewControlsByExtension = new Map<string, ExtHostReviewControl[]>();

	constructor(
		mainContext: IMainContext,
		private _commands: ExtHostCommands
	) {
		this._proxy = mainContext.get(MainContext.MainThreadReview);

		_commands.registerArgumentProcessor({
			processArgument: arg => {
				if (arg && arg.$mid === 1003) {
					const reviewControl = this.reviewControls.get(arg.reviewControlHandle);

					if (!reviewControl) {
						return arg;
					}

					const group = reviewControl.getResourceGroup(arg.groupHandle);

					if (!group) {
						return arg;
					}

					return group.getResourceState(arg.handle);
				} else if (arg && arg.$mid === 1004) {
					const reviewControl = this.reviewControls.get(arg.reviewControlHandle);

					if (!reviewControl) {
						return arg;
					}

					return reviewControl.getResourceGroup(arg.groupHandle);
				} else if (arg && arg.$mid === 1005) {
					const reviewControl = this.reviewControls.get(arg.handle);

					if (!reviewControl) {
						return arg;
					}

					return reviewControl;
				}

				return arg;
			}
		});
	}

	createReviewControl(extension: IExtensionDescription, id: string, label: string): vscode.ReviewControl {
		const handle = ExtHostReview._handlePool++;
		const reviewControl = new ExtHostReviewControl(this._proxy, this._commands, id, label);
		this.reviewControls.set(handle, reviewControl);

		const reviewControls = this.reviewControlsByExtension.get(extension.id) || [];
		reviewControls.push(reviewControl);
		this.reviewControlsByExtension.set(extension.id, reviewControls);

		return reviewControl;
	}

	async $executeResourceCommand(reviewControlHandle: number, groupHandle: number, handle: number): TPromise<void> {
		const reviewControl = this.reviewControls.get(reviewControlHandle);

		if (!reviewControl) {
			return;
		}

		const group = reviewControl.getResourceGroup(groupHandle);

		if (!group) {
			return;
		}

		group.$executeResourceCommand(handle);
	}

	public $setActive(reviewControlHandle: number, active: boolean): void {
		const reviewControl = this.reviewControls.get(reviewControlHandle);
		if (!reviewControl) {
			return;
		}
		reviewControl.active = active;
	}
}
