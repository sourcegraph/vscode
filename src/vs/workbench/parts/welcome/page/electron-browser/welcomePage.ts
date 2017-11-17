/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/base/browser/ui/octiconLabel/octicons/octicons';
import 'vs/css!./sgWelcomePage';
import URI from 'vs/base/common/uri';
import * as arrays from 'vs/base/common/arrays';
import { WalkThroughInput } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughInput';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError, isPromiseCanceledError } from 'vs/base/common/errors';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { Action } from 'vs/base/common/actions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Schemas } from 'vs/base/common/network';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { IMessageService, Severity, CloseAction } from 'vs/platform/message/common/message';
import { getInstalledExtensions, IExtensionStatus, onExtensionChanged, isKeymapExtension } from 'vs/workbench/parts/extensions/electron-browser/extensionsUtils';
import { IExtensionEnablementService, IExtensionManagementService, IExtensionGalleryService, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { used } from 'vs/workbench/parts/welcome/page/electron-browser/sg_welcome_page';
import { ILifecycleService, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IThemeService, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { registerColor, focusBorder, textLinkForeground, textLinkActiveForeground, foreground, descriptionForeground, contrastBorder, activeContrastBorder, welcomeButtonBackground, inputBackground, inputBorder, inputForeground, buttonBackground as editorButtonBackground, buttonHoverBackground as editorButtonHoverBackground } from 'vs/platform/theme/common/colorRegistry';
import { getExtraColor } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughUtils';
import { IExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/common/extensions';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IEditorInputFactory, EditorInput } from 'vs/workbench/common/editor';
import { IFoldersWorkbenchService } from 'vs/workbench/services/folders/common/folders';
import { $ } from 'vs/base/browser/builder';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { IAuthService } from 'vs/platform/auth/common/auth';
import { ICodeCommentsService, IThreads } from 'vs/editor/browser/services/codeCommentsService';
import { INavService } from 'vs/workbench/services/nav/common/nav';
import { SIDE_BAR_BACKGROUND, SIDE_BAR_BORDER, SIDE_BAR_SECTION_HEADER_BACKGROUND, SIDE_BAR_TITLE_FOREGROUND } from 'vs/workbench/common/theme';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IReviewService } from 'vs/workbench/services/review/common/review';
import { distanceInWordsToNow } from 'date-fns';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ReviewQuickOpenAction } from 'vs/workbench/parts/review/electron-browser/review.contribution';
import { ThrottledDelayer } from 'vs/base/common/async';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { CodeCommentsQuickOpenAction } from 'vs/workbench/parts/codeComments/electron-browser/codeComments.contribution';
import { attachButtonStyler } from 'vs/platform/theme/common/styler';
import { Button } from 'vs/base/browser/ui/button/button';

used();

const configurationKey = 'workbench.startupEditor';
const oldConfigurationKey = 'workbench.welcome.enabled';
const telemetryFrom = 'welcomePage';

export class WelcomePageContribution implements IWorkbenchContribution {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IBackupFileService backupFileService: IBackupFileService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IStorageService storageService: IStorageService
	) {
		const enabled = isWelcomePageEnabled(configurationService);
		if (enabled && lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			backupFileService.hasBackups().then(hasBackups => {
				const activeInput = editorService.getActiveEditorInput();
				if (!activeInput && !hasBackups) {
					return instantiationService.createInstance(WelcomePage)
						.openEditor();
				}
				return undefined;
			}).then(null, onUnexpectedError);
		}
	}

	public getId() {
		return 'vs.welcomePage';
	}
}

function isWelcomePageEnabled(configurationService: IConfigurationService) {
	const startupEditor = configurationService.inspect(configurationKey);
	if (!startupEditor.user && !startupEditor.workspace) {
		const welcomeEnabled = configurationService.inspect(oldConfigurationKey);
		if (welcomeEnabled.value !== undefined && welcomeEnabled.value !== null) {
			return welcomeEnabled.value;
		}
	}
	return startupEditor.value === 'welcomePage';
}

export class WelcomePageAction extends Action {

	public static ID = 'workbench.action.showWelcomePage';
	public static LABEL = localize('welcomePage', "Home");

	constructor(
		id: string,
		label: string,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		return this.instantiationService.createInstance(WelcomePage)
			.openEditor()
			.then(() => undefined);
	}
}

interface ExtensionSuggestion {
	name: string;
	title?: string;
	id: string;
	isKeymap?: boolean;
	isCommand?: boolean;
}

const extensionPacks: ExtensionSuggestion[] = [
	{ name: localize('welcomePage.javaScript', "JavaScript"), id: 'dbaeumer.vscode-eslint' },
	{ name: localize('welcomePage.typeScript', "TypeScript"), id: 'eg2.tslint' },
	{ name: localize('welcomePage.python', "Python"), id: 'ms-python.python' },
	// { name: localize('welcomePage.go', "Go"), id: 'lukehoban.go' },
	{ name: localize('welcomePage.php', "PHP"), id: 'felixfbecker.php-pack' },
	{ name: localize('welcomePage.docker', "Docker"), id: 'PeterJausovec.vscode-docker' },
];

