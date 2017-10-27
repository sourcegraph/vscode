/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { workspace, WorkspaceFoldersChangeEvent, Uri, window, Event, EventEmitter, QuickPickItem, Disposable, SourceControl, SourceControlResourceGroup, TextEditor, TextDocument, Memento } from 'vscode';
import { Repository, RepositoryState } from './repository';
import { memoize, sequentialize, debounce } from './decorators';
import { dispose, anyEvent, filterEvent, replaceVariables } from './util';
import { Git, GitErrorCodes } from './git';
import * as path from 'path';
import * as fs from 'fs';
import * as nls from 'vscode-nls';
import * as events from 'events';
import * as os from 'os';
import { GlobalRepositories } from './globalRepositories';
import { Comparison } from './comparison';

const localize = nls.loadMessageBundle();

class RepositoryPick implements QuickPickItem {
	@memoize get label(): string {
		return path.basename(this.repository.root);
	}

	@memoize get description(): string {
		return [this.repository.headLabel, this.repository.syncLabel]
			.filter(l => !!l)
			.join(' ');
	}

	constructor(public readonly repository: Repository, public readonly index: number) { }
}

export interface ModelChangeEvent {
	repository: Repository;
	uri: Uri;
}

export interface OriginalResourceChangeEvent {
	repository: Repository;
	uri: Uri;
}

interface OpenRepository extends Disposable {
	repository: Repository;
}

function isParent(parent: string, child: string): boolean {
	return child.startsWith(parent);
}

export class Model {

	private _onDidOpenRepository = new EventEmitter<Repository>();
	readonly onDidOpenRepository: Event<Repository> = this._onDidOpenRepository.event;

	private _onDidCloseRepository = new EventEmitter<Repository>();
	readonly onDidCloseRepository: Event<Repository> = this._onDidCloseRepository.event;
	private _onDidChangeRepository = new EventEmitter<ModelChangeEvent>();

	readonly onDidChangeRepository: Event<ModelChangeEvent> = this._onDidChangeRepository.event;

	private _onDidChangeOriginalResource = new EventEmitter<OriginalResourceChangeEvent>();
	readonly onDidChangeOriginalResource: Event<OriginalResourceChangeEvent> = this._onDidChangeOriginalResource.event;

	private openRepositories: OpenRepository[] = [];
	get repositories(): Repository[] { return this.openRepositories.map(r => r.repository); }

	private globalRepositories: GlobalRepositories;
	get onOutput(): events.EventEmitter { return this.globalRepositories.onOutput; }

	private possibleGitRepositoryPaths = new Set<string>();

	private _onDidOpenComparison = new EventEmitter<Comparison>();
	readonly onDidOpenComparison: Event<Comparison> = this._onDidOpenComparison.event;

	private _onDidCloseComparison = new EventEmitter<Comparison>();
	readonly onDidCloseComparison: Event<Comparison> = this._onDidCloseComparison.event;

	private _comparisons: Comparison[] = [];
	get comparisons(): Comparison[] { return this._comparisons; }

	private enabled = false;
	private configurationChangeDisposable: Disposable;
	private disposables: Disposable[] = [];

	constructor(
		private git: Git,
		private globalState: Memento,
	) {
		const config = workspace.getConfiguration('git');
		this.enabled = config.get<boolean>('enabled') === true;

		this.configurationChangeDisposable = workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this);
		this.globalRepositories = new GlobalRepositories(git, globalState);

