/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Command } from 'vs/editor/common/modes';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { localize } from 'vs/nls';

export interface IBaselineResourceProvider {
	getBaselineResource(resource: URI): TPromise<URI>;
}

export const ISCMService = createDecorator<ISCMService>('scm');
export const DefaultSCMProviderIdStorageKey = 'settings.workspace.scm.defaultProviderId';

export interface ISCMResourceDecorations {
	icon?: URI;
	iconDark?: URI;
	strikeThrough?: boolean;
	faded?: boolean;
}

export interface ISCMResource {
	readonly resourceGroup: ISCMResourceGroup;
	readonly sourceUri: URI;
	readonly command?: Command;
	readonly decorations: ISCMResourceDecorations;
}

export interface ISCMResourceGroup {
	readonly provider: ISCMProvider;
	readonly label: string;
	readonly id: string;
	readonly resources: ISCMResource[];
}

/**
* A reference to an SCM revision.
*/
export interface ISCMRevision {
	/**
	 * A string that specifies the current revision of an SCM provider's repository. If
	 * derived from a user-specified revision specifier, this value should be
	 * disambiguated (e.g., the Git rawSpecifier "foo" would be disambiguated to the
	 * specifier "refs/heads/foo" if it referred to a Git branch disambiguation occurred).
	 *
	 * To update this, call setRevision.
	 *
	 * Examples (for a Git repository):
	 *
	 * * If the Git repository is on branch foo: refs/heads/foo
	 * * If the Git repository is in detached HEAD state: the commit SHA
	 */
	readonly specifier?: string;

	/**
	 * The original raw input that the disambiguated specifier field's value was derived
	 * from. If the specifier was obtained directly from a repository (such as by reading
	 * the Git HEAD symbolic ref) and not from user input (such as from the URL), then
	 * this field is not yet. This field should only be used to avoid over-resolving user
	 * input (e.g., a URL with "foo" in it should have that raw specifier preserved and
	 * not be auto-updated to contain "refs/heads/foo"); its value should not be used as
	 * input to any SCM operations.
	 */
	readonly rawSpecifier?: string;

	/**
	 * This is an immutable revision ID that was the result of resolving the specifier at
	 * a certain point in time. If set, all resources (files, explorer trees, etc.) should
	 * be resolved using this revision instead of the (possibly mutable) specifier. This
	 * ensures consistency even if the specifier's target changes during an operation.
	 *
	 * To update this, call setRevision. Not all SCM providers provide this field.
	 *
	 * Examples (for a Git repository):
	 *
	 * * If the Git repository is on branch foo, which has a commit SHA of abcd: abcd
	 * * If the Git repository is in detached HEAD state to a commit with SHA abcd: abcd
	 */
	readonly id?: string;
}

export interface ISCMProvider extends IDisposable {
	readonly label: string;
	readonly id: string;
	readonly rootFolder: URI;
	readonly resources: ISCMResourceGroup[];
	readonly onDidChange: Event<void>;
	readonly count?: number;
	readonly commitTemplate?: string;
	readonly revision?: ISCMRevision;
	readonly onDidChangeCommitTemplate?: Event<string>;
	readonly acceptInputCommand?: Command;
	readonly statusBarCommands?: Command[];
	readonly setRevisionCommand?: Command;

	getOriginalResource(uri: URI): TPromise<URI>;

	/**
	 * Executes a raw SCM command.
	 *
	 * For example:
	 * executeCommand(['--version']) would execute `git --version` for a git scm provider.
	 */
	executeCommand(args: string[]): TPromise<string>;
}

export interface ISCMInput {
	value: string;
	readonly onDidChange: Event<string>;
}

export interface ISCMService {

	readonly _serviceBrand: any;
	readonly onDidChangeProvider: Event<ISCMProvider>;
	readonly onDidRegisterProvider: Event<ISCMProvider>;
	readonly providers: ISCMProvider[];
	readonly input: ISCMInput;
	activeProvider: ISCMProvider | undefined;

	registerSCMProvider(provider: ISCMProvider): IDisposable;

	// NOTE(sqs): Re: getProviderForResource API: I don't know the vscode team will
	// implement multi-root support for SCM providers, but this is my best attempt at the
	// simplest API and one that we can easily fold into the upstream API when it's ready.
	//
	// Monitor https://github.com/Microsoft/vscode/issues/28344 and
	// https://github.com/Microsoft/vscode/compare/master...joaomoreno:scm-multiroot for
	// upstream updates.

	/**
	 * Returns the SCM repository provider for the given resource (by traversing up the
	 * directory hierarchy until we reach an SCM provider's root folder). Can be undefined
	 * if the resource is not in a known SCM repository.
	 *
	 * An SCM provider's root folder is set in the call to registerSCMProvider (in
	 * ISCMProvider). In the vscode extension API, it's set in the
	 * vscode.scm.createSourceControl options arg. It can't be changed after
	 * creation/registration.
	 */
	getProviderForResource(resource: URI): ISCMProvider | undefined;
}

/**
 * Listen for when a different SCM provider becomes active and when the active SCM
 * provider's state changes. This is a helper that wraps ISCMService's onDidChangeProvider
 * and the active ISCMProvider's onDidChange.
 */
export function onDidChangeOrUpdateSCMProvider(service: ISCMService, listener: (provider: ISCMProvider) => void): IDisposable {
	let activeProviderListener: IDisposable;
	const onDidChangeProvider = (provider: ISCMProvider, updateImmediately: boolean): void => {
		if (activeProviderListener) {
			activeProviderListener.dispose();
		}
		activeProviderListener = provider.onDidChange(() => listener(provider));
		if (updateImmediately) {
			listener(provider);
		}
	};

	const serviceListener = service.onDidChangeProvider(provider => onDidChangeProvider(provider, true));
	if (service.activeProvider) {
		onDidChangeProvider(service.activeProvider, false);
	}

	return {
		dispose: (): void => {
			if (activeProviderListener) {
				activeProviderListener.dispose();
			}
			serviceListener.dispose();
		},
	};
}

/**
 * Sets the revision of the specified SCM provider (using its setRevisionCommand). If no
 * revision is provided, the SCM provider will present the user with a quickopen to select
 * a revision.
 */
export function setSCMProviderRevision(
	commandService: ICommandService,
	provider: ISCMProvider,
	revision?: ISCMRevision,
): TPromise<void> {
	if (!provider.setRevisionCommand) {
		return TPromise.wrapError(new Error(localize('noSetRevisionCommandForFolderSCMProvider', "The SCM provider does not support changing the revision.")));
	}

	const id = provider.setRevisionCommand.id;
	let args = provider.setRevisionCommand.arguments || [];
	if (revision) {
		args = args.concat(revision);
	}

	return commandService.executeCommand(id, ...args);
}