/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	export interface ResolveFileOptions {
		resolveTo?: Uri[];
		resolveSingleChildDescendants?: boolean;

		/**
		 * Return all descendants in a flat array in the FileStat's children property.
		 */
		resolveAllDescendants?: boolean;
	}

	export interface FileStat {
		resource: Uri;
		name: string;
		mtime?: number;
		etag?: string;
		isDirectory: boolean;
		hasChildren: boolean;
		children?: FileStat[];
		size?: number;
	}

	// todo@joh discover files etc
	export interface FileSystemProvider {
		// todo@joh -> added, deleted, renamed, changed
		onDidChange: Event<Uri>;

		/**
		 * Resolves a resource and returns stat info, or null if the resource doesn't
		 * exist.
		 */
		resolveFile(resource: Uri, options?: ResolveFileOptions): Thenable<FileStat | null>;

		resolveContents(resource: Uri): string | Thenable<string>;
		writeContents(resource: Uri, contents: string): void | Thenable<void>;
	}

	export namespace workspace {

		export function registerFileSystemProvider(scheme: string, provider: FileSystemProvider): Disposable;
	}

	export namespace window {

		export function sampleFunction(): Thenable<any>;
	}

	/**
	 * The contiguous set of modified lines in a diff.
	 */
	export interface LineChange {
		readonly originalStartLineNumber: number;
		readonly originalEndLineNumber: number;
		readonly modifiedStartLineNumber: number;
		readonly modifiedEndLineNumber: number;
	}

	export namespace commands {

		/**
		 * Registers a diff information command that can be invoked via a keyboard shortcut,
		 * a menu item, an action, or directly.
		 *
		 * Diff information commands are different from ordinary [commands](#commands.registerCommand) as
		 * they only execute when there is an active diff editor when the command is called, and the diff
		 * information has been computed. Also, the command handler of an editor command has access to
		 * the diff information.
		 *
		 * @param command A unique identifier for the command.
		 * @param callback A command handler function with access to the [diff information](#LineChange).
		 * @param thisArg The `this` context used when invoking the handler function.
		 * @return Disposable which unregisters this command on disposal.
		 */
		export function registerDiffInformationCommand(command: string, callback: (diff: LineChange[], ...args: any[]) => any, thisArg?: any): Disposable;
	}

	/**
	 * PATCH(sourcegraph): See ISCMRevision for canonical documentation for this type.
	 */
	export interface SCMRevision {
		readonly specifier?: string;
		readonly rawSpecifier?: string;
		readonly id?: string;
	}

	export interface CommandExecutor {
		executeCommand(args: string[]): Thenable<string>;
	}

	export interface SourceControl {
		/**
		 * The root (top-level) folder of the source control repository.
		 */
		readonly rootFolder?: Uri;

		/**
		 * The current SCM revision of the source control. Can be undefined if the source
		 * control has not yet determined its revision or does not implement revision
		 * determination. The extension should update this property's value whenever it
		 * detects the revision has changed.
		 */
		revision?: SCMRevision;

		/**
		 * Optional set revision command.
		 *
		 * This command will be invoked to set the revision of the source control. An
		 * argument of type SCMRevision (specifying the revision to set) is appended to
		 * the Command's arguments array.
		 */
		setRevisionCommand?: Command;

		commandExecutor?: CommandExecutor;
	}

	/**
	 * Options specified when creating a source control.
	 */
	export interface SourceControlOptions {
		/**
		 * A human-readable string for the source control. Eg: `Git`.
		 */
		label: string;

		/**
		 * The root (top-level) folder of the source control repository.
		 */
		rootFolder?: Uri;
	}

	export namespace scm {

		/**
		 * Creates a new [source control](#SourceControl) instance.
		 *
		 * @param id A unique `id` for the source control. Something short, eg: `git`.
		 * @param options Options for creating the source control.
		 * @return An instance of [source control](#SourceControl).
		 */
		export function createSourceControl(id: string, options: SourceControlOptions): SourceControl;

		/**
		 * Returns the source control for the given resource (by traversing up the directory
		 * hierarchy until the first folder is found that is associated with an source
		 * control). Can be undefined if the resource is not in any known source control.
		 */
		export function getSourceControlForResource(resource: Uri): SourceControl | undefined;
	}

	/**
	 * Namespace for handling credentials.
	 */
	export namespace credentials {

		/**
		 * Read a previously stored secret from the credential store.
		 *
		 * @param service The service of the credential.
		 * @param account The account of the credential.
		 * @return A promise for the secret of the credential.
		 */
		export function readSecret(service: string, account: string): Thenable<string | undefined>;

		/**
		 * Write a secret to the credential store.
		 *
		 * @param service The service of the credential.
		 * @param account The account of the credential.
		 * @param secret The secret of the credential to write to the credential store.
		 * @return A promise indicating completion of the operation.
		 */
		export function writeSecret(service: string, account: string, secret: string): Thenable<void>;

		/**
		 * Delete a previously stored secret from the credential store.
		 *
		 * @param service The service of the credential.
		 * @param account The account of the credential.
		 * @return A promise resolving to true if there was a secret for that service and account.
		 */
		export function deleteSecret(service: string, account: string): Thenable<boolean>;
	}

	export class Color {
		readonly red: number;
		readonly green: number;
		readonly blue: number;
		readonly alpha?: number;

		constructor(red: number, green: number, blue: number, alpha?: number);

		static fromHSLA(hue: number, saturation: number, luminosity: number, alpha?: number): Color;
		static fromHex(hex: string): Color;
	}

	export type ColorFormat = string | { opaque: string, transparent: string };

	// TODO@Michel
	export class ColorInfo {
		range: Range;

		color: Color;

		format: ColorFormat;

		availableFormats: ColorFormat[];

		constructor(range: Range, color: Color, format: ColorFormat, availableFormats: ColorFormat[]);
	}

	export interface DocumentColorProvider {
		provideDocumentColors(document: TextDocument, token: CancellationToken): ProviderResult<ColorInfo[]>;
	}

	export namespace languages {
		export function registerColorProvider(selector: DocumentSelector, provider: DocumentColorProvider): Disposable;
	}
}
