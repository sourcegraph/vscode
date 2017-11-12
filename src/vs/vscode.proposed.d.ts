/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is the place for API experiments and proposal.

declare module 'vscode' {

	// export enum FileErrorCodes {
	// 	/**
	// 	 * Not owner.
	// 	 */
	// 	EPERM = 1,
	// 	/**
	// 	 * No such file or directory.
	// 	 */
	// 	ENOENT = 2,
	// 	/**
	// 	 * I/O error.
	// 	 */
	// 	EIO = 5,
	// 	/**
	// 	 * Permission denied.
	// 	 */
	// 	EACCES = 13,
	// 	/**
	// 	 * File exists.
	// 	 */
	// 	EEXIST = 17,
	// 	/**
	// 	 * Not a directory.
	// 	 */
	// 	ENOTDIR = 20,
	// 	/**
	// 	 * Is a directory.
	// 	 */
	// 	EISDIR = 21,
	// 	/**
	// 	 *  File too large.
	// 	 */
	// 	EFBIG = 27,
	// 	/**
	// 	 * No space left on device.
	// 	 */
	// 	ENOSPC = 28,
	// 	/**
	// 	 * Directory is not empty.
	// 	 */
	// 	ENOTEMPTY = 66,
	// 	/**
	// 	 * Invalid file handle.
	// 	 */
	// 	ESTALE = 70,
	// 	/**
	// 	 * Illegal NFS file handle.
	// 	 */
	// 	EBADHANDLE = 10001,
	// }

	export enum FileChangeType {
		Updated = 0,
		Added = 1,
		Deleted = 2
	}

	export interface FileChange {
		type: FileChangeType;
		resource: Uri;
	}

	export enum FileType {
		File = 0,
		Dir = 1,
		Symlink = 2
	}

	export interface FileStat {
		id: number | string;
		mtime: number;
		// atime: number;
		size: number;
		type: FileType;
	}

	// todo@joh discover files etc
	export interface FileSystemProvider {

		onDidChange?: Event<FileChange[]>;

		root: Uri;

		// more...
		//
		utimes(resource: Uri, mtime: number, atime: number): Thenable<FileStat>;

		stat(resource: Uri): Thenable<FileStat>;

		read(resource: Uri, offset: number, length: number, progress: Progress<Uint8Array>): Thenable<number>;

		// todo@remote
		// offset - byte offset to start
		// count - number of bytes to write
		// Thenable<number> - number of bytes actually written
		write(resource: Uri, content: Uint8Array): Thenable<void>;

		// todo@remote
		// Thenable<FileStat>
		move(resource: Uri, target: Uri): Thenable<FileStat>;

		// todo@remote
		// helps with performance bigly
		// copy?(from: Uri, to: Uri): Thenable<void>;

		// todo@remote
		// Thenable<FileStat>
		mkdir(resource: Uri): Thenable<FileStat>;

		readdir(resource: Uri): Thenable<[Uri, FileStat][]>;

		// todo@remote
		// ? merge both
		// ? recursive del
		rmdir(resource: Uri): Thenable<void>;
		unlink(resource: Uri): Thenable<void>;

		// todo@remote
		// create(resource: Uri): Thenable<FileStat>;

		// find files by names
		findFiles?(query: string, progress: Progress<Uri>, token: CancellationToken): Thenable<void>;
	}

	/**
	 * Provides a method to resolve resources for a particular scheme (e.g. 'git+https').
	 */
	export interface ResourceResolutionProvider {
		/**
		 * Resolves a (possibly abstract) resource URI to a concrete resource URI (typically file:).
		 *
		 * For example, a resource resolution provider might be registered that resolves URIs with scheme 'git'.
		 * The user could then open a URI such as git://example.com/my/repo.git. The provider decides how to
		 * resolve this URI. One possible provider implementation could clone that repository to a temporary
		 * directory and return the directory's file URI, to allow the user to open and edit a repository's
		 * files without needing to manually clone it.
		 */
		resolveResource(resource: Uri): Thenable<Uri>;
	}

	/**
	 * A folder from the folder catalog service, typically representing a repository on
	 * a remote code host.
	 */
	export interface CatalogFolder {
		/**
		 * The unique identifier for this folder.
		 *
		 * For folders on the local file system, this is the folder's file: URI.
		 *
		 * For repositories on a remote code host, this should be a URI that is a child
		 * of the registered provider's root URI. For example, a GitHub folder catalog
		 * provider's root URI might be github://github.com and a repository's resource URI
		 * would then be of the form github://github.com/repository/foo/bar
		 */
		resource: Uri;