const keymapExtensions: ExtensionSuggestion[] = [
	{ name: localize('welcomePage.vim', "Vim"), id: 'vscodevim.vim', isKeymap: true },
	{ name: localize('welcomePage.sublime', "Sublime"), id: 'ms-vscode.sublime-keybindings', isKeymap: true },
	{ name: localize('welcomePage.atom', "Atom"), id: 'ms-vscode.atom-keybindings', isKeymap: true },
];

interface PublicWorkspace {
	name: string;
	cloneURL: string;
}

const publicWorkspaces: PublicWorkspace[] = [
	{ name: localize("welcomePage.gorillaMux", "gorilla/mux"), cloneURL: localize("welcomePage.gorillaMuxURL", "https://github.com/gorilla/mux/"), },
	{ name: localize("welcomePage.tslint", "palantir/tslint"), cloneURL: localize("welcomePage.tslintURL", "https://github.com/palantir/tslint/"), },
	{ name: localize("welcomePage.jsTsLangserver", "sourcegraph/javascript-typescript-langserver"), cloneURL: localize("welcomePage.jsTsLangserverURL", "https://github.com/sourcegraph/javascript-typescript-langserver/"), },
	{ name: localize("welcomePage.tornado", "tornadoweb/tornado"), cloneURL: localize("welcomePage.tornadoURL", "https://github.com/tornadoweb/tornado/"), },
	{ name: localize("welcomePage.jsonIterator", "json-iterator/go"), cloneURL: localize("welcomePage.jsonIteratorURL", "https://github.com/json-iterator/go/"), },
];

interface Strings {
	installEvent: string;
	installedEvent: string;
	detailsEvent: string;

	alreadyInstalled: string;
	reloadAfterInstall: string;
	installing: string;
	extensionNotFound: string;
}

/* __GDPR__
	"installExtension" : {
		"${include}": [
			"${WelcomePageInstall-1}"
		]
	}
*/
/* __GDPR__
	"installedExtension" : {
		"${include}": [
			"${WelcomePageInstalled-1}",
			"${WelcomePageInstalled-2}",
			"${WelcomePageInstalled-3}",
			"${WelcomePageInstalled-4}",
			"${WelcomePageInstalled-5}",
			"${WelcomePageInstalled-6}"
		]
	}
*/
/* __GDPR__
	"detailsExtension" : {
		"${include}": [
			"${WelcomePageDetails-1}"
		]
	}
*/
const extensionPackStrings: Strings = {
	installEvent: 'installExtension',
	installedEvent: 'installedExtension',
	detailsEvent: 'detailsExtension',

	alreadyInstalled: localize('welcomePage.extensionPackAlreadyInstalled', "Support for {0} is already installed."),
	reloadAfterInstall: localize('welcomePage.willReloadAfterInstallingExtensionPack', "The window will reload after installing additional support for {0}."),
	installing: localize('welcomePage.installingExtensionPack', "Installing additional support for {0}..."),
	extensionNotFound: localize('welcomePage.extensionPackNotFound', "Support for {0} with id {1} could not be found."),
};

/* __GDPR__
	"installKeymap" : {
		"${include}": [
			"${WelcomePageInstall-1}"
		]
	}
*/
/* __GDPR__
	"installedKeymap" : {
		"${include}": [
			"${WelcomePageInstalled-1}",
			"${WelcomePageInstalled-2}",
			"${WelcomePageInstalled-3}",
			"${WelcomePageInstalled-4}",
			"${WelcomePageInstalled-5}",
			"${WelcomePageInstalled-6}"
		]
	}
*/
/* __GDPR__
	"detailsKeymap" : {
		"${include}": [
			"${WelcomePageDetails-1}"
		]
	}
*/
const keymapStrings: Strings = {
	installEvent: 'installKeymap',
	installedEvent: 'installedKeymap',
	detailsEvent: 'detailsKeymap',

	alreadyInstalled: localize('welcomePage.keymapAlreadyInstalled', "The {0} keyboard shortcuts are already installed."),
	reloadAfterInstall: localize('welcomePage.willReloadAfterInstallingKeymap', "The window will reload after installing the {0} keyboard shortcuts."),
	installing: localize('welcomePage.installingKeymap', "Installing the {0} keyboard shortcuts..."),
	extensionNotFound: localize('welcomePage.keymapNotFound', "The {0} keyboard shortcuts with id {1} could not be found."),
};

const welcomeInputTypeId = 'workbench.editors.welcomePageInput';

class WelcomePage {

	private disposables: IDisposable[] = [];

