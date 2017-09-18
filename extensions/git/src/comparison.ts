/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, EventEmitter, Event, scm, SourceControl, SourceControlInputBox, SourceControlResourceGroup, SourceControlResourceState, Disposable, Command, window, workspace } from 'vscode';
import { dispose } from './util';
import { throttle, sequentialize } from './decorators';
import { Repository, RepositoryState, Resource, GitResourceGroup, ResourceGroupType, Status } from './repository';
import * as path from 'path';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class ComparisonResource extends Resource implements SourceControlResourceState {

	constructor(
		public readonly comparison: ComparisonArgs,
		_resourceGroupType: ResourceGroupType,
		_resourceUri: Uri,
		_type: Status,
		_renameResourceUri?: Uri
	) {
		super(_resourceGroupType, _resourceUri, _type, _renameResourceUri);
	}
}

type ParsedUnresolvedComparisonArgs =
	[string] | // diff against working tree
	[string, string] | // diff between two arbitrary commits
	{ mergeBase: true, left: string, right: string }; // diff a...b

export class ComparisonArgs {
	/**
	 * Create a new object representing the arguments to a comparison.
	 *
	 * @param left the left-side revision of the comparison
	 * @param right the right-side revision of the comparison, or undefined for the working tree
	 */
	constructor(
		public readonly left: string,
		public readonly right?: string,
	) { }

	get rightLabel(): string { return this.right || localize('workingTree', "Working Tree"); }

	/**
	 * Parses args to `git diff`. See `git diff --help` for documentation about valid arguments.
	 * The following invocations are supported:
	 *
	 * Diff against working tree:
	 *   git diff <commit> -- [<path>...]
	 *
	 * Diff between two arbitrary commits:
	 *   git diff <commit> <commit> -- [<path>...]
	 *   git diff <commit>..<commit> -- [<path>...]
	 *
	 * Diff between $(git merge-base A B) and B:
	 *   git diff A...B [--] [<path>...]
	 *
	 * @param args to `git diff`
	 */
	static parse(argsString: string): ParsedUnresolvedComparisonArgs {
		let args = argsString.split(/\s+/);
		if (args.includes('--')) {
			args = args.slice(0, args.indexOf('--'));
		}
		args = args.filter(arg => !arg.startsWith('-'));

		switch (args.length) {
			case 0:
				return ['HEAD'];

			case 1:
				if (args[0].includes('...')) {
					const [left, right] = args[0].split('...', 2);
					return { mergeBase: true, left: left || 'HEAD', right: right || 'HEAD' };
				}
				if (args[0].includes('..')) {
					const [a, b] = args[0].split('..', 2);
					return [a || 'HEAD', b || 'HEAD'];
				}
				return [args[0]];

			case 2:
				return [args[0], args[1]];

			default: throw new Error(`invalid comparison args: ${argsString}`);
		}
	}
}

export enum ComparisonState {
	Idle,
	Invalid,
	Disposed
}

export class Comparison implements Disposable {

	private _args: string;
	private _parsedArgs: ParsedUnresolvedComparisonArgs;
	get args(): string { return this._args; }
	set args(value: string) {
		this._args = value;
		this._parsedArgs = ComparisonArgs.parse(value);
		this._resolvedArgs = undefined;
		this.changesGroup.resourceStates = [];
		this._onDidChangeArgs.fire();
		this.updateModelState();
	}

	private _resolvedArgs: ComparisonArgs | undefined;
	get resolvedArgs(): ComparisonArgs | undefined { return this._resolvedArgs; }

	get displayArgs(): string {
		if (Array.isArray(this._parsedArgs)) {
			if (this._parsedArgs.length === 1) {
				return localize('compare to working tree', "{0}", this._parsedArgs[0]);
			}
			return localize('compare two arbitrary commits', "{0}..{1}", this._parsedArgs[0], this._parsedArgs[1]);
		}
		return localize('compare with merge base', "{0}...{1}", this._parsedArgs.left, this._parsedArgs.right);
	}

	private _onDidChangeArgs = new EventEmitter<void>();
	readonly onDidChangeArgs: Event<void> = this._onDidChangeArgs.event;

	private _onDidChangeState = new EventEmitter<ComparisonState>();
	readonly onDidChangeState: Event<ComparisonState> = this._onDidChangeState.event;

	private _sourceControl: SourceControl;
	get sourceControl(): SourceControl { return this._sourceControl; }

	private _changesGroup: SourceControlResourceGroup;
	get changesGroup(): GitResourceGroup { return this._changesGroup as GitResourceGroup; }

	get inputBox(): SourceControlInputBox { return this._sourceControl.inputBox; }

	private _state = ComparisonState.Idle;
	get state(): ComparisonState { return this._state; }
	set state(state: ComparisonState) {
		if (state !== this._state) {
			this._state = state;
			this._onDidChangeState.fire(state);
		}
	}

	private didWarnAboutLimit: boolean;
	private disposables: Disposable[] = [];

