/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "vs/base/common/lifecycle";
import { ISearchProfileService, ISearchProfile, ISearchConfiguration } from "vs/platform/search/common/search";
import { IConfigurationService } from "vs/platform/configuration/common/configuration";
import Event, { Emitter } from "vs/base/common/event";
import { localize } from "vs/nls";
import * as arrays from "vs/base/common/arrays";
import * as strings from "vs/base/common/strings";
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

/**
 * A service which aggregates all the valid Search Profiles for a workspace.
 */
export class SearchProfileService extends Disposable implements ISearchProfileService {

	_serviceBrand: any;

	private static EMPTY_WORKSPACE_TEXT = localize('searchProfile.emptyWorkspace', "Open Files");
	private static CURRENT_WORKSPACE_TEXT = localize('searchProfile.currentWorkspace', "Current Workspace ({0})");
	public static CUSTOM_TEXT = localize('searchProfile.custom', "Custom");

	private didSearchProfilesChange = this._register(new Emitter<void>());
	public onDidSearchProfilesChange: Event<void> = this.didSearchProfilesChange.event;

	// Search profiles from user preferences
	private _fromConfig: ISearchProfile[] = [];

	// An ephemeral config, usually specified via URL parameters. Set via getProfileForWorkspaces
	private _custom: string[] = [];

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
	) {
		super();

		this._register(this.configurationService.onDidUpdateConfiguration(e => this.onConfigUpdated()));
		this.onConfigUpdated();
	}

	public getSearchProfiles(): ISearchProfile[] {
		let profiles: ISearchProfile[] = [];

		profiles.push({
			name: this.getCurrentWorkspaceText(),
			workspaces: [],
		});

		if (this._custom.length > 0) {
			profiles.push({
				name: SearchProfileService.CUSTOM_TEXT,
				description: localize('searchProfile.custom.description', "Manually Specified"),
				workspaces: this._custom,
			});
		}
		profiles = profiles.concat(this._fromConfig);
		return profiles;
	}

	private getCurrentWorkspaceText(): string {
		if (!this.contextService.hasWorkspace()) {
			return SearchProfileService.EMPTY_WORKSPACE_TEXT;
		}

		const roots = this.contextService.getWorkspace().roots;
		let text = SearchProfileService.CURRENT_WORKSPACE_TEXT;
		if (roots.length === 0 || roots.length > 1) {
			return text.replace('{0}', localize('searchProfile.currentWorkspace.multiple', "{0} Repositories", roots.length));
		}
		return text.replace('{0}', localize('searchProfile.currentWorkspace.single', "1 Repository"));
	}

	public getProfileForWorkspaces(workspaces: string[]): ISearchProfile {
		workspaces = this.normalize(workspaces);
		const workspacesSorted = workspaces.concat().sort();
		const profile = arrays.first(this.getSearchProfiles(), profile => {
			const sorted = profile.workspaces.concat().sort();
			return arrays.equals(sorted, workspacesSorted);
		});
		if (profile !== null) {
			return profile;
		}

		// We don't have a matching profile, so we update Custom.
		this._custom = workspaces;
		this.didSearchProfilesChange.fire();
		return {
			name: SearchProfileService.CUSTOM_TEXT,
			description: localize('searchProfile.custom.description', "Manually Specified"),
			workspaces: workspaces,
		};
	}

	private onConfigUpdated(): void {
		const fromConfig = (this.configurationService.getConfiguration<ISearchConfiguration>().search.profiles || []).map(profile => {
			return <ISearchProfile>{
				...profile,
				workspaces: this.normalize(profile.workspaces),
			};
		});
		if (!arrays.equals(fromConfig, this._fromConfig)) {
			this._fromConfig = fromConfig;
			this.didSearchProfilesChange.fire();
		}
	}

	private normalize(workspaces: string[]): string[] {
		return arrays.distinct((workspaces || []).map(workspace => {
			workspace = workspace.trim();
			if (!strings.startsWith(workspace, 'repo://')) {
				workspace = 'repo://' + workspace;
			}
			return workspace;
		}), s => s);
	}
}
