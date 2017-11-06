/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { IDisposable, dispose, empty as EmptyDisposable, combinedDisposable } from 'vs/base/common/lifecycle';
import { filterEvent, anyEvent } from 'vs/base/common/event';
import { VIEWLET_ID } from 'vs/workbench/parts/checklist/common/checklist';
import { IChecklistService, IChecklistProvider } from 'vs/workbench/services/checklist/common/checklist';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export class StatusUpdater implements IWorkbenchContribution {

	private static ID = 'vs.check.statusUpdater';

	private badgeDisposable: IDisposable = EmptyDisposable;
	private disposables: IDisposable[] = [];

	constructor(
		@IChecklistService private checkService: IChecklistService,
		@IActivityService private activityBarService: IActivityService
	) {
		this.checkService.onDidAddProvider(this.onDidAddRepository, this, this.disposables);
		this.render();
	}

	private onDidAddRepository(provider: IChecklistProvider): void {
		const onDidChange = anyEvent(provider.onDidChange, provider.onDidChangeItems);
		const changeDisposable = onDidChange(() => this.render());

		const onDidRemove = filterEvent(this.checkService.onDidRemoveProvider, e => e === provider);
		const removeDisposable = onDidRemove(() => {
			disposable.dispose();
			this.disposables = this.disposables.filter(d => d !== removeDisposable);
			this.render();
		});

		const disposable = combinedDisposable([changeDisposable, removeDisposable]);
		this.disposables.push(disposable);
	}

	getId(): string {
		return StatusUpdater.ID;
	}

	private render(): void {
		this.badgeDisposable.dispose();

		const count = this.checkService.providers.reduce((r, provider) => {
			if (typeof provider.count === 'number') {
				return r + provider.count;
			} else {
				return r + provider.items.reduce<number>((r, g) => r + g.itemCollection.items.length, 0);
			}
		}, 0);

		if (count > 0) {
			const badge = new NumberBadge(count, num => localize('checklistItemsBadge', '{0} items needing attention', num));
			this.badgeDisposable = this.activityBarService.showActivity(VIEWLET_ID, badge, 'checklist-viewlet-label');
		} else {
			this.badgeDisposable = EmptyDisposable;
		}
	}

	dispose(): void {
		this.badgeDisposable.dispose();
		this.disposables = dispose(this.disposables);
	}
}