	constructor(
		public readonly repository: Repository,
		args: string,
	) {
		this._args = args;
		this._parsedArgs = ComparisonArgs.parse(args);

		this._sourceControl = scm.createSourceControl('gitcomparison', `Compare: ${path.basename(repository.root)}`);
		this.disposables.push(this._sourceControl);

		this._changesGroup = this._sourceControl.createResourceGroup('changes', localize('changes', "Changes"));
		this.disposables.push(this._changesGroup);

		this._sourceControl.statusBarCommands = this.statusBarCommands;
		this.disposables.push(this.onDidChangeArgs(() => this._sourceControl.statusBarCommands = this.statusBarCommands));
		this.disposables.push(this.onDidChangeState(() => this._sourceControl.statusBarCommands = this.statusBarCommands));

		// Suppress count to avoid double-counting changes.
		this._sourceControl.count = 0;

		this.disposables.push(repository.onDidChangeStatus(() => this.throttledUpdate()));
		this.disposables.push(repository.onDidChangeState(state => this.onDidChangeRepositoryState(state)));
	}

	private get statusBarCommands(): Command[] {
		if (this.state === ComparisonState.Disposed) {
			return [];
		}

		let comparisonCommand: Command;
		if (this.state === ComparisonState.Idle) {
			comparisonCommand = {
				command: 'git.changeComparison',
				title: ['$(git-compare)', this.displayArgs].join(' ').trim(),
				tooltip: localize('change comparison', "Change Comparison..."),
				arguments: [this.sourceControl],
			};
		} else {
			comparisonCommand = {
				command: 'git.changeComparison',
				title: ['$(question)', this.displayArgs].join(' ').trim(),
				tooltip: localize('comparison invalid', "Comparison Invalid: Fix..."),
				arguments: [this.sourceControl],
			};
		}

		return [
			comparisonCommand,
			{
				command: 'git.closeComparison',
				title: '$(x)',
				tooltip: localize('close comparison', "Close Comparison"),
				arguments: [this.sourceControl],
			},
		];
	}

	private async resolveArgs(): Promise<ComparisonArgs> {
		const parsedArgs = ComparisonArgs.parse(this.args);
		let argsToVerify: string[];
		if (Array.isArray(parsedArgs)) {
			argsToVerify = parsedArgs;
		} else {
			const mergeBase = await this.repository.getMergeBase([parsedArgs.left, parsedArgs.right]);
			if (mergeBase.length !== 1 || !mergeBase[0]) {
				throw new Error(`unable to determine merge-base for '${this.args}'`);
			}
			argsToVerify = [mergeBase[0], parsedArgs.right];
		}

		await Promise.all(argsToVerify.map(arg => this.repository.revParse(['--verify', arg + '^{commit}'])));

		return new ComparisonArgs(argsToVerify[0], argsToVerify[1]);
	}

	@throttle
	public throttledUpdate(): Thenable<void> {
		// The user will get an error message when they intentionally invoke an update,
		// so it is OK to suppress the error here.
		try {
			return this.updateModelState().then(result => result, err => void 0);
		} catch (err) {
			window.showErrorMessage(err);
			return Promise.resolve();
		}
	}

	@sequentialize
	public update(): Thenable<void> {
		return this.updateModelState();
	}

	private async updateModelState(): Promise<void> {
		let resolvedArgs: ComparisonArgs;
		try {
			resolvedArgs = await this.resolveArgs();
		} catch (err) {
			this.state = ComparisonState.Invalid;
			throw err;
		}
		this._resolvedArgs = resolvedArgs;
		this.state = ComparisonState.Idle;

		const { diff, didHitLimit } = await this.repository.getDiff(this.args.split(/\s+/));

		const config = workspace.getConfiguration('git');
		const shouldIgnore = config.get<boolean>('ignoreComparisonLimitWarning') === true;
		if (didHitLimit && !shouldIgnore && !this.didWarnAboutLimit) {
			const ok = { title: localize('ok', "OK"), isCloseAffordance: true };
			const neverAgain = { title: localize('neveragain', "Never Show Again") };

			window.showWarningMessage(localize('hugeComparison', "The git repository comparison at '{0}' has too many active changes, only a subset of Git features will be enabled.", this.repository.root), ok, neverAgain).then(result => {
				if (result === neverAgain) {
					config.update('ignoreComparisonLimitWarning', true, false);
				}
			});

			this.didWarnAboutLimit = true;
		}

		const changes: Resource[] = [];
		diff.forEach(raw => {
			const uri = Uri.file(path.join(this.repository.root, raw.path));
			const renameUri = raw.rename ? Uri.file(path.join(this.repository.root, raw.rename)) : undefined;

			switch (raw.status) {
				case 'A': changes.push(new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.ADDED)); break;
				case 'C': changes.push(new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, renameUri!, Status.COPIED, uri)); break;
				case 'D': changes.push(new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.DELETED)); break;
				case 'M': changes.push(new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.MODIFIED)); break;
				case 'R': changes.push(new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, renameUri!, Status.RENAMED, uri)); break;
				case 'T': changes.push(new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.MODIFIED)); break;
				case 'U': changes.push(new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.BOTH_MODIFIED, renameUri)); break;
				case 'X': changes.push(new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.MODIFIED)); break;
			}
		});
		this.changesGroup.resourceStates = changes;
	}

	private onDidChangeRepositoryState(state: RepositoryState): void {
		switch (state) {
			case RepositoryState.Idle: break;
			case RepositoryState.Disposed:
				this.state = ComparisonState.Disposed;
		}
	}

	dispose(): void {
		if (this.state !== ComparisonState.Disposed) {
			this.state = ComparisonState.Disposed;
		} else {
			console.log('Warning: dispose called twice for comparison');
		}
		this.disposables = dispose(this.disposables);
	}
}