/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/searchviewlet';
import { Builder } from 'vs/base/browser/builder';
import Event, { Emitter } from 'vs/base/common/event';
import { localize } from 'vs/nls';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { Widget } from 'vs/base/browser/ui/widget';
import { inputBackground, inputForeground } from 'vs/platform/theme/common/colorRegistry';
import { SelectBox } from "vs/base/browser/ui/selectBox/selectBox";
import { ISearchProfile, ISearchProfileService } from "vs/platform/search/common/search";
import * as arrays from "vs/base/common/arrays";
import * as errors from 'vs/base/common/errors';
import { IPreferencesService } from "vs/workbench/parts/preferences/common/preferences";
import { PreferencesEditor } from "vs/workbench/parts/preferences/browser/preferencesEditor";
import { ITelemetryService } from "vs/platform/telemetry/common/telemetry";

export class SearchProfilePickerWidget extends Widget {

	private static EDIT_TEXT = localize('searchProfilePicker.edit', "Edit search groups");

	private container: HTMLElement;
	private reposDidChange = this._register(new Emitter<void>());
	private selectBox: SelectBox = this._register(new SelectBox([SearchProfilePickerWidget.EDIT_TEXT], 0));
	private _profiles: ISearchProfile[] = [];
	private _selected: string = '';

	/**
	 * An event that is fired when the selected workspace has changed.
	 */
	public onWorkspacesDidChange: Event<void> = this.reposDidChange.event;

	constructor(
		selected: string,
		@IPreferencesService private preferencesService: IPreferencesService,
		@ISearchProfileService private searchProfileService: ISearchProfileService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		super();

		this._register(searchProfileService.onDidSearchProfilesChange(() => this.update(this._selected)));
		this.update(selected, false);
	}

	public create(parent: Builder): void {
		this._register(this.selectBox.onDidSelect(s => {
			this.selected = s.selected;
			this.telemetryService.publicLog('codeSearch.profilePicker.selected');
		}));
		parent.element('h4', { text: localize('searchProfilePicker.title', "repositories to search") });
		parent.div({ class: 'search-profile-picker-widget' }, div => {
			this.container = div.getHTMLElement();
			this.selectBox.render(this.container);
		});
	}

	public get selected(): string {
		return this._selected;
	}

	public set selected(selected: string) {
		if (selected === SearchProfilePickerWidget.EDIT_TEXT) {
			selected = this._selected;
			this.preferencesService.openGlobalSettings().done(editor => {
				if (editor instanceof PreferencesEditor) {
					editor.focusSearch('search.profiles');
				}
			}, errors.onUnexpectedError);
		}
		this.update(selected);
	}

	/**
	 * Updates the state, followed by updating select box and firing events if necessary.
	 */
	private update(selected: string, notify = true) {
		const before = this.workspaces;
		const profiles = this.searchProfileService.getSearchProfiles();
		const entries = profiles.map(profile => profile.name).concat([SearchProfilePickerWidget.EDIT_TEXT]);

		let selectedIdx = entries.indexOf(selected);
		if (selectedIdx < 0) {
			selectedIdx = 0;
		}
		this._profiles = profiles;
		this._selected = entries[selectedIdx];

		this.selectBox.setOptions(entries, selectedIdx);
		const after = this.workspaces;
		if (notify && !arrays.equals(before, after)) {
			this.reposDidChange.fire();
		}
	}

	/**
	 * Updates the select box to the profile which matches workspaces.
	 * If no such profile exists, the custom entry is added/updated.
	 */
	public set workspaces(workspaces: string[]) {
		const profile = this.searchProfileService.getProfileForWorkspaces(workspaces);
		this.update(profile.name);
	}

	/**
	 * Returns an array of selected workspaces.
	 */
	public get workspaces(): string[] {
		return this.getSelectedProfile().workspaces.concat();
	}

	public getSelectedProfile(): ISearchProfile {
		return arrays.first(this._profiles, profile => profile.name === this._selected, {
			name: '',
			workspaces: [],
		});
	}
}

registerThemingParticipant((theme, collector) => {
	const inputBackgroundColor = theme.getColor(inputBackground, true);
	if (inputBackgroundColor) {
		collector.addRule(`.search-profile-picker-widget .select-box { background-color: ${inputBackgroundColor}; }`);
	}
	const inputForegroundColor = theme.getColor(inputForeground, true);
	if (inputForegroundColor) {
		collector.addRule(`.search-profile-picker-widget .select-box { color: ${inputForegroundColor}; }`);
	}
});
