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
}
