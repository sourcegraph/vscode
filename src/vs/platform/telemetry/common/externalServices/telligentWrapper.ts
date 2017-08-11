/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// tslint:disable-next-line:import-patterns
import * as telligent from 'telligent-tracker';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ISourcegraphEventProperties, INativeMetadata } from 'vs/platform/telemetry/common/sourcegraphEventLogger';

const TELLIGENT_FUNCTION_NAME = 'telligent';
const TELLIGENT_PLATFORM = 'NativeApp';
const DEFAULT_ENV: string = 'development';
const PROD_ENV: string = 'production';
const DEFAULT_APP_ID: string = 'UnknownApp';

/**
 * TelligentWrapper should be instantiated in each process
 */
export class TelligentWrapper {
	private telligent: (...args: any[]) => void | null;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		const win = window.top;
		// Create the initializing function
		win[TELLIGENT_FUNCTION_NAME] = function (): void {
			(win[TELLIGENT_FUNCTION_NAME].q = win[TELLIGENT_FUNCTION_NAME].q || []).push(arguments);
		};


		// Set up the initial queue, if it doesn't already exist
		win[TELLIGENT_FUNCTION_NAME].q = telligent.Telligent((win[TELLIGENT_FUNCTION_NAME].q || []), TELLIGENT_FUNCTION_NAME);

		this.telligent = win[TELLIGENT_FUNCTION_NAME];

		let appId: string;
		let env: string;
		// TODO(Dan): will we have a separate var for Sourcegraph dev vs prod env?
		if (!this.environmentService.isBuilt) {
			appId = DEFAULT_APP_ID;
			env = DEFAULT_ENV;
		} else {
			// TODO(Dan): update this once available
			appId = 'SourcegraphWeb'; //this.environmentService.sourcegraphContext.trackingAppID;
			env = PROD_ENV;
		}

		if (appId && env) {
			this.initialize(appId, env);
		}
	}

	isTelligentLoaded(): boolean {
		return Boolean(this.telligent);
	}

	setUserId(loginInfo: string): void {
		if (!this.telligent) {
			return;
		}
		this.telligent('setUserId', loginInfo);
	}

	addStaticMetadataObject(metadata: any): void {
		if (!this.telligent) {
			return;
		}
		this.telligent('addStaticMetadataObject', metadata);
	}

	private addStaticMetadata(property: string, value: string, command: string): void {
		if (!this.telligent) {
			return;
		}
		this.telligent('addStaticMetadata', property, value, command);
	}

	setUserProperty(property: string, value: any): void {
		this.addStaticMetadata(property, value, 'userInfo');
	}

	/**
	 * Track an event using generated Telligent tracker
	 * @param eventAction User action being tracked
	 * @param eventProps Event-level properties. Note the provided object is mutated by this method
	 */
	track(eventAction: string, eventProps?: ISourcegraphEventProperties): void {
		if (!this.telligent) {
			return;
		}

		// Separate out native/common metadata
		let nativeMetadata: INativeMetadata;
		if (eventProps && eventProps.native) {
			nativeMetadata = eventProps.native;
			delete eventProps.native;
		}

		// TODO(Dan): validate white list — Does umami need one?
		// // for an on-prem trial, we only want to collect high level usage information
		// // if we are keeping data onsite anyways, we can collect all info
		// if (this.environmentService.sourcegraphContext.onPrem && this.environmentService.sourcegraphContext.trackingAppID !== 'UmamiWeb') {
		// 	// if a user using teensy-Sourcegraph specifies no tracking ID, we won't log either.
		// 	if (!this.environmentService.sourcegraphContext.trackingAppID) {
		// 		return;
		// 	}
		// 	const limitedEventProps = {
		// 		event_action: eventProps.eventAction,
		// 		event_category: eventProps.eventCategory,
		// 		event_label: eventProps.eventLabel,
		// 		language: eventProps.language,
		// 		platform: eventProps.platform,
		// 		repo: eventProps.repo,
		// 		path_name: eventProps.path_name,
		// 		page_title: eventProps.page_title,
		// 	};
		// 	this.telligent('track', eventAction, limitedEventProps);
		// 	return;
		// }

		this.telligent('track', eventAction, eventProps, { native: nativeMetadata });
	}

	/**
	 * Initialize the Telligent tracker that is used by this window and all of its child
	 * iframes. This should only be called in the topmost window (otherwise a noisy
	 * warning will be logged).
	 */
	private initialize(appId: string, env: string): void {
		if (!this.telligent) {
			return;
		}

		let telligentUrl = 'sourcegraph-logging.telligentdata.com';

		// TODO(Dan): What do these checks look like in the native app world? What URL do we use?
		// for clients with on-prem deployments, we use a bi-logger
		if (this.environmentService.sourcegraphContext.onPrem && this.environmentService.sourcegraphContext.trackingAppID === 'UmamiWeb') {
			telligentUrl = `${window.top.location.host}`.concat('/.bi-logger');
		}

		try {
			this.telligent('newTracker', 'sg', telligentUrl, {
				appId: appId,
				platform: TELLIGENT_PLATFORM,
				encodeBase64: false,
				env: env,
				forceSecureTracker: true
			});
		} catch (err) {
			this.telligent = null;
			if (this.environmentService.eventLogDebug) {
				console.warn(`Error encountered initializing telemetry: ${err}`);
			}
		}
	}

	dispose(): void {
		if (!this.telligent) {
			return;
		}
		this.telligent('flushBuffer');
		this.telligent = null;
	}
}
