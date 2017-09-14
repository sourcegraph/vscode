/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import * as AnalyticsConstants from 'vs/platform/telemetry/common/analyticsConstants';
import { TelligentWrapper } from 'vs/platform/telemetry/common/externalServices/telligentWrapper';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { optional } from 'vs/platform/instantiation/common/instantiation';

export interface INativeMetadata {
	[key: string]: string;
}

export interface ISourcegraphEventProperties {
	native?: INativeMetadata;
	[key: string]: any;
}

export class SourcegraphEventLogger implements ITelemetryAppender {
	private telligent: TelligentWrapper;

	constructor(
		private loggerLevel: string,
		@IStorageService private storageService: IStorageService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@optional(IConfigurationService) private configurationService: IConfigurationService
	) {
		this.telligent = new TelligentWrapper(environmentService);
	}

	atTopLevel(): boolean {
		return this.loggerLevel === AnalyticsConstants.WindowLevel.SharedProcess ||
			this.loggerLevel === AnalyticsConstants.WindowLevel.Main;
	}

	log(eventName: string, eventProperties?: ISourcegraphEventProperties): any {
		let event = AnalyticsConstants.SOURCEGRAPH_EVENT_MAP[eventName] || AnalyticsConstants.SOURCEGRAPH_EVENT_DEFAULT_MAP;

		// Check if this is an Action execution event that should be elevated to first-class event
		if (eventName === 'editorActionInvoked' && eventProperties.id &&
			Object.keys(AnalyticsConstants.SOURCEGRAPH_EAI_ACTION_IDS_TO_ELEVATE).indexOf(eventProperties.id) !== -1) {
			event = AnalyticsConstants.SOURCEGRAPH_EAI_ACTION_IDS_TO_ELEVATE[eventProperties.id];
			eventName = eventProperties.id;
		}

		if (event.eventCategory === AnalyticsConstants.EventCategory.View) {
			this.logView(eventProperties.page_title, eventProperties);
		} else if (event.shouldLog === undefined || event.shouldLog === true) {
			if (!event.topLevelOnly || this.atTopLevel()) {
				this.logEvent(event.eventCategory, event.eventAction, event.eventFeature, eventName, eventProperties);
			} else {
				if (this.environmentService.eventLogDebug) {
					console.warn(`Only logging "${eventName}" events at top level.`);
				}
			}
		} else {
			if (this.environmentService.eventLogDebug) {
				console.warn(`Not logging event: ${eventName}`);
			}
		}
	}

	logView(pageTitle: string, eventProperties?: ISourcegraphEventProperties): void {
		if (!pageTitle) {
			return;
		}

		const decoratedProps = this.decorateEventProperties(eventProperties);
		this.logToConsole(pageTitle, decoratedProps);
		this.telligent.track('view', decoratedProps);
	}

	logEvent(eventCategory: string, eventAction: string, eventFeature: string, eventLabel: string, eventProperties?: ISourcegraphEventProperties): void {
		if (!eventLabel) {
			return;
		}

		const decoratedProps = {
			...this.decorateEventProperties(eventProperties),
			eventLabel: eventLabel,
			eventFeature: eventFeature,
			eventCategory: eventCategory,
			eventAction: eventAction,
			// Override logger instance loggerLevel prop if the event was passed through an IPC channel from another level
			loggerLevel: eventProperties.loggerLevel ? eventProperties.loggerLevel : this.loggerLevel
		};

		this.logToConsole(eventLabel, decoratedProps);
		this.telligent.track(eventAction, decoratedProps);
	}

	logToConsole(event: string, eventProperties?: any): void {
		if (this.environmentService.eventLogDebug) {
			console.debug(`EVENT ${event} (${eventProperties.loggerLevel ? eventProperties.loggerLevel : this.loggerLevel})`, eventProperties);
		}
	}

	decorateEventProperties(props?: any): any {
		return props;
	}

	dispose(): any {
		this.telligent.dispose();
	}

}
