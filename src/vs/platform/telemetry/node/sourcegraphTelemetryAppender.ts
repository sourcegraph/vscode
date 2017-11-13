/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { ITelemetryAppender } from 'vs/platform/telemetry/common/telemetryUtils';
import * as TelemetryConstants from 'vs/platform/telemetry/common/telemetryConstants';
import { TelligentWrapper } from 'vs/platform/telemetry/node/externalServices/telligentWrapper';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

export interface INativeMetadata {
	[key: string]: string;
}

export interface ISourcegraphTelemetryProperties {
	native?: INativeMetadata;
	[key: string]: any;
}

export class SourcegraphTelemetryAppender implements ITelemetryAppender {
	private telligent: TelligentWrapper;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
	) {
		this.telligent = new TelligentWrapper(environmentService);
	}

	log(eventName: string, eventProperties?: ISourcegraphTelemetryProperties): any {
		if (!eventName) {
			return;
		}

		// Check if this is an Action execution event that should be elevated to first-class event.
		if (eventName === 'editorActionInvoked' && eventProperties.id && TelemetryConstants.EAI_ACTION_IDS_TO_ELEVATE.indexOf(eventProperties.id) !== -1) {
			eventName = eventProperties.id;
		}

		// Check if this is a workbench Action that should be skipped.
		if (eventName === 'workbenchActionExecuted' && eventProperties.id && TelemetryConstants.WBA_ACTION_IDS_TO_SKIP.indexOf(eventProperties.id) !== -1) {
			return;
		}

		// Check if this event should be skipped.
		if (TelemetryConstants.EVENTS_TO_SKIP.indexOf(eventName) !== -1) {
			if (this.environmentService.eventLogDebug) {
				console.warn(`Not logging event: ${eventName}`);
			}
			return;
		}

		let eventType;
		if (eventName.indexOf('View') === 0) {
			eventType = 'view';
			eventProperties = { ...eventProperties, page_title: eventName };
		} else {
			eventType = eventName;
			eventProperties = { ...eventProperties, event_label: eventName };
		}

		this.logToConsole(eventName, eventProperties);
		this.telligent.log(eventType, eventProperties);
	}

	logToConsole(event: string, eventProperties?: any): void {
		if (this.environmentService.eventLogDebug) {
			console.debug(`EVENT ${event}`, eventProperties);
		}
	}

	dispose(): any {
		this.telligent.dispose();
	}
}
