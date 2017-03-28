/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./welcomePage';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationEditingService } from 'vs/workbench/services/configuration/common/configurationEditing';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IMessageService } from 'vs/platform/message/common/message';
import { IExtensionEnablementService, IExtensionManagementService, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { used } from 'vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { DynamicOverlay } from "vs/workbench/parts/content/overlay/dynamicOverlay";
import { $ } from 'vs/base/browser/builder';


used();

const enabledKey = 'workbench.welcome.enabled';

export class WelcomePageContribution implements IWorkbenchContribution {

	constructor(
		@IPartService partService: IPartService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IBackupFileService backupFileService: IBackupFileService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		const enabled = configurationService.lookup<boolean>(enabledKey).value;
		if (enabled) {
			TPromise.join([
				backupFileService.hasBackups(),
				partService.joinCreation()
			]).then(([hasBackups]) => {
				const activeInput = editorService.getActiveEditorInput();
				if (!activeInput && !hasBackups) {
					instantiationService.createInstance(WelcomePage);
				}
			}).then(null, onUnexpectedError);
		}
	}

	public getId() {
		return 'vs.welcomePage';
	}
}

export class WelcomePageAction extends Action {

	public static ID = 'workbench.action.showWelcomePage';
	public static LABEL = localize('welcomePage', "Welcome");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		this.instantiationService.createInstance(WelcomePage);
		return null;
	}
}

class WelcomePage {

	private disposables: IDisposable[] = [];

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWindowService private windowService: IWindowService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IConfigurationEditingService private configurationEditingService: IConfigurationEditingService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IMessageService private messageService: IMessageService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		this.disposables.push(lifecycleService.onShutdown(() => this.dispose()));
		this.create();
	}

	private create() {
		console.log(`creating the dynamic overlay!`);
		const overlay = this.instantiationService.createInstance(DynamicOverlay);
		const builder = $('h2.title').text('Making dynamic components is awesome!');
		overlay.create(builder);
		overlay.show();
		// const recentlyOpened = this.windowService.getRecentlyOpen();
		// const installedKeymaps = this.instantiationService.invokeFunction(getInstalledKeymaps);
		// const uri = URI.parse(require.toUrl('./vs_code_welcome_page'))
		// 	.with({
		// 		scheme: Schemas.walkThrough,
		// 		query: JSON.stringify({ moduleId: 'vs/workbench/parts/welcome/page/electron-browser/vs_code_welcome_page' })
		// 	});
		// const input = this.instantiationService.createInstance(WalkThroughInput, localize('welcome.title', "Welcome"), '', uri, telemetryFrom, container => this.onReady(container, recentlyOpened, installedKeymaps));
		// this.editorService.openEditor(input, { pinned: true }, Position.ONE)
		// 	.then(null, onUnexpectedError);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