	readonly editorInput: WalkThroughInput;
	private threads: IThreads;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWindowService private windowService: IWindowService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IMessageService private messageService: IMessageService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IExtensionTipsService private tipsService: IExtensionTipsService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IFoldersWorkbenchService private foldersWorkbenchService: IFoldersWorkbenchService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@ISCMService private scmService: ISCMService,
		@IAuthService private authService: IAuthService,
		@ICodeCommentsService private codeCommentsService: ICodeCommentsService,
		@INavService private navService: INavService,
		@ICommandService private commandService: ICommandService,
		@IReviewService private reviewService: IReviewService,
		@IOpenerService private openerService: IOpenerService,
		@IExtensionService private extensionService: IExtensionService,
		@IThemeService private themeService: IThemeService,
	) {
		this.disposables.push(lifecycleService.onShutdown(() => this.dispose()));

		const installedExtensions = this.instantiationService.invokeFunction(getInstalledExtensions);
		const resource = URI.parse(require.toUrl('./sg_welcome_page'))
			.with({
				scheme: Schemas.walkThrough,
				query: JSON.stringify({ moduleId: 'vs/workbench/parts/welcome/page/electron-browser/sg_welcome_page' })
			});
		this.editorInput = this.instantiationService.createInstance(WalkThroughInput, {
			typeId: welcomeInputTypeId,
			name: localize('welcome.title', "Home"),
			resource,
			telemetryFrom,
			onReady: (container: HTMLElement) => this.onReady(container, installedExtensions)
		});
	}

	public openEditor() {
		return this.editorService.openEditor(this.editorInput, { pinned: true }, Position.ONE);
	}

	/**
	 * resolveOrganizationCommentsContainer manages the state of the code comment container. It is responsible for rendering
	 * a sign up button isntead of comments if the user is not signed into the editor otherwise it is responsible for rendering the
	 * comments in place of the sign up button.
	 * @param container The welcome page container resolved by onReady to allow for proper DOM manipulation.
	 * @param showLoader A boolean to determine if we should show the loading indicator instead of the empty state.
	 */
	private async resolveOrganizationCommentsContainer(container: HTMLElement, showLoader?: boolean): Promise<void> {
		const currentUser = this.authService.currentUser;
		const signUpContainer = container.querySelector('.sign-in-container') as HTMLElement;
		const codeCommentsContainer = container.querySelector('.code-comments-container') as HTMLElement;
		if (!signUpContainer || !codeCommentsContainer) {
			throw new Error('Could not query sign up container or code comments container');
		}
		if (!currentUser) {
			$(codeCommentsContainer).hide();
			$(signUpContainer).show();
			return;
		}
		const joinOrgContainer = this.joinOrganizationState(container);
		if (joinOrgContainer) {
			$(joinOrgContainer).hide();
		}
		const emptyCodeCommentContainer = this.emptyCodeCommentState(container);
		if (emptyCodeCommentContainer) {
			$(emptyCodeCommentContainer).hide();
		}
		$(codeCommentsContainer).show();
		$(signUpContainer).hide();
		const spinner = container.querySelector('.comment-loader') as HTMLElement;
		if (spinner) {
			if (!this.threads.threads.length && showLoader) {
				$(spinner).show();
			} else {
				$(spinner).hide();
			}
		}

		const threadContainer = document.querySelector('.comment-list-container') as HTMLElement;
		if (!threadContainer) {
			return;
		}
		if (!threadContainer) {
			return;
		}

		this.renderCodeComments(threadContainer, showLoader);
	}

	private emptyCodeCommentState(container: HTMLElement): HTMLElement | undefined {
		return document.querySelector('.empty-comment-container') as HTMLElement;
	}

	private joinOrganizationState(container: HTMLElement): HTMLElement | undefined {
		return document.querySelector('.no-org-container') as HTMLElement;
	}

	private renderCodeComments(container: HTMLElement, showLoader: boolean): void {
		let commentList = document.getElementById('comment-list') as HTMLElement;
		if (!commentList) {
			return;
		}
		const joinOrganizationContainer = this.joinOrganizationState(container);
		$(commentList).clearChildren();
		if (joinOrganizationContainer) {
			if (!this.authService.currentUser.currentOrgMember) {
				$(joinOrganizationContainer).show();
				return;
			}
			$(joinOrganizationContainer).hide();
		}
		const emptyCodeCommentState = this.emptyCodeCommentState(container);
		if (!this.threads.threads.length && !showLoader) {
			if (emptyCodeCommentState) {
				$(emptyCodeCommentState).show();
			}
			return;
		}

		if (emptyCodeCommentState) {
			$(emptyCodeCommentState).hide();
		}
		this.threads.threads.filter(thread => thread.comments && thread.comments.length).slice(0, Math.min(this.threads.threads.length, 10)).forEach(thread => {
			const threadDiv = document.createElement('li');
			threadDiv.className = 'repo-row flex';
			threadDiv.addEventListener('click', () => {
				const revision = thread.branch || thread.repoRevision;
				const url = `src:open?path=${thread.file}&revision=${revision}&thread=${thread.id}&vcs=git&repo=https://${thread.canonicalRemoteId}`;
				this.navService.handle(URI.parse(url));
			});
			commentList.appendChild(threadDiv);

			const leftDiv = document.createElement('div');
			leftDiv.className = 'column-container padding-right';
			threadDiv.appendChild(leftDiv);

			const authorAvatar = document.createElement('div');
			authorAvatar.className = 'avatar-container';
			const img = document.createElement('img');
			const author = thread.comments[0].author;
			if (author) {
				img.src = author.avatarUrl;
			}
			img.className = 'avatar-img';
			authorAvatar.appendChild(img);
			leftDiv.appendChild(authorAvatar);

			const branchName = document.createElement('div');
			branchName.className = 'overflow-ellipsis padding-right';
			branchName.innerText = thread.title.substr(0, Math.min(75, thread.title.length));
			leftDiv.appendChild(branchName);

			const rightDiv = document.createElement('div');
			rightDiv.className = 'column-container';
			threadDiv.appendChild(rightDiv);

			const threadCount = document.createElement('div');
			threadCount.className = 'column-container';

			const bubbleContainer = document.createElement('div');
			bubbleContainer.className = 'bubble-container';
			threadCount.appendChild(bubbleContainer);

			const bubble = document.createElement('div');
			bubble.className = 'bubble-icon';
			bubbleContainer.appendChild(bubble);

			const commentCount = document.createElement('div');
			commentCount.className = 'comment-count-label';
			commentCount.innerText = String(thread.comments.length);
			bubbleContainer.appendChild(commentCount);

			rightDiv.appendChild(threadCount);

			const threadStatus = document.createElement('div');
			threadStatus.className = thread.archived ? 'octicon thread octicon-issue-closed' : 'octicon thread octicon-issue-opened';
			rightDiv.appendChild(threadStatus);
		});
		window.dispatchEvent(new Event('resize'));
	}

	private refreshDelayer = new ThrottledDelayer<void>(100);
	public reviewItemsChanged(): TPromise<void> {
		return this.refreshDelayer.trigger(() => TPromise.wrap(this.resolveSuggestedRepositoriesContainer()));
	}

	private addGitHubCodeHostButton(container: HTMLElement): void {
		if (document.getElementById('add-github-code-host-button')) {
			return;
		}
		const buttonContainer = document.getElementById('add-github');
		const gitHubButton = $('div').id('add-github-code-host-button');
		buttonContainer.appendChild(gitHubButton.getHTMLElement());
		const button = new Button(gitHubButton);
		button.getElement().classList.add('flat-button');

		button.label = localize('welcomePage.addGitHubToken', "Add GitHub token");
		attachButtonStyler(button, this.themeService);

		this.disposables.push(button.onDidClick(() => {
			this.commandService.executeCommand('github.showCreateAccessTokenWalkthrough');
		}));
	}

	private addBitbucketAppPasswordButton(container: HTMLElement): void {
		if (document.getElementById('add-bitbucket-app-password-button')) {
			return;
		}
		const buttonContainer = document.getElementById('add-bitbucket');
		const gitHubButton = $('div').id('add-bitbucket-app-password-button');
		buttonContainer.appendChild(gitHubButton.getHTMLElement());
		const button = new Button(gitHubButton);
		button.getElement().classList.add('flat-button');

		button.label = localize('welcomePage.addBitbuckAppPassword', "Add Bitbucket app password");
		attachButtonStyler(button, this.themeService);

		this.disposables.push(button.onDidClick(() => {
			this.commandService.executeCommand('bitbucket.showBitbucketAppPasswordWalkthrough');
		}));
	}

	private onReady(container: HTMLElement, installedExtensions: TPromise<IExtensionStatus[]>): void {
		if (!this.threads) {
			this.threads = this.codeCommentsService.getThreads({});
			this.disposables.push(this.threads);
			this.threads.refresh();
			this.disposables.push(this.threads.onDidChangeThreads(() => {
				this.resolveOrganizationCommentsContainer(container);
			}, this));
		}
		this.addGitHubCodeHostButton(container);
		this.addBitbucketAppPasswordButton(container);
		this.resolveSuggestedRepositoriesContainer();
		this.resolveOrganizationCommentsContainer(container, true);

		this.disposables.push(this.configurationService.onDidChangeConfiguration(() => {
			this.resolveSuggestedRepositoriesContainer();
		}));

		this.disposables.push(this.authService.onDidChangeCurrentUser(() => {
			this.threads.refresh();
			this.resolveOrganizationCommentsContainer(container, true);
		}));

		this.disposables.push(this.reviewService.onDidAddReviewItem(() => {
			this.reviewItemsChanged();
		}));
		this.disposables.push(this.reviewService.onDidRemoveReviewItem(() => {
			this.reviewItemsChanged();
		}));

		this.disposables.push(this.scmService.onDidAddRepository(() => {
			this.reviewItemsChanged();
			this.resolveSuggestedRepositoriesContainer();
		}));

		this.disposables.push(this.scmService.onDidRemoveRepository(() => {
			this.reviewItemsChanged();
			this.resolveSuggestedRepositoriesContainer();
		}));

		const noOrgButton = document.getElementById('org-help-action');
		noOrgButton.addEventListener('click', () => {
			this.openerService.open(URI.parse('https://sourcegraph.com/settings/orgs/new'));
		});

		const reviewSearchButton = document.getElementById('review-search-action');
		reviewSearchButton.addEventListener('click', () => {
			this.commandService.executeCommand(ReviewQuickOpenAction.ID);
		});

		const commentSearchButton = document.getElementById('comments-search-action');
		commentSearchButton.addEventListener('click', () => {
			this.commandService.executeCommand(CodeCommentsQuickOpenAction.ID);
		});

		const contactButton = document.getElementById('gitServer-contact');
		contactButton.addEventListener('click', () => {
			this.openerService.open(URI.parse(`https://about.sourcegraph.com/contact/`));
		});

		const inactiveButtons = container.querySelectorAll('.sg-inactive');

		for (let i = 0; i < inactiveButtons.length; i++) {
			inactiveButtons[i].addEventListener('click', e => {
				this.messageService.show(Severity.Warning, localize('welcomePage.featureInactive', 'This feature has not been implemented yet.'));
			});
		}

		this.addExtensionList(container, '.extensionPackList', extensionPacks, extensionPackStrings);
		this.addExtensionList(container, '.keymapList', keymapExtensions, keymapStrings);
		this.addPublicWorkspaceList(container, '.public-workspace-list', publicWorkspaces);


		this.updateInstalledExtensions(container, installedExtensions);
		this.disposables.push(this.instantiationService.invokeFunction(onExtensionChanged)(ids => {
			for (const id of ids) {
				if (container.querySelector(`.installExtension[data-extension="${id}"], .enabledExtension[data-extension="${id}"]`)) {
					const installedExtensions = this.instantiationService.invokeFunction(getInstalledExtensions);
					this.updateInstalledExtensions(container, installedExtensions);
					break;
				}
			}
		}));
	}

	private addPublicWorkspaceList(container: HTMLElement, listSelector: string, listItems: PublicWorkspace[]) {
		const list = container.querySelector(listSelector);
		if (list) {
			listItems.forEach((workspace, i) => {
				const li = document.createElement('li');
				const repoIcon = document.createElement('div');
				repoIcon.className = 'repo-icon';
				li.appendChild(repoIcon);
				const a = document.createElement('a');
				a.href = 'javascript:void(0)';
				a.innerText = workspace.name;
				li.appendChild(a);
				list.appendChild(li);

				a.addEventListener('click', e => {
					const root = URI.parse(`git+${workspace.cloneURL}`);
					this.foldersWorkbenchService.addFoldersAsWorkspaceRootFolders([root]);
					e.preventDefault();
					e.stopPropagation();
				});
			});
		}
	}

	/**
	 * Review Flow Functions
	 */

	private async resolveSuggestedRepositoriesContainer(): Promise<void> {
		const codeHostContainer = document.querySelector('.add-code-host') as HTMLElement;
		const branchListContainer = document.querySelector('.branch-list-container') as HTMLElement;
		const recentRepositoriesContainer = document.querySelector('.recent-repositories-container') as HTMLElement;

		if (!branchListContainer || !codeHostContainer || !recentRepositoriesContainer) {
			return;
		}

		$(codeHostContainer).hide();
		$(branchListContainer).hide();
		$(recentRepositoriesContainer).hide();

		const branchSpinner = document.getElementById('review-branches-spinner') as HTMLElement;
		const repoSpinner = document.getElementById('recent-repos-spinner') as HTMLElement;

		const { github, bitbucket } = this.configurationService.getValue();
		const isGitHubConfigured = github && github.token;
		const isBitbucketConfigured = bitbucket && bitbucket.cloud && bitbucket.cloud.username && bitbucket.cloud.appPassword;
		if (!isGitHubConfigured && (!isBitbucketConfigured || bitbucket.cloud.triggerSetup)) {
			$(codeHostContainer).show();
			$(branchListContainer).hide();
			return;
		}

		$(codeHostContainer).hide();
		const workspace = this.contextService.getWorkspace();
		const suggestedRepoContainer = document.querySelector('.recent-repositories-list') as HTMLElement;
		if (!suggestedRepoContainer) {
			return;
		}
		// If there's no workspace show suggested repos.
		if (!workspace.folders.length) {
			$(recentRepositoriesContainer).show();
			$(repoSpinner).show();
			const respositories = await this.getRecentRepositories();
			$(repoSpinner).hide();
			this.buildRecentRepositoriesList(respositories, suggestedRepoContainer);
		} else {
			$(recentRepositoriesContainer).hide();
			$(branchListContainer).show();
			if (!this.reviewService.reviewItems.length) {
				const branchList = document.getElementById('branch-list');
				$(branchList).clearChildren();
				$(branchSpinner).show();
			} else {
				$(branchSpinner).hide();
				this.renderBranches();
			}
		}
	}

	private recentRepositories: any[];
	private async getRecentRepositories(): Promise<any[]> {
		if (!this.recentRepositories) {
			await this.extensionService.onReady();
			await this.extensionService.activateByEvent('*');
			this.recentRepositories = await this.commandService.executeCommand('github.recent.repostories') as any[];
		}
		return this.recentRepositories.slice(0, Math.min(this.recentRepositories.length, 10));
	}

	private hasBuiltRepositoriesList = false;

	private buildRecentRepositoriesList(repositories: any[], container: HTMLElement): void {
		if (this.hasBuiltRepositoriesList) {
			return;
		}
		this.hasBuiltRepositoriesList = true;
		repositories.map(repo => {
			const repoDiv = document.createElement('div');
			const contents = document.createElement('div');
			repoDiv.className = 'repo-row flex';
			const img = document.createElement('div');
			img.className = 'added-repo-icon';
			contents.appendChild(img);
			repoDiv.appendChild(contents);
			container.appendChild(repoDiv);
			const nameLabel = document.createElement('div');
			nameLabel.innerText = repo.displayPath;
			nameLabel.className = 'repo-name-label';
			contents.appendChild(nameLabel);
			repoDiv.addEventListener('click', async (e) => {
				const root = repo;
				e.preventDefault();
				e.stopPropagation();
				await this.foldersWorkbenchService.addFoldersAsWorkspaceRootFolders([root]);
			});
		});
	}

	private renderBranches(): void {
		const container = document.querySelector('.branch-list-container') as HTMLElement;
		if (!container) {
			return;
		}

		let repoContainers = document.querySelector('.branch-list') as HTMLElement;
		if (!repoContainers) {
			return;
		}
		$(repoContainers).clearChildren();

		const reviewItems = this.reviewService.reviewItems;

		reviewItems.slice(0, Math.min(reviewItems.length, 10)).forEach(reviewItem => {
			let branchList = document.getElementById(`branch-list`);
			if (!branchList) {
				const subcontainer = document.createElement('li');
				repoContainers.appendChild(subcontainer);
				subcontainer.appendChild(branchList);
			}

			const repoDiv = document.createElement('li');
			repoDiv.className = 'repo-row';
			repoDiv.addEventListener('click', () => {
				const command = reviewItem.provider.reviewCommand;
				this.commandService.executeCommand(command.id, ...command.arguments);
			});
			branchList.appendChild(repoDiv);

			const titleRow = document.createElement('div');
			titleRow.className = 'flex';
			repoDiv.appendChild(titleRow);

			const leftDiv = document.createElement('div');
			leftDiv.className = 'column-container padding-right';
			titleRow.appendChild(leftDiv);

			const branchIcon = document.createElement('div');
			branchIcon.className = `${reviewItem.provider.icon} padding-right`;
			leftDiv.appendChild(branchIcon);

			const branchName = document.createElement('div');
			branchName.className = 'overflow-ellipsis';
			branchName.innerHTML = reviewItem.provider.label;
			leftDiv.appendChild(branchName);

			const remoteName = document.createElement('div');
			remoteName.className = 'overflow-ellipsis padding-left remote-description';
			remoteName.innerHTML = reviewItem.provider.description;
			leftDiv.appendChild(remoteName);

			const subtitleRow = document.createElement('div');
			repoDiv.appendChild(subtitleRow);

			const leftSubtitleDiv = document.createElement('div');
			leftSubtitleDiv.className = 'column-container padding-right';
			subtitleRow.appendChild(leftSubtitleDiv);

			const authorLabel = document.createElement('div');
			authorLabel.className = 'overflow-ellipsis remote-description';
			authorLabel.innerHTML = reviewItem.provider.author;
			leftSubtitleDiv.appendChild(authorLabel);

			const timetampLabel = document.createElement('div');
			timetampLabel.className = 'overflow-ellipsis remote-description';
			timetampLabel.innerHTML = distanceInWordsToNow(reviewItem.provider.date, { addSuffix: true });
			leftSubtitleDiv.appendChild(timetampLabel);
		});

		window.dispatchEvent(new Event('resize'));
	}

	private addExtensionList(container: HTMLElement, listSelector: string, suggestions: ExtensionSuggestion[], strings: Strings) {
		const list = container.querySelector(listSelector);
		if (list) {
			suggestions.forEach((extension, i) => {
				if (i) {
					list.appendChild(document.createTextNode(localize('welcomePage.extensionListSeparator', ", ")));
				}

				const a = document.createElement('a');
				a.innerText = extension.name;
				a.title = extension.title || (extension.isKeymap ? localize('welcomePage.installKeymap', "Install {0} keymap", extension.name) : localize('welcomePage.installExtensionPack', "Install additional support for {0}", extension.name));
				if (extension.isCommand) {
					a.href = `command:${extension.id}`;
					list.appendChild(a);
				} else {
					a.classList.add('installExtension');
					a.setAttribute('data-extension', extension.id);
					a.href = 'javascript:void(0)';
					a.addEventListener('click', e => {
						this.installExtension(extension, strings);
						e.preventDefault();
						e.stopPropagation();
					});
					list.appendChild(a);

					const span = document.createElement('span');
					span.innerText = extension.name;
					span.title = extension.isKeymap ? localize('welcomePage.installedKeymap', "{0} keymap is already installed", extension.name) : localize('welcomePage.installedExtensionPack', "{0} support is already installed", extension.name);
					span.classList.add('enabledExtension');
					span.setAttribute('data-extension', extension.id);
					list.appendChild(span);
				}
			});
		}
	}

	private installExtension(extensionSuggestion: ExtensionSuggestion, strings: Strings): void {
		/* __GDPR__FRAGMENT__
			"WelcomePageInstall-1" : {
				"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		this.telemetryService.publicLog(strings.installEvent, {
			from: telemetryFrom,
			extensionId: extensionSuggestion.id,
		});
		this.instantiationService.invokeFunction(getInstalledExtensions).then(extensions => {
			const installedExtension = arrays.first(extensions, extension => extension.identifier.id === extensionSuggestion.id);
			if (installedExtension && installedExtension.globallyEnabled) {
				/* __GDPR__FRAGMENT__
					"WelcomePageInstalled-1" : {
						"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
					}
				*/
				this.telemetryService.publicLog(strings.installedEvent, {
					from: telemetryFrom,
					extensionId: extensionSuggestion.id,
					outcome: 'already_enabled',
				});
				this.messageService.show(Severity.Info, strings.alreadyInstalled.replace('{0}', extensionSuggestion.name));
				return;
			}
			const foundAndInstalled = installedExtension ? TPromise.as(true) : this.extensionGalleryService.query({ names: [extensionSuggestion.id], source: telemetryFrom })
				.then(result => {
					const [extension] = result.firstPage;
					if (!extension) {
						return false;
					}
					return this.extensionManagementService.installFromGallery(extension)
						.then(() => {
							// TODO: Do this as part of the install to avoid multiple events.
							return this.extensionEnablementService.setEnablement({ id: extensionSuggestion.id }, false);
						}).then(() => {
							return true;
						});
				});
			this.messageService.show(Severity.Info, {
				message: strings.reloadAfterInstall.replace('{0}', extensionSuggestion.name),
				actions: [
					new Action('ok', localize('ok', "OK"), null, true, () => {
						const messageDelay = TPromise.timeout(300);
						messageDelay.then(() => {
							this.messageService.show(Severity.Info, {
								message: strings.installing.replace('{0}', extensionSuggestion.name),
								actions: [CloseAction]
							});
						});
						TPromise.join(extensionSuggestion.isKeymap ? extensions.filter(extension => isKeymapExtension(this.tipsService, extension) && extension.globallyEnabled)
							.map(extension => {
								return this.extensionEnablementService.setEnablement(extension.identifier, false);
							}) : []).then(() => {
								return foundAndInstalled.then(found => {
									messageDelay.cancel();
									if (found) {
										return this.extensionEnablementService.setEnablement({ id: extensionSuggestion.id }, true)
											.then(() => {
												/* __GDPR__FRAGMENT__
													"WelcomePageInstalled-2" : {
														"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
														"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
														"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
													}
												*/
												this.telemetryService.publicLog(strings.installedEvent, {
													from: telemetryFrom,
													extensionId: extensionSuggestion.id,
													outcome: installedExtension ? 'enabled' : 'installed',
												});
												return this.windowService.reloadWindow();
											});
									} else {
										/* __GDPR__FRAGMENT__
											"WelcomePageInstalled-3" : {
												"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
												"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
												"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
											}
										*/
										this.telemetryService.publicLog(strings.installedEvent, {
											from: telemetryFrom,
											extensionId: extensionSuggestion.id,
											outcome: 'not_found',
										});
										this.messageService.show(Severity.Error, strings.extensionNotFound.replace('{0}', extensionSuggestion.name).replace('{1}', extensionSuggestion.id));
										return undefined;
									}
								});
							}).then(null, err => {
								/* __GDPR__FRAGMENT__
									"WelcomePageInstalled-4" : {
										"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
										"error": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
									}
								*/
								this.telemetryService.publicLog(strings.installedEvent, {
									from: telemetryFrom,
									extensionId: extensionSuggestion.id,
									outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
									error: String(err),
								});
								this.messageService.show(Severity.Error, err);
							});
						return TPromise.as(true);
					}),
					new Action('details', localize('details', "Details"), null, true, () => {
						/* __GDPR__FRAGMENT__
							"WelcomePageDetails-1" : {
								"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
							}
						*/
						this.telemetryService.publicLog(strings.detailsEvent, {
							from: telemetryFrom,
							extensionId: extensionSuggestion.id,
						});
						this.extensionsWorkbenchService.queryGallery({ names: [extensionSuggestion.id] })
							.then(result => this.extensionsWorkbenchService.open(result.firstPage[0]))
							.then(null, onUnexpectedError);
						return TPromise.as(false);
					}),
					new Action('cancel', localize('cancel', "Cancel"), null, true, () => {
						/* __GDPR__FRAGMENT__
							"WelcomePageInstalled-5" : {
								"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
								"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
							}
						*/
						this.telemetryService.publicLog(strings.installedEvent, {
							from: telemetryFrom,
							extensionId: extensionSuggestion.id,
							outcome: 'user_canceled',
						});
						return TPromise.as(true);
					})
				]
			});
		}).then(null, err => {
			/* __GDPR__FRAGMENT__
				"WelcomePageInstalled-6" : {
					"from" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"extensionId": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"outcome": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
					"error": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
				}
			*/
			this.telemetryService.publicLog(strings.installedEvent, {
				from: telemetryFrom,
				extensionId: extensionSuggestion.id,
				outcome: isPromiseCanceledError(err) ? 'canceled' : 'error',
				error: String(err),
			});
			this.messageService.show(Severity.Error, err);
		});
	}

	private updateInstalledExtensions(container: HTMLElement, installedExtensions: TPromise<IExtensionStatus[]>) {
		installedExtensions.then(extensions => {
			const elements = container.querySelectorAll('.installExtension, .enabledExtension');
			for (let i = 0; i < elements.length; i++) {
				elements[i].classList.remove('installed');
			}
			extensions.filter(ext => ext.globallyEnabled)
				.map(ext => ext.identifier)
				.forEach(id => {
					const install = container.querySelectorAll(`.installExtension[data-extension="${id}"]`);
					for (let i = 0; i < install.length; i++) {
						install[i].classList.add('installed');
					}
					const enabled = container.querySelectorAll(`.enabledExtension[data-extension="${id}"]`);
					for (let i = 0; i < enabled.length; i++) {
						enabled[i].classList.add('installed');
					}
				});
		}).then(null, onUnexpectedError);
	}

	dispose(): void {
		if (this.threads) {
			this.threads.dispose();
		}
		this.disposables = dispose(this.disposables);
	}
}