		/**
		 * The path of the folder (typically excluding common ancestor directories), for display
		 * purposes only. For example, a GitHub repository at https://github.com/foo/bar might
		 * have path "foo/bar".
		 */
		displayPath?: string;

		/**
		 * The name of the folder (typically the last component of its path), for display purposes
		 * only.
		 */
		displayName?: string;

		/**
		 * The URL to an icon image for this folder.
		 */
		iconUrl?: string;

		/**
		 * The class of icon to use for this folder, used when the visual representation
		 * of the folder is likely too small to display the icon image from iconUrl.
		 */
		genericIconClass?: 'repo' | 'lock' | 'repo-forked' | 'mirror' | 'circle-slash' | 'file-directory' | 'file-submodule' | 'file-symlink-directory';

		/**
		 * The primary clone URL of this folder's repository.
		 */
		cloneUrl?: Uri;

		/**
		 * The user-provided description of the folder (e.g., the
		 * repository description).
		 */
		description?: string;

		/**
		 * Whether this folder represents a repository that is private,
		 * as defined by the repository's host.
		 */
		isPrivate?: boolean;

		/**
		 * Whether this folder represents a repository that is a fork
		 * of some other repository, as reported by the repository's host.
		 */
		isFork?: boolean;

		/**
		 * Whether this folder represents a repository that is a mirror
		 * of some other repository, as reported by the repository's host.
		 */
		isMirror?: boolean;

		/**
		 * The number of users who have starred this folder's repository.
		 */
		starsCount?: number;

		/**
		 * The number of forks of this folder's repository that exist.
		 */
		forksCount?: number;

		/**
		 * The number of users watching this folder's repository.
		 */
		watchersCount?: number;

		/**
		 * The primary programming language of the code in this folder.
		 */
		primaryLanguage?: string;

		/**
		 * The date when this folder's repository was created.
		 */
		createdAt?: Date;

		/**
		 * The date when this folder's repository was last updated.
		 */
		updatedAt?: Date;

		/**
		 * The date when this folder's repository was last pushed to.
		 */
		pushedAt?: Date;

		/**
		 * Whether the viewer has starred this folder.
		 */
		viewerHasStarred?: boolean;

		/**
		 * Whether the viewer has admin permissions on this folder.
		 */
		viewerCanAdminister?: boolean;

		/**
		 * The approximate number of bytes that this folder takes up on disk.
		 */
		approximateByteSize?: number;
	}

	/**
	 * Provides a method to search for folders (typically repositories).
	 */
	export interface FolderCatalogProvider {
		/**
		 * Gets information about the folder (typically a repository) with the given URI.
		 */
		resolveFolder(resource: Uri): Thenable<CatalogFolder>;

		/**
		 * Gets the FolderCatalog resource URI for the local FS path (typically an on-disk clone).
		 */
		resolveLocalFolderResource(path: string): Thenable<Uri | null>;

		/**
		 * Searches for folders, typically repositories on a remote code host.
		 */
		search(query: string, token: CancellationToken): Thenable<CatalogFolder[]>;
	}

	export namespace workspace {
		export function registerFileSystemProvider(authority: string, provider: FileSystemProvider): Disposable;

		/**
		 * Registers a IResourceResolutionProvider for the given scheme (e.g. 'git+ssh').
		 */
		export function registerResourceResolutionProvider(scheme: string, provider: ResourceResolutionProvider): Disposable;

		/**
		 * Registers a folder catalog provider to search and manage folders (typically repositories on
		 * a remote code host).
		 *
		 * All folders underneath the given root resource are associated with the provider. See
		 * CatalogFolder#resource for more information.
		 */
		export function registerFolderCatalogProvider(root: Uri, provider: FolderCatalogProvider): Disposable;
	}

	export namespace window {

		export function sampleFunction(): Thenable<any>;
	}

	/**
	 * Represents a workspace.
	 */
	export interface WorkspaceData {
		readonly id: string;
		readonly configPath: string;
		readonly folders: WorkspaceFolder[];
	}

	/**
	 * Represents an open workbench window.
	 */
	export interface WorkbenchWindow {
		/**
		 * The numeric ID of the window.
		 */
		readonly id: number;

		/**
		 * The window's title, at the point in time when
		 * [window.getWindows](#window.getWindows) was called).
		 */
		readonly title: string;

		/**
		 * The window's workspace, if any, at the point in time when
		 * [window.getWindows](#window.getWindows) was called.
		 */
		readonly workspace?: WorkspaceData;

		/**
		 * Show and focus the window.
		 */
		showAndFocus(): Thenable<void>;
	}

