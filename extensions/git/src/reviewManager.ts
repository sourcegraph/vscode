/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Uri, Disposable, review, ReviewControl, SourceControlResourceGroup } from 'vscode';
import { Repository } from './repository';
import { dispose } from './util';
import { RefType } from './git';
import { getResourceStatesForComparison, ComparisonArgs } from './comparison';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class ReviewManager implements Disposable {

	private disposables: Disposable[] = [];

	/**
	 * Map of review by the branch's id (e.g. "refs/heads/blamerev").
	 */
	private reviews = new Map<string, Review>();

	constructor(private repository: Repository) {
		repository.onDidChangeStatus(this.onDidChangeStatus, this, this.disposables);
	}

	private onDidChangeStatus(): void {
		const refs = new Map<string, ReviewRef>();
		for (const ref of this.repository.refs) {
			const id = ref.fullName;
			const name = ref.name;
			const remote = ref.remote;
			if (id && name && remote && (ref.type === RefType.Head || ref.type === RefType.RemoteHead)) {
				refs.set(id, { id, name, remote });
			}
		}

		// Dispose review controls for removed refs.
		for (const [id, reviewControl] of this.reviews) {
			if (!refs.has(id)) {
				reviewControl.dispose();
				this.reviews.delete(id);
			}
		}

		// Add new review controls.
		for (const [id, ref] of refs) {
			if (!this.reviews.has(id)) {
				const review = new Review(this.repository, ref);
				this.reviews.set(id, review);
			}
		}
	}

	public dispose(): void {
		this.reviews.forEach(review => review.dispose());
		this.reviews.clear();
		this.disposables = dispose(this.disposables);
	}
}

/**
 * A Git reference that can be reviewed.
 */
interface ReviewRef {
	/**
	 * The id (full name) of the reference.
	 * (e.g. "refs/remotes/origin/mybranch")
	 */
	id: string;

	/**
	 * This display name of the branch.
	 * (e.g. "origin/mybranch")
	 */
	name: string;

	/**
	 * The origin of the branch.
	 * (e.g. "origin", "upstream")
	 */
	remote: string;
}

class Review implements Disposable {

	private disposables: Disposable[] = [];
	private reviewControl: ReviewControl;
	private changesGroup: SourceControlResourceGroup;

	constructor(private repository: Repository, private ref: ReviewRef) {
		this.reviewControl = this.register(review.createReviewControl(ref.id, ref.name, Uri.file(repository.root)));
		this.changesGroup = this.register(this.reviewControl.createResourceGroup('changes', localize('changes', "Changes")));
		this.reviewControl.onDidChangeActive(this.onDidChangeActive, this, this.disposables);
	}

	private register<T extends Disposable>(disposable: T): T {
		this.disposables.push(disposable);
		return disposable;
	}

	private didWarnAboutLimit = false;
	private async onDidChangeActive(): Promise<void> {
		if (!this.reviewControl.active) {
			return;
		}
		const parentBranch = 'master'; // TODO(nick): detect this smartly(tm)
		const mergeBase = await this.repository.getMergeBase([parentBranch, this.ref.name]);
		if (mergeBase.length !== 1 || !mergeBase[0]) {
			throw new Error(`unable to determine merge-base for '${parentBranch} ${this.ref.name}'`);
		}
		const args = new ComparisonArgs(mergeBase[0]);
		const { resources, didHitLimit } = await getResourceStatesForComparison(this.repository, args, this.didWarnAboutLimit);
		this.didWarnAboutLimit = didHitLimit;
		this.changesGroup.resourceStates = resources;
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}