export class WelcomeInputFactory implements IEditorInputFactory {

	static ID = welcomeInputTypeId;

	public serialize(editorInput: EditorInput): string {
		return '{}';
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): WalkThroughInput {
		return instantiationService.createInstance(WelcomePage)
			.editorInput;
	}
}

// theming

const buttonBackground = registerColor('welcomePage.buttonBackground', { dark: null, light: null, hc: null }, localize('welcomePage.buttonBackground', 'Background color for the buttons on the Welcome page.'));
const buttonHoverBackground = registerColor('welcomePage.buttonHoverBackground', { dark: null, light: null, hc: null }, localize('welcomePage.buttonHoverBackground', 'Hover background color for the buttons on the Welcome page.'));

registerThemingParticipant((theme, collector) => {
	const backgroundColor = theme.getColor(SIDE_BAR_BACKGROUND);
	if (backgroundColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container { background-color: ${backgroundColor}; }`);
	}

	const sideBarHeaderColor = theme.getColor(SIDE_BAR_SECTION_HEADER_BACKGROUND);
	if (sideBarHeaderColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .repo-name { background-color: ${sideBarHeaderColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .bubble-container { background-color: ${sideBarHeaderColor}; }`);
	}
	const sideBarHeaderForegroundColor = theme.getColor(SIDE_BAR_TITLE_FOREGROUND);
	if (sideBarHeaderForegroundColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .repo-name { color: ${sideBarHeaderForegroundColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .bubble-container { color: ${sideBarHeaderForegroundColor}; }`);
	}

	const containerBorder = theme.getColor(SIDE_BAR_BORDER);
	if (containerBorder) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container { border-color: ${containerBorder}; }`);
	}

	const foregroundColor = theme.getColor(foreground);
	if (foregroundColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .caption { color: ${foregroundColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .action-header { color: ${foregroundColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .action-subheader { color: ${foregroundColor}; }`);
	}
	const descriptionColor = theme.getColor(descriptionForeground);
	if (descriptionColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .comment-count-label { color: ${descriptionColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .bubble-icon { background-color: ${descriptionColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .detail { color: ${descriptionColor}; }`);
	}

	const welcomeButtonColor = theme.getColor(welcomeButtonBackground, false);
	const buttonColor = getExtraColor(theme, buttonBackground, { dark: 'rgba(0, 0, 0, .2)', extra_dark: 'rgba(200, 235, 255, .042)', light: 'rgba(0,0,0,.04)', hc: 'black' });
	if (welcomeButtonColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .start li button { background: ${welcomeButtonColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands li button { background: ${welcomeButtonColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container .dashed { background: ${welcomeButtonColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container .solid { background: ${welcomeButtonColor}; }`);
	} else if (buttonColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands li button { background: ${buttonColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .start li button { background: ${buttonColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container .dashed { background: ${buttonColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container .solid { background: ${buttonColor}; }`);
	}
	const buttonHoverColor = getExtraColor(theme, buttonHoverBackground, { dark: 'rgba(200, 235, 255, .072)', extra_dark: 'rgba(200, 235, 255, .072)', light: 'rgba(0,0,0,.10)', hc: null });
	if (buttonHoverColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands li button:hover { background: ${buttonHoverColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container .dashed:hover { background: ${buttonHoverColor}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container .solid:hover { background: ${buttonHoverColor}; }`);
	}
	const buttonBackgroundEditor = theme.getColor(editorButtonBackground, false);
	if (buttonBackgroundEditor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container button { background: ${buttonBackgroundEditor}; }`);
	} else if (buttonColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container button { background: ${buttonColor}; }`);
	}
	const buttonBackgroundHover = theme.getColor(editorButtonHoverBackground, false);
	if (buttonBackgroundHover) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container button:hover { background: ${buttonBackgroundHover}; }`);
	}
	const link = theme.getColor(textLinkForeground);
	if (link) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage a { color: ${link}; }`);
	}
	const activeLink = theme.getColor(textLinkActiveForeground);
	if (activeLink) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage a:hover,
			.monaco-workbench > .part.editor > .content .welcomePage a:active { color: ${activeLink}; }`);
	}
	const focusColor = theme.getColor(focusBorder);
	if (focusColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage a:focus { outline-color: ${focusColor}; }`);
	}
	const border = theme.getColor(contrastBorder);
	if (border) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands li button { border-color: ${border}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container button { border-color: ${border}; border-width: 1px; border-style: solid; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container .dashed { border-color: ${border}; border-width: 1px; border-style: dashed; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container .solid { border-color: ${border}; border-width: 1px; border-style: solid; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .container { border-color: ${border}; border-width: 1px; border-style: solid; }`);
	}
	const activeBorder = theme.getColor(activeContrastBorder);
	if (activeBorder) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands ul:hover { outline-color: ${activeBorder}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .commands li button:hover { outline-color: ${activeBorder}; }`);
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage .repo-row:hover { outline-color: ${activeBorder}; border-width: 1px; border-style: dashed; }`);
	}

	const inputColor = theme.getColor(inputBackground);
	if (inputColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage input { background-color: ${inputColor}; }`);
	}
	const inputBorderColor = theme.getColor(inputBorder);
	if (inputBorderColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage input { border-color: ${inputBorderColor}; }`);
	}
	const inputForegroundColor = theme.getColor(inputForeground);
	if (inputForegroundColor) {
		collector.addRule(`.monaco-workbench > .part.editor > .content .welcomePage input { color: ${inputForegroundColor}; }`);
	}

});