	export namespace window {
		/**
		 * The ID of the current [workbench window](#WorkbenchWindow). It can be compared to
		 * the ID of another [workbench window](#WorkbenchWindow) to see if that refers to
		 * the current window.
		 */
		export const id: number;

		/**
		 * Retrieve the list of all open [workbench windows](#WorkbenchWindow).
		 */
		export function getWindows(): Thenable<WorkbenchWindow[]>;
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

	/**
	 * Options for the command to execute.
	 */
	export interface CommandOptions {
		stdin?: string;

		/**
		 * Indicates whether or not this command changes the local state of the SCM provider.
		 */
		mutatesLocalState?: boolean;
	}

	export interface CommandExecutor {
		executeCommand(args: string[], options?: CommandOptions): Thenable<string>;
	}

	export interface SourceControl {

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
		 *
		 * If there is no argument, the source control should present the user with a menu
		 * to select a revision.
		 */
		setRevisionCommand?: Command;

		/**
		 * A list of remote resources that this provider's repository represents. If there are
		 * multiple, then the first element should be the primary remote resource. It is used to
		 * map a local resource to a remote resource.
		 *
		 * For example, for a Git repository, this is the list of Git remote URLs.
		 */
		remoteResources?: Uri[];

		commandExecutor?: CommandExecutor;
	}

	export namespace scm {

		/**
		 * Returns the source control for the given resource (by traversing up the directory
		 * hierarchy until the first folder is found that is associated with an source
		 * control). Can be undefined if the resource is not in any known source control.
		 */
		export function getSourceControlForResource(resource: Uri): SourceControl | undefined;
	}

	export namespace languages {
		export function registerColorProvider(selector: DocumentSelector, provider: DocumentColorProvider): Disposable;
	}

	//#region decorations

	//todo@joh -> make class
	export interface DecorationData {
		priority?: number;
		title?: string;
		bubble?: boolean;
		abbreviation?: string;
		color?: ThemeColor;
		source?: string;
	}

	export interface SourceControlResourceDecorations {
		source?: string;
		letter?: string;
		color?: ThemeColor;
	}

	export interface DecorationProvider {
		onDidChangeDecorations: Event<undefined | Uri | Uri[]>;
		provideDecoration(uri: Uri, token: CancellationToken): ProviderResult<DecorationData>;
	}

	export namespace window {
		export function registerDecorationProvider(provider: DecorationProvider): Disposable;
	}

	//#endregion

	/**
	 * Represents the debug console.
	 */
	export interface DebugConsole {
		/**
		 * Append the given value to the debug console.
		 *
		 * @param value A string, falsy values will not be printed.
		 */
		append(value: string): void;

		/**
		 * Append the given value and a line feed character
		 * to the debug console.
		 *
		 * @param value A string, falsy values will be printed.
		 */
		appendLine(value: string): void;
	}

	export namespace debug {
		/**
		 * The [debug console](#DebugConsole) singleton.
		 */
		export let console: DebugConsole;
	}

	/**
	 * The theme-aware decorations for a [checklist item](#ChecklistItem).
	 */
	export interface ChecklistItemThemableDecorations extends SourceControlResourceThemableDecorations { }

	/**
	 * The decorations for a [checklist item](#ChecklistItem).
	 * Can be independently specified for light and dark themes.
	 */
	export interface ChecklistItemDecorations extends ChecklistItemThemableDecorations, SourceControlResourceDecorations { }

	/**
	 * A checklist item represents the state of an underlying
	 * item within a certain [checklist group](#ChecklistItemGroup).
	 */
	export interface ChecklistItem {

		/**
		 * The name of the item.
		 */
		readonly name?: string;

		/**
		 * The description of the item.
		 */
		readonly description?: string;

		/**
		 * The [command](#Command) which should be run when the item
		 * is opened in the Checklist viewlet.
		 */
		readonly command?: Command;

		/**
		 * The [decorations](#ChecklistItemDecorations) for this checklist provider
		 * item state.
		 */
		readonly decorations?: ChecklistItemDecorations;
	}

	/**
	 * A checklist item group is a collection of
	 * [checklist items](#ChecklistItem).
	 */
	export interface ChecklistItemGroup {

		/**
		 * The id of this checklist item group.
		 */
		readonly id: string;

		/**
		 * The label of this checklist item group.
		 */
		label: string;

		/**
		 * Whether this checklist item group is hidden when it contains
		 * no [checklist items](#ChecklistItem).
		 */
		hideWhenEmpty?: boolean;

		/**
		 * This group's collection of [checklist items](#ChecklistItem).
		 */
		itemStates: ChecklistItem[];

