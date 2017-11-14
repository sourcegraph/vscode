/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Emitter } from 'vs/base/common/event';
import { IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ExtHostCommands } from 'vs/workbench/api/node/extHostCommands';
import { MainContext, MainThreadReviewShape, IMainContext } from './extHost.protocol';
import { ExtHostSourceControlResourceGroup } from 'vs/workbench/api/node/extHostSCM';
import * as vscode from 'vscode';

type ProviderHandle = number;
type GroupHandle = number;

class ExtHostReviewControl implements vscode.ReviewControl {

	private static _handlePool: number = 0;
	private _groups = new Map<GroupHandle, ExtHostSourceControlResourceGroup>();

	get id(): string {
		return this._id;
	}

	get label(): string {
		return this._label;
	}

	get rootUri(): vscode.Uri {
		return this._rootUri;
	}

	get description(): string {
		return this._description;
	}

	get icon(): string {
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

	private _date?: number;
	get date(): number | undefined { return this._date; }
	set date(date: number | undefined) {
		if (this._date !== date) {
			this._date = date;
			this._proxy.$updateReviewControl(this.handle, { date });
		}
	}

	private _author?: string;
	get author(): string | undefined { return this._author; }
	set author(author: string | undefined) {
		if (this._author !== author) {
			this._author = author;
			this._proxy.$updateReviewControl(this.handle, { author });
		}
	}

	private _reviewCommand: vscode.Command | undefined = undefined;

	get reviewCommand(): vscode.Command | undefined {
		return this._reviewCommand;
	}

	set reviewCommand(reviewCommand: vscode.Command | undefined) {
		this._reviewCommand = reviewCommand;

		const internal = this._commands.converter.toInternal(reviewCommand);
		this._proxy.$updateReviewControl(this.handle, { reviewCommand: internal });
	}

	private handle: number = ExtHostReviewControl._handlePool++;

	constructor(
		private _proxy: MainThreadReviewShape,
		private _commands: ExtHostCommands,
		private _id: string,
		private _label: string,
		private _description: string,
		private _icon: string,
		private _rootUri: vscode.Uri,
	) {
		this._proxy.$registerReviewControl(this.handle, _id, _label, _description, this._icon, _rootUri.toString());
	}

	dispose(): void {
		this._groups.forEach(group => group.dispose());
		this._proxy.$unregisterReviewControl(this.handle);
	}
}

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
				if (arg && arg.$mid === 1005) {
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

	createReviewControl(extension: IExtensionDescription, id: string, label: string, description: string, icon: string, rootUri: vscode.Uri): vscode.ReviewControl {
		const handle = ExtHostReview._handlePool++;
		const reviewControl = new ExtHostReviewControl(this._proxy, this._commands, id, label, description, icon, rootUri);
		this.reviewControls.set(handle, reviewControl);

		const reviewControls = this.reviewControlsByExtension.get(extension.id) || [];
		reviewControls.push(reviewControl);
		this.reviewControlsByExtension.set(extension.id, reviewControls);

		return reviewControl;
	}
}
