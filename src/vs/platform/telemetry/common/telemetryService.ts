/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { escapeRegExpCharacters } from 'vs/base/common/strings';
import { ITelemetryService, ITelemetryInfo, ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import { optional, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { cloneAndChange } from 'vs/base/common/objects';
import { Registry } from 'vs/platform/registry/common/platform';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
// tslint:disable-next-line
import { IAuthConfiguration } from 'vs/workbench/services/codeComments/browser/git';

export interface ITelemetryServiceConfig {
	appender: ITelemetryAppender;
	commonProperties?: TPromise<{ [name: string]: any }>;
	piiPaths?: string[];
	userOptIn?: boolean;
}

export class TelemetryService implements ITelemetryService {

	static IDLE_START_EVENT_NAME = 'UserIdleStart';
	static IDLE_STOP_EVENT_NAME = 'UserIdleStop';

	private static CLEANUP_INDICATOR_STRING = '$DATA_REMOVED';

	_serviceBrand: any;

	protected _appender: ITelemetryAppender;
	protected _commonProperties: TPromise<{ [name: string]: any; }>;
	protected _piiPaths: string[];
	private _userOptIn: boolean;

	private _disposables: IDisposable[] = [];
	protected _cleanupPatterns: [RegExp, string][] = [];

	constructor(
		config: ITelemetryServiceConfig,
		@optional(IConfigurationService) protected _configurationService?: IConfigurationService,
		@optional(IEnvironmentService) protected _environmentService?: IEnvironmentService,
	) {
		this._appender = config.appender;
		this._commonProperties = config.commonProperties || TPromise.as({});
		this._piiPaths = config.piiPaths || [];
		this._userOptIn = typeof config.userOptIn === 'undefined' ? true : config.userOptIn;

		// static cleanup patterns for:
		// #1 `file:///DANGEROUS/PATH/resources/app/Useful/Information`
		// #2 // Any other file path that doesn't match the approved form above should be cleaned.
		// #3 "Error: ENOENT; no such file or directory" is often followed with PII, clean it
		this._cleanupPatterns.push(
			[/file:\/\/\/.*?\/resources\/app\//gi, ''],
			[/file:\/\/\/.*/gi, ''],
			[/ENOENT: no such file or directory.*?\'([^\']+)\'/gi, 'ENOENT: no such file or directory'],
			// Add static cleanup patterns for remote urls. Add CLEANUP_INDICATOR_STRING to help
			// identify and remove these from the source.
			[/git:\/\/.*/gi, `git://${TelemetryService.CLEANUP_INDICATOR_STRING}`],
			[/repo:\/\/.*/gi, `repo://${TelemetryService.CLEANUP_INDICATOR_STRING}`],
			[/(https:\/\/)?(www\.)?github.com\/.*/gi, `github.com//${TelemetryService.CLEANUP_INDICATOR_STRING}`],
			[/Repository not found:.*/gi, `Repository not found: ${TelemetryService.CLEANUP_INDICATOR_STRING}`],
			[/Revision not found:.*/gi, `Revision not found: ${TelemetryService.CLEANUP_INDICATOR_STRING}`],
			[/Unable to open '[^']*': commit information not available for repo.*/gi, `Unable to open: ${TelemetryService.CLEANUP_INDICATOR_STRING}: commit information not available for repo ${TelemetryService.CLEANUP_INDICATOR_STRING}`],
			[/Unable to open '[^']*'.*/gi, `Unable to open: ${TelemetryService.CLEANUP_INDICATOR_STRING}`]
		);

		for (let piiPath of this._piiPaths) {
			this._cleanupPatterns.push([new RegExp(escapeRegExpCharacters(piiPath), 'gi'), '']);
		}

		if (this._configurationService) {
			this._updateUserOptIn();
			this._configurationService.onDidUpdateConfiguration(this._updateUserOptIn, this, this._disposables);
			this.publicLog('optInStatus', { optIn: this._userOptIn });
		}
	}

	private _updateUserOptIn(): void {
		const config = this._configurationService.getConfiguration<any>(TELEMETRY_SECTION_ID);
		this._userOptIn = config ? config.enableTelemetry : this._userOptIn;
	}

	get isOptedIn(): boolean {
		return this._userOptIn;
	}

	getTelemetryInfo(): TPromise<ITelemetryInfo> {
		return this._commonProperties.then(values => {
			// well known properties
			let sessionId = values['sessionID'];
			let instanceId = values['common.instanceId'];
			let machineId = values['common.machineId'];

			return { sessionId, instanceId, machineId };
		});
	}

	dispose(): void {
		this._disposables = dispose(this._disposables);
	}

	publicLog(eventName: string, data?: ITelemetryData): TPromise<any> {
		// don't send events when the user is optout
		if (!this._userOptIn) {
			if (this._environmentService && this._environmentService.eventLogDebug) {
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
			if (this._configurationService) {
				const config = this._configurationService.getConfiguration<IAuthConfiguration>();
				if (config && config.auth && config.auth.displayName) {
					data.native.git_auth_displayName = config.auth.displayName;
				}
				if (config && config.auth && config.auth.email) {
					data.native.git_auth_email = config.auth.email;
				}
			}

			this._appender.log(eventName, data);

		}, err => {
			// unsure what to do now...
			console.error(err);
		});
	}

	protected _cleanupInfo(stack: string): string {

		// sanitize with configured cleanup patterns
		for (let tuple of this._cleanupPatterns) {
			let [regexp, replaceValue] = tuple;
			stack = stack.replace(regexp, replaceValue);
		}

		return stack;
	}
}


export const TELEMETRY_SECTION_ID = 'telemetry';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	'id': TELEMETRY_SECTION_ID,
	'order': 110,
	'type': 'object',
	'title': localize('telemetryConfigurationTitle', "Telemetry"),
	'properties': {
		'telemetry.enableTelemetry': {
			'type': 'boolean',
			'description': localize('telemetry.enableTelemetry', "Enable usage data and errors to be sent to Sourcegraph."),
			'default': true
		}
	}
});

CommandsRegistry.registerCommand('_telemetry.publicLog', function (accessor: ServicesAccessor, eventName: string, data?: ITelemetryData) {
	const telemetryService = accessor.get(ITelemetryService);
	telemetryService.publicLog(eventName, data);
});
