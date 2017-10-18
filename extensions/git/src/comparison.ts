/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, scm, SourceControlResourceGroup, SourceControlResourceState, Disposable, window, workspace, SourceControl } from 'vscode';
import { dispose } from './util';
import { throttle, debounce } from './decorators';
import { Repository, Resource, GitResourceGroup, ResourceGroupType, Status } from './repository';
import { Branch } from './git';
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
}

/**
 * This magic constant serves three purposes:
 *   1. Prevent the comparison source control from actually being associated with any files.
 *   2. Allow the main thread to strip this suffix to find out the "real" directory that this
 *      compare control is associated with (this is necessary to inject comments as a group).
 *   3. Achieve not terrible formatting for the name in the source control list.
 *
 * The same constant is also defined and used in the main thread.
 */
const MAGIC_COMPARISON_ROOT_SUFFIX = '  ';

export class Comparison implements Disposable {

	private _changesGroup: SourceControlResourceGroup;
	get changesGroup(): GitResourceGroup { return this._changesGroup as GitResourceGroup; }

	private didWarnAboutLimit: boolean;
	private disposables: Disposable[] = [];
	private sourceControl: SourceControl;

	// TODO(nick): figure this out intelligently?
	private baseBranch = 'master';

	constructor(
		public readonly repository: Repository,
	) {
		const magicRoot = Uri.file(path.join(repository.root, MAGIC_COMPARISON_ROOT_SUFFIX));
		this.sourceControl = scm.createSourceControl('gitcomparison', `${path.basename(repository.root)} compare to ${this.baseBranch}`, magicRoot);
		this.disposables.push(this.sourceControl);

		this._changesGroup = this.sourceControl.createResourceGroup('changes', localize('changes', "Changes"));
		this.disposables.push(this._changesGroup);

		// Suppress count to avoid double-counting changes.
		this.sourceControl.count = 0;

		this.disposables.push(repository.onDidChangeStatus(this.onDidChangeStatus, this));
	}

	@debounce(1000)
	private onDidChangeStatus(): void {
		this.throttledUpdate();
	}

	@throttle
	private throttledUpdate(): Thenable<void> {
		// The user will get an error message when they intentionally invoke an update,
		// so it is OK to suppress the error here.
		try {
			return this.updateModelState().then(result => result, err => void 0);
		} catch (err) {
			window.showErrorMessage(err);
			return Promise.resolve();
		}
	}

	private async updateModelState(): Promise<void> {
		let head: Branch | undefined;
		try {
			head = await this.repository.getHEAD();
			if (head.name) {
				head = await this.repository.getBranch(head.name);
			}
		} catch (err) {
			// noop
		}

		const baseBranch = this.getBaseBranch(head);
		const [mergeBase] = await this.repository.getMergeBase([baseBranch, 'HEAD']);
		if (!mergeBase) {
			throw new Error(`unable to determine merge-base for '${baseBranch}'`);
		}

		this.sourceControl.revision = head ? { rawSpecifier: 'HEAD', specifier: head.name, id: head.commit } : undefined;

		const args = new ComparisonArgs(mergeBase);
		const { resources, didHitLimit } = await getResourceStatesForComparison(this.repository, args, this.didWarnAboutLimit);
		this.didWarnAboutLimit = didHitLimit;
		this.changesGroup.resourceStates = resources;
	}

	/**
	 * Returns the base branch to use for computing the merge base.
	 * It tries to detect the remote version of the base branch and use that
	 * because a local checkout can be behind which would include unwanted
	 * changes in the diff.
	 */
	private getBaseBranch(head: Branch | undefined): string {
		if (head && head.upstream) {
			const [remote] = head.upstream.split('/', 1);
			if (remote) {
				return `${remote}/${this.baseBranch}`;
			}
		}
		return this.baseBranch;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

/**
 * Computes the list of resources in the diff for the provided diff arguments.
 * It will warn the user if the diff gets truncated unless didWarnAboutLimit is true.
 */
export async function getResourceStatesForComparison(repository: Repository, resolvedArgs: ComparisonArgs, didWarnAboutLimit: boolean): Promise<{ resources: Resource[], didHitLimit: boolean }> {
	const diffArgs = resolvedArgs.right ? [resolvedArgs.left, resolvedArgs.right] : [resolvedArgs.left];
	const { diff, didHitLimit } = await repository.getDiff(diffArgs);

	const config = workspace.getConfiguration('git');
	const shouldIgnore = config.get<boolean>('ignoreComparisonLimitWarning') === true;
	if (didHitLimit && !shouldIgnore && !didWarnAboutLimit) {
		const ok = { title: localize('ok', "OK"), isCloseAffordance: true };
		const neverAgain = { title: localize('neveragain', "Never Show Again") };
		window.showWarningMessage(localize('hugeComparison', "The git repository comparison at '{0}' has too many active changes, only a subset of Git features will be enabled.", repository.root), ok, neverAgain).then(result => {
			if (result === neverAgain) {
				config.update('ignoreComparisonLimitWarning', true, false);
			}
		});
	}

	const resources = diff.map(raw => {
		const uri = Uri.file(path.join(repository.root, raw.path));
		const renameUri = raw.rename ? Uri.file(path.join(repository.root, raw.rename)) : undefined;
		switch (raw.status) {
			case 'A': return new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.ADDED);
			case 'C': return new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, renameUri!, Status.COPIED, uri);
			case 'D': return new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.DELETED);
			case 'M': return new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.MODIFIED);
			case 'R': return new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, renameUri!, Status.RENAMED, uri);
			case 'T': return new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.MODIFIED);
			case 'U': return new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.BOTH_MODIFIED, renameUri);
			case 'X': return new ComparisonResource(resolvedArgs, ResourceGroupType.Committed, uri, Status.MODIFIED);
		}
	});
	return { resources, didHitLimit };
}