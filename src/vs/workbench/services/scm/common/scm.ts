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

export interface ISCMResourceDecorations {
	icon?: URI;
	iconDark?: URI;
	tooltip?: string;
	strikeThrough?: boolean;
	faded?: boolean;
}

export interface ISCMResourceSplice {
	start: number;
	deleteCount: number;
	resources: ISCMResource[];
}

export interface ISCMResourceCollection {
	readonly resources: ISCMResource[];
	readonly onDidSplice: Event<ISCMResourceSplice>;
}

export interface ISCMResource {
	readonly resourceGroup: ISCMResourceGroup;
	readonly sourceUri: URI;
	readonly decorations: ISCMResourceDecorations;
	open(): TPromise<void>;
}

export interface ISCMResourceGroup {
	readonly provider: ISCMProvider;
	readonly label: string;
	readonly id: string;
	readonly resourceCollection: ISCMResourceCollection;
	readonly hideWhenEmpty: boolean;
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

/**
 * Options for the command to execute.
 */
export interface ICommandOptions {
	stdin?: string;
}

export interface ISCMProvider extends IDisposable {
	readonly label: string;
	readonly id: string;
	readonly contextValue: string;

	readonly rootFolder: URI;
	readonly resources: ISCMResourceGroup[];
	readonly onDidChangeResources: Event<void>;

	readonly count?: number;
	readonly commitTemplate?: string;
	readonly revision?: ISCMRevision;
	readonly onDidChangeCommitTemplate?: Event<string>;
	readonly acceptInputCommand?: Command;
	readonly acceptSpecifierCommand?: Command;
	readonly statusBarCommands?: Command[];
	readonly setRevisionCommand?: Command;
	readonly remoteResources?: URI[];
	readonly onDidChange: Event<void>;

	getOriginalResource(uri: URI): TPromise<URI>;

	/**
	 * Executes a raw SCM command.
	 *
	 * For example:
	 * executeCommand(['--version']) would execute `git --version` for a git scm provider.
	 */
	executeCommand(args: string[], options?: ICommandOptions): TPromise<string>;
}

export interface ISCMInput {
	value: string;
	readonly onDidChange: Event<string>;
}

export interface ISCMRepository extends IDisposable {
	readonly onDidFocus: Event<void>;
	readonly provider: ISCMProvider;
	readonly input: ISCMInput;
	readonly specifier: ISCMInput;
	focus(): void;
}

export interface ISCMService {

	readonly _serviceBrand: any;
	readonly onDidAddRepository: Event<ISCMRepository>;
	readonly onDidRemoveRepository: Event<ISCMRepository>;
	readonly onDidChangeRepository: Event<ISCMRepository>;

	readonly repositories: ISCMRepository[];

	registerSCMProvider(provider: ISCMProvider): ISCMRepository;

	/**
	 * Returns the SCM repository for the given resource (by traversing up the
	 * directory hierarchy until we reach an SCM repository's root folder). Can be undefined
	 * if the resource is not in a known SCM repository.
	 *
	 * An SCM provider's root folder is set in the call to registerSCMProvider (in
	 * ISCMProvider). In the vscode extension API, it's set in the
	 * vscode.scm.createSourceControl options arg. It can't be changed after
	 * creation/registration.
	 */
	getRepositoryForResource(resource: URI): ISCMRepository | undefined;
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