/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./dynamicContent';
import URI from 'vs/base/common/uri';
import { WalkThroughInput } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughInput';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IConfigurationEditingService, ConfigurationTarget } from 'vs/workbench/services/configuration/common/configurationEditing';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Schemas } from 'vs/base/common/network';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { getInstalledKeymaps, IKeymapExtension, onKeymapExtensionChanged } from 'vs/workbench/parts/extensions/electron-browser/keymapExtensions';
import { used } from 'vs/workbench/parts/content/vs_code_dynamic_content_page';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

used();

const enabledKey = 'workbench.dynamicContent.enabled';
const telemetryFrom = 'dynamicContent';

export class DynamicContentContribution implements IWorkbenchContribution {

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
					instantiationService.createInstance(DynamicContentPage);
				}
			}).then(null, onUnexpectedError);
		}
	}

	public getId() {
		return 'vs.dynamicContentPage';
	}
}

export class DynamicContentAction extends Action {

	public static ID = 'workbench.action.showdynamicContentPage';
	public static LABEL = localize('dynamicContentPage', "Welcome");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		this.instantiationService.createInstance(DynamicContentPage);
		return null;
	}
}

const reorderedQuickLinks = [
	'showInterfaceOverview',
	'selectTheme',
	'showRecommendedKeymapExtensions',
	'showCommands',
	'keybindingsReference',
	'openGlobalSettings',
	'showInteractivePlayground',
];

class DynamicContentPage {

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
		@ILifecycleService lifecycleService: ILifecycleService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		this.disposables.push(lifecycleService.onShutdown(() => this.dispose()));
		this.create();
	}

	private create() {
		const recentlyOpened = this.windowService.getRecentlyOpen();
		const installedKeymaps = this.instantiationService.invokeFunction(getInstalledKeymaps);
		const uri = URI.parse(require.toUrl('./vs_code_dynamic_content_page'))
			.with({
				scheme: Schemas.walkThrough,
				query: JSON.stringify({ moduleId: 'vs/workbench/parts/content/vs_code_dynamic_content_page' })
			});
		const input = this.instantiationService.createInstance(WalkThroughInput, localize('welcome.title', "Dynamic Content"), '', uri, telemetryFrom, container => this.onReady(container, recentlyOpened, installedKeymaps));
		this.editorService.openEditor(input, { pinned: true }, Position.ONE)
			.then(null, onUnexpectedError);
	}

	private onReady(container: HTMLElement, recentlyOpened: TPromise<{ files: string[]; folders: string[]; }>, installedKeymaps: TPromise<IKeymapExtension[]>): void {
		const showOnStartup = <HTMLInputElement>container.querySelector('#showOnStartup');
		showOnStartup.setAttribute('checked', 'checked');
		showOnStartup.addEventListener('click', e => {
			this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: enabledKey, value: showOnStartup.checked })
				.then(null, error => this.messageService.show(Severity.Error, error));
		});

		if (this.telemetryService.getExperiments().reorderQuickLinks) {
			reorderedQuickLinks.forEach(clazz => {
				const link = container.querySelector(`.commands .${clazz}`);
				if (link) {
					link.parentElement.appendChild(link);
				}
			});
		}

		container.addEventListener('click', event => {
			for (let node = event.target as HTMLElement; node; node = node.parentNode as HTMLElement) {
				if (node instanceof HTMLAnchorElement && node.classList.contains('installKeymap')) {
					const keymapName = node.getAttribute('data-keymap-name');
					const keymapIdentifier = node.getAttribute('data-keymap');
					if (keymapName && keymapIdentifier) {
						event.preventDefault();
						event.stopPropagation();
					}
				}
			}
		});

		this.updateInstalledKeymaps(container, installedKeymaps);
		this.disposables.push(this.instantiationService.invokeFunction(onKeymapExtensionChanged)(ids => {
			for (const id of ids) {
				if (container.querySelector(`.installKeymap[data-keymap="${id}"], .currentKeymap[data-keymap="${id}"]`)) {
					const installedKeymaps = this.instantiationService.invokeFunction(getInstalledKeymaps);
					this.updateInstalledKeymaps(container, installedKeymaps);
					break;
				}
			};
		}));
	}

	private updateInstalledKeymaps(container: HTMLElement, installedKeymaps: TPromise<IKeymapExtension[]>) {
		installedKeymaps.then(extensions => {
			const elements = container.querySelectorAll('.installKeymap, .currentKeymap');
			for (let i = 0; i < elements.length; i++) {
				elements[i].classList.remove('installed');
			}
			extensions.filter(ext => ext.globallyEnabled)
				.map(ext => ext.identifier)
				.forEach(id => {
					const install = container.querySelector(`.installKeymap[data-keymap="${id}"]`);
					if (install) {
						install.classList.add('installed');
					}
					const current = container.querySelector(`.currentKeymap[data-keymap="${id}"]`);
					if (current) {
						current.classList.add('installed');
					}
				});
		}).then(null, onUnexpectedError);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
