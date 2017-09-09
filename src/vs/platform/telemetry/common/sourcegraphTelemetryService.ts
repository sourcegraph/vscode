/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITelemetryService, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { optional } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TPromise } from 'vs/base/common/winjs.base';
import { cloneAndChange } from 'vs/base/common/objects';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TelemetryService, ITelemetryServiceConfig } from 'vs/platform/telemetry/common/telemetryService';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { IEditorInput } from 'vs/platform/editor/common/editor';
// tslint:disable-next-line
import { IFileEditorInput } from 'vs/workbench/common/editor';
// tslint:disable-next-line
import { EditorPart } from 'vs/workbench/browser/parts/editor/editorPart';
import { IAuthConfiguration } from 'vs/workbench/services/codeComments/browser/git';

const CLEANUP_INDICATOR_STRING = '$DATA_REMOVED';

export class SourcegraphTelemetryService extends TelemetryService implements ITelemetryService {
	constructor(
		config: ITelemetryServiceConfig,
		@IEnvironmentService protected _environmentService: IEnvironmentService,
		@optional(IConfigurationService) protected _configurationService: IConfigurationService,
	) {
		super(config, _configurationService);

		// Add CLEANUP_INDICATOR_STRING to every matching pattern. This is so we can see where
		// this data may be being passed in, so we can eliminate it from the source.
		this._cleanupPatterns = this._cleanupPatterns.map<[RegExp, string]>(v => [v[0], `${v[1]}${CLEANUP_INDICATOR_STRING}`]);

		// Add static cleanup patterns for remote urls:
		this._cleanupPatterns.push(
			[/git:\/\/.*/gi, `git://${CLEANUP_INDICATOR_STRING}`],
			[/(https:\/\/)?(www\.)?github.com\/.*/gi, `github.com//${CLEANUP_INDICATOR_STRING}`],
			[/Repository not found:.*/gi, `Repository not found: ${CLEANUP_INDICATOR_STRING}`],
			[/Revision not found:.*/gi, `Revision not found: ${CLEANUP_INDICATOR_STRING}`],
			[/Unable to open '[^']*': commit information not available for repo.*/gi, `Unable to open: ${CLEANUP_INDICATOR_STRING}: commit information not available for repo ${CLEANUP_INDICATOR_STRING}`],
			[/Unable to open '[^']*'.*/gi, `Unable to open: ${CLEANUP_INDICATOR_STRING}`]
			// TODO(Dan): analyze usage data to confirm this list is comprehensive
		);
	}

	/**
	 * Override publicLog to add debug logging and custom native app data handling
	 * Retain all data cleansing and opt out validation
	 */
	publicLog(eventName: string, data?: ITelemetryData): TPromise<any> {
		// don't send events when the user is optout
		if (!this.isOptedIn) {
			if (this._environmentService.eventLogDebug) {
				console.log(`User has opted out, not logging: ${eventName}`);
			}
			return TPromise.as(undefined);
		}

		return this._commonProperties.then(values => {

			// (first) add common properties
			data = { ...data, native: values };

			// (last) remove all PII from data
			data = cloneAndChange(data, value => {
				if (typeof value === 'string') {
					return this._cleanupInfo(value);
				}
				return undefined;
			});

			// TODO(Dan) determine if we should remove this section before launch, we
			// will replace with sourcegraph accounts
			const config = this._configurationService.getConfiguration<IAuthConfiguration>();
			if (config && config.auth && config.auth.displayName) {
				data.native.git_auth_displayName = config.auth.displayName;
			}
			if (config && config.auth && config.auth.email) {
				data.native.git_auth_email = config.auth.email;
			}

			this._appender.log(eventName, data);

		}, err => {
			// unsure what to do now...
			console.error(err);
		});
	}

	/**
	 * Called after the global workbench EditorPart is instantiated to log pageview events
	 */
	registerEditorServiceEventListeners(editorService: EditorPart): void {
		editorService.onEditorsChanged(e => {
			const input = editorService.getActiveEditorInput();
			let params: any = {
				page_title: 'ViewOther'
			};
			if (input && isIFileEditorInput(input)) {
				const uriDescriptor = telemetryURIDescriptor(input.getResource());
				params = {
					page_title: 'ViewFile',
					path_name: uriDescriptor.path,
					language: uriDescriptor.ext.slice(1)
				};
			}

			this.publicLog('ViewFile', params);
		});
	}
}

function isIFileEditorInput(object: IEditorInput): object is IFileEditorInput {
	return 'getResource' in object && typeof object['getResource'] === 'function'
		&& 'setPreferredEncoding' in object && typeof object['setPreferredEncoding'] === 'function'
		&& 'setForceOpenAsBinary' in object && typeof object['setForceOpenAsBinary'] === 'function';
}

