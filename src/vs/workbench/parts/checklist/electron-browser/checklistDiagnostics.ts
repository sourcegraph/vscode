/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import Severity from 'vs/base/common/severity';
import Event, { Emitter } from 'vs/base/common/event';
import { IChecklistService, IChecklistProvider, IChecklistItemGroup, IChecklistItem } from 'vs/workbench/services/checklist/common/checklist';
import { IMarkerService } from 'vs/platform/markers/common/markers';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import MarkersConstants from 'vs/workbench/parts/markers/common/constants';
import { MarkersPanel } from 'vs/workbench/parts/markers/browser/markersPanel';

function iconForSeverity(severity: Severity, inverse: boolean): URI | undefined {
	if (severity === Severity.Ignore) {
		return undefined;
	}
	return URI.file(`${__dirname}/../../markers/browser/media/status-${Severity.toString(severity)}${inverse ? '-inverse' : ''}.svg`);
}

/**
 * ChecklistProvider to display a summary of diagnostics, grouped by diagnostic owner.
 */
export class DiagnosticsChecklistProvider extends Disposable implements IWorkbenchContribution, IChecklistProvider {

	private static ID = 'vs.checklist.diagnosticsProvider';

	private group: IChecklistItemGroup;

	private didChange = new Emitter<void>();

	constructor(
		@IChecklistService private checkService: IChecklistService,
		@IMarkerService private markerService: IMarkerService,
		@IPanelService private panelService: IPanelService,
	) {
		super();

		this._register(this.markerService.onMarkerChanged(resources => this.update()));
		this._register(this.checkService.registerChecklistProvider(this));
		this.group = {
			id: 'diagnostics',
			label: localize('diagnostics', "Diagnostics"),
			provider: this,
			hideWhenEmpty: true,
			itemCollection: {
				onDidSplice: Event.None,
				items: [],
			},
		};
		this.update();
	}

	private update(): void {
		// Show a list of owners that reported diagnostics
		// with the icon representing the highest reported severity
		const items: IChecklistItem[] = [];
		const itemsByOwner = new Map<string, IChecklistItem>();
		const severityByOwner = new Map<string, Severity>();
		const markers = this.markerService.read();
		for (const { owner, severity } of markers) {
			let highestSeverity = severityByOwner.get(owner);

			if (Severity.compare(highestSeverity, severity) > 0) {
				highestSeverity = severity;
				severityByOwner.set(owner, highestSeverity);
			}

			const item: IChecklistItem = itemsByOwner.get(owner) || {
				name: owner,
				decorations: {
					strikeThrough: false,
					faded: false
				},
				itemGroup: this.group,
				open: () => TPromise.wrap(this.openItem()),
			};
			item.decorations.icon = iconForSeverity(severity, false);
			item.decorations.iconDark = iconForSeverity(severity, true);

			// TODO increment count
			if (!itemsByOwner.has(owner)) {
				itemsByOwner.set(owner, item);
				items.push(item);
			}
		}
		this.group.itemCollection.items.splice(0, Infinity, ...items);
		this.didChange.fire();
	}

	private async openItem(): Promise<void> {
		await this.panelService.openPanel(MarkersConstants.MARKERS_PANEL_ID, true) as MarkersPanel;
		// TODO update the filter input box to only show diagnostics of the clicked owner
		// panel.updateFilter(filter);
	}

	get id(): string { return 'diagnostics'; }
	get label(): string { return localize('diagnostics', "Diagnostics"); }
	get contextValue(): any { return this; }
	get items(): IChecklistItemGroup[] { return [this.group]; }

	get onDidChange(): Event<void> { return this.didChange.event; }
	get onDidChangeItems(): Event<void> { return this.didChange.event; }

	getId(): string {
		return DiagnosticsChecklistProvider.ID;
	}
}
