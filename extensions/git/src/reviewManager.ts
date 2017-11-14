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
		repository.onDidChangeStatus(this.updateReviews, this, this.disposables);
	}

	private updateReviews(): void {
		const refs = new Map<string, ReviewRef>();
		for (const ref of this.repository.refs) {
			const { fullName, name, remote, committerDate, committerName } = ref;
			// Only include branches with a remote upstream
			if (fullName && name && remote && ref.type === RefType.RemoteHead && ref.type && !['HEAD', 'master'].includes(name.split('/')[1])) {
				refs.set(fullName, { fullName, name, remote, committerDate, committerName });
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
	 * The full name of the reference.
	 * (e.g. "refs/remotes/origin/mybranch")
	 */
	fullName: string;

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

	/**
	 * The time of the last update made to this reviewable
	 */
	committerDate?: Date;

	/**
	 * The potential reviewee
	 */
	committerName?: string;
}

class Review implements Disposable {

	private disposables: Disposable[] = [];
	private reviewControl: ReviewControl;

	constructor(private repository: Repository, private ref: ReviewRef) {
		const id = ref.fullName;
		// TODO only include the remote if it's ambiguous / not the "default" (origin/upstream of the local branch)
		const description = `${repository.root.split(/[\\/]/).pop()} / ${ref.remote}`;
		let label = ref.name;
		// Don't show the remote name as part of the branch name
		if (label.indexOf(ref.remote + '/') === 0) {
			label = label.slice(ref.remote.length + 1);
		}
		this.reviewControl = this.register(review.createReviewControl(id, label, description, 'octicon octicon-git-branch', Uri.file(repository.root)));
		this.reviewControl.reviewCommand = {
			command: 'git.review',
			title: localize('git.review', "Review"),
			arguments: [this.reviewControl]
		};

		// Update committerDate and committerName
		this.updateFeatures();
		repository.onDidChangeStatus(this.updateFeatures, this, this.disposables);
	}

	private register<T extends Disposable>(disposable: T): T {
		this.disposables.push(disposable);
		return disposable;
	}

	/**
	 * Updates the details of the underlying ReviewControl with the latest information from the branch tip
	 */
	public updateFeatures(): void {
		this.reviewControl.date = this.ref.committerDate && this.ref.committerDate.getTime();
		this.reviewControl.author = this.ref.committerName;
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}