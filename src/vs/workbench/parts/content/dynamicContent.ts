/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// import 'vs/css!./dynamicContent';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { DynamicOverlay } from 'vs/workbench/parts/content/overlay/dynamicOverlay';
import { $, Builder } from 'vs/base/browser/builder';

export class DynamicContentContribution implements IWorkbenchContribution {

	private _overlay: Builder;

	constructor(
		@IPartService partService: IPartService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IBackupFileService backupFileService: IBackupFileService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		TPromise.join([
			backupFileService.hasBackups(),
			partService.joinCreation()
		]).then(([hasBackups]) => {
			const activeInput = editorService.getActiveEditorInput();
			if (!activeInput && !hasBackups) {
				console.log(`creating the dynamic overlay!`);
				const overlay = instantiationService.createInstance(DynamicOverlay);
				this._overlay = $('h2.title').text('Making dynamic components is awesome!');
				overlay.create(this._overlay);
				overlay.show();
			}
		}).then(null, onUnexpectedError);
	}

	public getId() {
		return 'vs.dynamicContentPage';
	}
}