		/**
		 * Dispose this checklist item group.
		 */
		dispose(): void;
	}

	/**
	 * A checklist provider is able to provide [checklist items](#ChecklistItem)
	 * to the editor and interact with the editor in several related ways.
	 */
	export interface ChecklistProvider {

		/**
		 * The id of this checklist provider.
		 */
		readonly id: string;

		/**
		 * The human-readable label of this checklist provider.
		 */
		readonly label: string;

		/**
		 * The UI-visible count of [checklist items](#ChecklistItem) of
		 * this checklist provider.
		 *
		 * Equals to the total number of [checklist items](#ChecklistItem)
		 * of this checklist provider, if undefined.
		 */
		count?: number;

		/**
		 * Optional status bar commands.
		 *
		 * These commands will be displayed in the editor's status bar. TODO(sqs)
		 */
		statusBarCommands?: Command[];

		/**
		 * Create a new [item group](#ChecklistItemGroup).
		 */
		createItemGroup(id: string, label: string): ChecklistItemGroup;

		/**
		 * Dispose this checklist provider.
		 */
		dispose(): void;
	}

	export namespace checklist {

		/**
		 * Creates a new [checklist provider](#ChecklistProvider) instance.
		 *
		 * @param id An `id` for the checklist provider. Something short, eg: `my checklist provider`.
		 * @param label A human-readable string for the checklist provider. Eg: `My Checklist Provider`.
		 * @return An instance of [checklist provider](#ChecklistProvider).
		 */
		export function createChecklistProvider(id: string, label: string): ChecklistProvider;
	}

	/**
	 * The contents of the view zone.
	 */
	export interface ViewZoneContents {
		type: 'html';
		value: string;
	}

	/**
	 * Options for creating a [view zone](#TextEditorViewZone).
	 */
	export interface ViewZoneOptions {

		/**
		 * The content of the view zone.
		 */
		contents: ViewZoneContents;
	}

	/**
	 * Represents the header of a [view zone](#TextEditorViewZone).
	 */
	export interface ViewZoneHeader {
		readonly primaryHeading: string;
		readonly secondaryHeading?: string;
		readonly metaHeading?: string;
	}

	/**
	 * Represents a view zone in a text editor.
	 *
	 * A view zone is a full horizontal rectangle that 'pushes' text down. The editor reserves
	 * space for zones when rendering.
	 *
	 * A view zone is rendered in an isolated webview. The extension can send and receive messages
	 * to the webview using TextEditorViewZone's postMessage method and onMessage event. The webview
	 * can send and receive messages to the extension using the following functions, which are
	 * defined in the webview's context:
	 *
	 *     declare function postMessageToExtension(message: string): void;
	 *     declare function onMessageFromExtension(callback: (message: string, origin: string) => void): void;
	 *
	 * The view zone is responsible for managing its own height (to avoid scrolling or extraneous
	 * empty space). To request a new height, it uses the following function that is defined in its
	 * context:
	 *
	 *     declare function requestLayout(height: number): void;
	 */
	export interface TextEditorViewZone extends Disposable {

		/**
		 * Show the [view zone](#TextEditorViewZone) at the specified position;
		 */
		show(position: Position): void;

		/**
		 * Show the [view zone](#TextEditorViewZone) at the specified range.
		 */
		show(range: Range): void;

		/**
		 * Hide the [view zone](#TextEditorViewZone).
		 */
		hide(): void;

		/**
		 * The [view zone's](#TextEditorViewZone) header.
		 */
		header?: ViewZoneHeader;

		/**
		 * Sends a message to the [view zone's](#TextEditorViewZone) web frame.
		 */
		postMessage(message: string): void;

		/**
		 * An [event](#Event) that is fired when a message is received from the
		 * [view zone's](#TextEditorViewZone) web frame.
		 */
		onMessage: Event<string>;

		/**
		 * An [event](#Event) that is fired when the [view zone](#TextEditorViewZone) is closed. It
		 * is closed when its editor is no longer visible, when it's disposed, or by explicit action.
		 */
		onDidClose: Event<void>;
	}

	export interface TextEditor {
		/**
		 * Creates a [view zone](#TextEditorViewZone) in the text editor.
		 *
		 * A view zone is a full horizontal rectangle that 'pushes' text down. The editor reserves
		 * space for zones when rendering.
		 *
		 * @param id An `id` for the view zone. Multiple view zones with the same `id` are allowed.
		 * @param contents The contents of the view zone.
		 * @return The view zone.
		 */
		createViewZone(id: string, contents: ViewZoneContents): TextEditorViewZone;
	}
}
