/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./dynamicContent';
import URI from 'vs/base/common/uri';
import { escape } from 'vs/base/common/strings';
import { DynamicContentInput } from 'vs/workbench/parts/content/dynamicContentInput';
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
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IFileService } from 'vs/platform/files/common/files';
import { setContent } from 'vs/workbench/parts/content/vs_code_dynamic_content_page';

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
		@ITelemetryService private telemetryService: ITelemetryService,
		@IFileService private fileService: IFileService
	) {
		this.disposables.push(lifecycleService.onShutdown(() => this.dispose()));
		this.create();
	}

	private create() {
		const recentlyOpened = this.windowService.getRecentlyOpen();
		const uri = URI.parse(require.toUrl('./vs_code_dynamic_content_page'))
			.with({
				scheme: Schemas.dynamicContent,
				query: JSON.stringify({ moduleId: 'vs/workbench/parts/content/vs_code_dynamic_content_page' })
			});
		setContent(staticContent);
		const input = this.instantiationService.createInstance(DynamicContentInput, localize('welcome.title', "Dynamic Content"), '', uri, staticContent, telemetryFrom, container => this.onReady(container, recentlyOpened));
		this.editorService.openEditor(input, { pinned: true }, Position.ONE)
			.then(null, onUnexpectedError);
	}

	private onReady(container: HTMLElement, recentlyOpened: TPromise<{ files: string[]; folders: string[]; }>): void {
		const showOnStartup = <HTMLInputElement>container.querySelector('#showOnStartup');
		if (showOnStartup) {
			showOnStartup.addEventListener('click', e => {
				this.configurationEditingService.writeConfiguration(ConfigurationTarget.USER, { key: enabledKey, value: showOnStartup.checked })
					.then(null, error => this.messageService.show(Severity.Error, error));
			});
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export const staticContent = `
<div class="welcomePageContainer">
	<div class="welcomePage">
		<div class="title">
			<h1>${escape(localize('welcomePage.vscode', "Sourcegraph!"))}</h1>
			<p class="subtitle">${escape(localize('welcomePage.editingEvolved', "Editing evolved"))}</p>
		</div>
		<div class="row">
			<div class="splash">
				<div class="section start">
					<h2>${escape(localize('welcomePage.start', "Start"))}</h2>
					<ul>
						<li><a href="command:workbench.action.files.newUntitledFile">${escape(localize('welcomePage.newFile', "New file"))}</a></li>
						<li class="mac-only"><a href="command:workbench.action.files.openFileFolder">${escape(localize('welcomePage.openFolder', "Open folder..."))}</a></li>
						<li class="windows-only linux-only"><a href="command:workbench.action.files.openFolder">${escape(localize('welcomePage.openFolder', "Open folder..."))}</a></li>
						<li class="git-only"><a href="command:workbench.action.git.clone">${escape(localize('welcomePage.cloneGitRepository', "Clone Git repository..."))}</a></li>
						<li class="scm-only"><a href="command:git.clone">${escape(localize('welcomePage.cloneGitRepository', "Clone Git repository..."))}</a></li>
					</ul>
				</div>
				<div class="section recent">
					<h2>${escape(localize('welcomePage.recent', "Recent"))}</h2>
					<ul class="list">
						<!-- Filled programmatically -->
					</ul>
					<p class="none">${escape(localize('welcomePage.noRecentFolders', "No recent folders"))}</p>
				</div>
				<div class="section help">
					<h2>${escape(localize('welcomePage.help', "Help"))}</h2>
					<ul>
						<li><a href="command:workbench.action.openDocumentationUrl">${escape(localize('welcomePage.productDocumentation', "Product documentation"))}</a></li>
						<li><a href="command:workbench.action.openIntroductoryVideosUrl">${escape(localize('welcomePage.introductoryVideos', "Introductory videos"))}</a></li>
						<li><a href="https://github.com/Microsoft/vscode">${escape(localize('welcomePage.gitHubRepository', "GitHub repository"))}</a></li>
						<li><a href="http://stackoverflow.com/questions/tagged/vscode?sort=votes&pageSize=50">${escape(localize('welcomePage.stackOverflow', "Stack Overflow"))}</a></li>
					</ul>
				</div>
				<p class="showOnStartup"><input type="checkbox" id="showOnStartup"> <label for="showOnStartup">${escape(localize('welcomePage.showOnStartup', "Show welcome page on startup"))}</label></p>
			</div>
			<div class="commands">
				<h2>${escape(localize('welcomePage.quickLinks', "Quick links"))}</h2>
				<ul>
					<li class="showInteractivePlayground"><button data-href="command:workbench.action.showInteractivePlayground"><h3>${escape(localize('welcomePage.interactivePlayground', "Interactive playground"))}</h3> <span>${escape(localize('welcomePage.interactivePlaygroundDescription', "Try essential editor features out in a short walkthrough"))}</span></button></li>
					<li class="showInterfaceOverview"><button data-href="command:workbench.action.showDynamicInterfaceOverview"><h3>${escape(localize('welcomePage.interfaceOverview', "Interface overview"))}</h3> <span>${escape(localize('welcomePage.interfaceOverviewDescription', "Get a visual overlay highlighting the major components of the UI"))}</span></button></li>
					<li class="selectTheme"><button data-href="command:workbench.action.selectTheme"><h3>${escape(localize('welcomePage.colorTheme', "Color theme"))}</h3> <span>${escape(localize('welcomePage.colorThemeDescription', "Make the editor and your code look the way you love"))}</span></button></li>
					<li class="keybindingsReference"><button data-href="command:workbench.action.keybindingsReference"><h3>${escape(localize('welcomePage.keybindingsReference', "Keyboard shortcuts reference"))}</h3> <span>${escape(localize('welcomePage.keybindingsReferenceDescription', "A printable PDF with the most common keyboard shortcuts"))}</span></button></li>
					<li class="showCommands"><button data-href="command:workbench.action.showCommands"><h3>${escape(localize('welcomePage.showCommands', "Find and run all commands"))}</h3> <span>${escape(localize('welcomePage.showCommandsDescription', "Rapidly access and search commands from the control panel ({0})")).replace('{0}', '<span class="shortcut" data-command="workbench.action.showCommands"></span>')}</span></button></li>
					<li class="openGlobalSettings"><button data-href="command:workbench.action.openGlobalSettings"><h3>${escape(localize('welcomePage.configureSettings', "Configure settings"))}</h3> <span>${escape(localize('welcomePage.configureSettingsDescription', "Unlock the full power of VS Code by tweaking the settings"))}</span></button></li>
					<li class="showRecommendedKeymapExtensions"><button data-href="command:workbench.extensions.action.showRecommendedKeymapExtensions"><h3>${escape(localize('welcomePage.installKeymapDescription', "Install keyboard shortcuts"))}</h3> <span>${escape(localize('welcomePage.installKeymap', "Install the keyboard shortcuts of {0}, {1}, {2} and {3}"))
		.replace('{0}', `<a class="installKeymap" data-keymap-name="${escape(localize('welcomePage.vim', "Vim"))}" data-keymap="vscodevim.vim" href="javascript:void(0)">${escape(localize('welcomePage.vim', "Vim"))}</a><span class="currentKeymap" data-keymap="vscodevim.vim">${escape(localize('welcomePage.vimCurrent', "Vim (current)"))}</span>`)
		.replace('{1}', `<a class="installKeymap" data-keymap-name="${escape(localize('welcomePage.sublime', "Sublime"))}" data-keymap="ms-vscode.sublime-keybindings" href="javascript:void(0)">${escape(localize('welcomePage.sublime', "Sublime"))}</a><span class="currentKeymap" data-keymap="ms-vscode.sublime-keybindings">${escape(localize('welcomePage.sublimeCurrent', "Sublime (current)"))}</span>`)
		.replace('{2}', `<a class="installKeymap" data-keymap-name="${escape(localize('welcomePage.atom', "Atom"))}" data-keymap="ms-vscode.atom-keybindings" href="javascript:void(0)">${escape(localize('welcomePage.atom', "Atom"))}</a><span class="currentKeymap" data-keymap="ms-vscode.atom-keybindings">${escape(localize('welcomePage.atomCurrent', "Atom (current)"))}</span>`)
		.replace('{3}', `<a href="command:workbench.extensions.action.showRecommendedKeymapExtensions">${escape(localize('welcomePage.others', "others"))}</a>`)}
					</span></button></li>
				</ul>
			</div>
		</div>
	</div>
</div>
`;