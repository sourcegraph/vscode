/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Disposable, review, ReviewControl } from 'vscode';
import { Repository } from './repository';
import { dispose } from './util';
import { RefType, Ref } from './git';

export class ReviewManager implements Disposable {

	private disposables: Disposable[] = [];

	/**
	 * Map of review controls by the branches full name (e.g. "refs/heads/blamerev").
	 */
	private reviewControls = new Map<string, ReviewControl>();

	constructor(private repository: Repository) {
		repository.onDidChangeStatus(this.onDidChangeStatus, this, this.disposables);
	}

	private onDidChangeStatus(): void {
		const refs = new Map<string, Ref>();
		for (const ref of this.repository.refs) {
			if (ref.fullName && (ref.type === RefType.Head || ref.type === RefType.RemoteHead)) {
				refs.set(ref.fullName, ref);
			}
		}

		// Dispose review controls for removed refs.
		for (const [fullName, reviewControl] of this.reviewControls) {
			if (!refs.has(fullName)) {
				reviewControl.dispose();
				this.reviewControls.delete(fullName);
			}
		}

		// Add new review controls.
		for (const [fullName, ref] of refs) {
			if (!this.reviewControls.has(fullName)) {
				const reviewControl = review.createReviewControl(fullName, ref.name || fullName);
				this.reviewControls.set(fullName, reviewControl);
			}
		}
	}

	public dispose(): void {
		this.reviewControls.forEach(reviewControl => reviewControl.dispose());
		this.reviewControls.clear();
		this.disposables = dispose(this.disposables);
	}
}