		if (this.enabled) {
			this.enable();
		}
	}

	private onDidChangeConfiguration(): void {
		const config = workspace.getConfiguration('git');
		const enabled = config.get<boolean>('enabled') === true;

		if (enabled === this.enabled) {
			return;
		}

		this.enabled = enabled;

		if (enabled) {
			this.enable();
		} else {
			this.disable();
		}
	}

	private enable(): void {
		workspace.onDidChangeWorkspaceFolders(this.onDidChangeWorkspaceFolders, this, this.disposables);
		this.onDidChangeWorkspaceFolders({ added: workspace.workspaceFolders || [], removed: [] });

		window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors, this, this.disposables);
		this.onDidChangeVisibleTextEditors(window.visibleTextEditors);

		workspace.onDidCloseTextDocument(this.onDidCloseTextDocument, this, this.disposables);

		const fsWatcher = workspace.createFileSystemWatcher('**');
		this.disposables.push(fsWatcher);

		const onWorkspaceChange = anyEvent(fsWatcher.onDidChange, fsWatcher.onDidCreate, fsWatcher.onDidDelete);
		const onGitRepositoryChange = filterEvent(onWorkspaceChange, uri => /\/\.git\//.test(uri.path));
		const onPossibleGitRepositoryChange = filterEvent(onGitRepositoryChange, uri => !this.getRepository(uri));
		onPossibleGitRepositoryChange(this.onPossibleGitRepositoryChange, this, this.disposables);

		this.scanWorkspaceFolders();

		this.disposables.push(this.globalRepositories);
		this.scanRepositoryDirectory();
	}

	private disable(): void {
		const openRepositories = [...this.openRepositories];
		openRepositories.forEach(r => r.dispose());
		this.openRepositories = [];

		this.possibleGitRepositoryPaths.clear();
		this.disposables = dispose(this.disposables);
	}

	/**
	 * Scans the first level of each workspace folder, looking
	 * for git repositories.
	 */
	private async scanWorkspaceFolders(): Promise<void> {
		for (const folder of workspace.workspaceFolders || []) {
			const root = folder.uri.fsPath;
			const children = await new Promise<string[]>((c, e) => fs.readdir(root, (err, r) => err ? e(err) : c(r)));

			children
				.filter(child => child !== '.git')
				.forEach(child => this.tryOpenRepository(path.join(root, child), true));
		}
	}

	private scanRepositoryDirectory(): Promise<void> {
		const directoryTemplate = workspace.getConfiguration('git').get<string>('repositoryScanDirectory');
		if (!directoryTemplate) {
			return Promise.resolve();
		}

		const homePath = os.homedir();
		const separator = path.sep;
		const dir = replaceVariables(directoryTemplate, { homePath, separator });
		return this.globalRepositories.scan(dir);
	}

	private onPossibleGitRepositoryChange(uri: Uri): void {
		const possibleGitRepositoryPath = uri.fsPath.replace(/\.git.*$/, '');
		this.possibleGitRepositoryPaths.add(possibleGitRepositoryPath);
		this.eventuallyScanPossibleGitRepositories();
	}

	@debounce(500)
	private eventuallyScanPossibleGitRepositories(): void {
		for (const path of this.possibleGitRepositoryPaths) {
			this.tryOpenRepository(path, true);
		}

		this.possibleGitRepositoryPaths.clear();
	}

	private async onDidChangeWorkspaceFolders({ added, removed }: WorkspaceFoldersChangeEvent): Promise<void> {
		const possibleRepositoryFolders = added
			.filter(folder => !this.getOpenRepository(folder.uri));

		const activeRepositoriesList = window.visibleTextEditors
			.map(editor => this.getRepository(editor.document.uri))
			.filter(repository => !!repository) as Repository[];

		const activeRepositories = new Set<Repository>(activeRepositoriesList);
		const openRepositoriesToDispose = removed
			.map(folder => this.getOpenRepository(folder.uri))
			.filter(r => !!r)
			.filter(r => !activeRepositories.has(r!.repository))
			.filter(r => !(workspace.workspaceFolders || []).some(f => isParent(f.uri.fsPath, r!.repository.root))) as OpenRepository[];

		possibleRepositoryFolders.forEach(p => this.tryOpenRepository(p.uri.fsPath, true));
		openRepositoriesToDispose.forEach(r => r.dispose());
	}

	private onDidChangeVisibleTextEditors(editors: TextEditor[]): void {
		editors.forEach(editor => {
			const uri = editor.document.uri;

			if (uri.scheme !== 'file') {
				return;
			}

			const repository = this.getRepository(uri);

			if (repository) {
				return;
			}

			this.tryOpenRepository(path.dirname(uri.fsPath));
		});
	}

	private onDidCloseTextDocument(doc: TextDocument): void {
		// Dispose a repository when it is no longer in use (no open documents, not a workspace root).
		if (doc.uri.scheme !== 'file') {
			return;
		}

		const repository = this.getOpenRepository(doc.uri);
		if (!repository) {
			return;
		}

		const activeRepositoriesList = (workspace.workspaceFolders || [])
			.map(folder => this.getOpenRepository(folder.uri))
			.filter(r => !!r) as OpenRepository[];
		const activeRepositories = new Set<OpenRepository>(activeRepositoriesList);
		for (const otherDoc of workspace.textDocuments) {
			if (otherDoc.uri.scheme === 'file') {
				const otherRepository = this.getOpenRepository(otherDoc.uri);
				if (otherRepository) {
					activeRepositories.add(otherRepository);
				}
			}
		}

		if (!activeRepositories.has(repository)) {
			repository.dispose();
		}
	}

	@sequentialize
	async tryOpenRepository(path: string, preferExact?: boolean): Promise<void> {
		if (this.getRepository(path, preferExact)) {
			return;
		}

		try {
			const repositoryRoot = await this.git.getRepositoryRoot(path);

			// This can happen whenever `path` has the wrong case sensitivity in
			// case insensitive file systems
			// https://github.com/Microsoft/vscode/issues/33498
			if (this.getRepository(repositoryRoot, preferExact)) {
				return;
			}

			const repository = new Repository(this.git.open(repositoryRoot));

			this.open(repository);
		} catch (err) {
			if (err.gitErrorCode === GitErrorCodes.NotAGitRepository) {
				return;
			}

			// console.error('Failed to find repository:', err);
		}
	}

	/**
	 * Returns locations on disk that have been found to contain the remote.
	 * Note: This does not validate that the paths still exist, that is left to
	 * the caller.
	 */
	async getPossibleRemotesOnDisk(remote: Uri | string): Promise<string[]> {
		if (remote instanceof Uri) {
			remote = remote.toString();
		}
		return this.globalRepositories.resolveRemotes(remote);
	}

	private open(repository: Repository): void {
		const onDidDisappearRepository = filterEvent(repository.onDidChangeState, state => state === RepositoryState.Disposed);
		const disappearListener = onDidDisappearRepository(() => dispose());
		const changeListener = repository.onDidChangeRepository(uri => this._onDidChangeRepository.fire({ repository, uri }));
		const originalResourceChangeListener = repository.onDidChangeOriginalResource(uri => this._onDidChangeOriginalResource.fire({ repository, uri }));

		const dispose = () => {
			disappearListener.dispose();
			changeListener.dispose();
			originalResourceChangeListener.dispose();
			repository.dispose();

			this.openRepositories = this.openRepositories.filter(e => e !== openRepository);
			this._onDidCloseRepository.fire(repository);
		};

		const openRepository = { repository, dispose };
		this.openRepositories.push(openRepository);
		this._onDidOpenRepository.fire(repository);
	}

	close(repository: Repository): void {
		const openRepository = this.getOpenRepository(repository);

		if (!openRepository) {
			return;
		}

		openRepository.dispose();
	}

	async pickRepository(): Promise<Repository | undefined> {
		if (this.openRepositories.length === 0) {
			throw new Error(localize('no repositories', "There are no available repositories"));
		}

		const picks = this.openRepositories.map((e, index) => new RepositoryPick(e.repository, index));

		// Sort picks such that repositories containing the active text editor
		// appear first.
		const active = window.activeTextEditor;
		if (active && active.document.fileName) {
			const hasActiveEditor = (root: string) => {
				const relative = path.relative(root, active.document.fileName);
				return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
			};
			picks.sort((a, b) => {
				const aHas = hasActiveEditor(a.repository.root);
				const bHas = hasActiveEditor(b.repository.root);
				if (aHas !== bHas) {
					return aHas ? -1 : 1;
				}
				if (aHas && a.repository.root.length !== b.repository.root.length) {
					// Both a and b contain the active editor document, so one
					// is an ancestor of the other. We prefer to return the
					// child (likely a submodule) since the active editor will
					// be part of that repo. Child is the longer path.
					return b.repository.root.length - a.repository.root.length;
				}
				// Otherwise everything else is equal, so keeps the positions stable
				return a.index - b.index;
			});
		}

		const placeHolder = localize('pick repo', "Choose a repository");
		const pick = await window.showQuickPick(picks, { placeHolder });

		return pick && pick.repository;
	}

	getRepository(sourceControl: SourceControl): Repository | undefined;
	getRepository(resourceGroup: SourceControlResourceGroup): Repository | undefined;
	getRepository(path: string, exact?: boolean): Repository | undefined;
	getRepository(resource: Uri, exact?: boolean): Repository | undefined;
	getRepository(hint: any, exact?: boolean): Repository | undefined {
		const liveRepository = this.getOpenRepository(hint, exact);
		return liveRepository && liveRepository.repository;
	}

	private getOpenRepository(repository: Repository): OpenRepository | undefined;
	private getOpenRepository(sourceControl: SourceControl): OpenRepository | undefined;
	private getOpenRepository(resourceGroup: SourceControlResourceGroup): OpenRepository | undefined;
	private getOpenRepository(path: string, exact?: boolean): OpenRepository | undefined;
	private getOpenRepository(resource: Uri, exact?: boolean): OpenRepository | undefined;
	private getOpenRepository(hint: any, exact?: boolean): OpenRepository | undefined {
		if (!hint) {
			return undefined;
		}

		if (hint instanceof Repository) {
			return this.openRepositories.filter(r => r.repository === hint)[0];
		}

		if (typeof hint === 'string') {
			hint = Uri.file(hint);
		}

		if (hint instanceof Uri) {
			const resourcePath = hint.fsPath;

			for (const liveRepository of this.openRepositories) {
				if (exact) {
					if (liveRepository.repository.root === resourcePath) {
						return liveRepository;
					}
				} else {
					const relativePath = path.relative(liveRepository.repository.root, resourcePath);

					if (!/^\.\./.test(relativePath)) {
						return liveRepository;
					}
				}
			}

			return undefined;
		}

		for (const liveRepository of this.openRepositories) {
			const repository = liveRepository.repository;

			if (hint === repository.sourceControl) {
				return liveRepository;
			}

			if (hint === repository.mergeGroup || hint === repository.indexGroup || hint === repository.workingTreeGroup) {
				return liveRepository;
			}
		}

		return undefined;
	}

	dispose(): void {
		this.disable();
		this.configurationChangeDisposable.dispose();
	}
}
