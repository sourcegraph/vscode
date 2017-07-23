/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ISCMService, ISCMProvider, onDidChangeOrUpdateSCMProvider } from 'vs/workbench/services/scm/common/scm';
import { RemoteGitSCMProvider, RefType, Ref } from 'vs/workbench/services/scm/node/remoteGitProvider';
import * as nls from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { Action } from 'vs/base/common/actions';
import { firstIndex } from 'vs/base/common/arrays';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Disposable } from 'vs/base/common/lifecycle';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionExtensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions } from 'vs/workbench/common/actionRegistry';
import { RemoteRepoFileService } from 'vs/workbench/services/files/node/remoteRepoFileService';
import { SchemeRouterFileService } from 'vs/platform/files/common/schemeRouter';
import { IFileService, FileChangeType, FileChangesEvent, IFileChange } from 'vs/platform/files/common/files';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
// tslint:disable-next-line:import-patterns
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
// tslint:disable-next-line:import-patterns
import { ExplorerViewlet } from 'vs/workbench/parts/files/browser/explorerViewlet';
import { IPartService, Parts } from 'vs/workbench/services/part/common/partService';

/**
 * Shows a quickopen that lists available Git refs for the current workspace. Selecting
 * any of these Git refs switches the current workspace to that Git revision, updating all
 * open workspace documents to that revision.
*/
export class GitSwitchRevisionAction extends Action {

	static ID = 'remoteGit.action.switchRevision';
	static LABEL = nls.localize('TODO-329473', "Git: Switch to Revision...");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@ISCMService private scmService: ISCMService,
	) {
		super(id, label);
	}

	run(): TPromise<void> {
		const scmProvider = this.scmService.activeProvider;
		if (!scmProvider || scmProvider.id !== RemoteGitSCMProvider.ID) {
			this.messageService.show(Severity.Error, nls.localize('TODO-3249731', "Workspace is not a Git repository"));
			return TPromise.as(void 0);
		}

		const gitProvider: RemoteGitSCMProvider = scmProvider as RemoteGitSCMProvider;
		return gitProvider.listRefs().then((refs: Ref[]) => {
			const currentRefID = scmProvider.revision && scmProvider.revision.specifier;
			const picks: (IPickOpenEntry & { ref: Ref })[] = refs
				.map(ref => {

					// TODO(sqs): include icon (there is a vscode bug where if you type 'g' it matches the $(git-branch) string and removes the icon)
					//
					// '$(' + (ref.type === RefType.Head ? 'git-branch' : 'tag') + ') '
					let description;
					if (ref.isHEAD) {
						description = nls.localize('TODO-4958471', "default branch");
					} else if (ref.type === RefType.Head) {
						description = nls.localize('TODO-495841541', "branch");
					} else if (ref.type === RefType.Tag) {
						description = nls.localize('TODO-494545841', "tag");
					}
					return {
						id: ref.ref,
						label: ref.name,
						description,
						ref,
					};
				})
				.sort((t1, t2) => t1.label.localeCompare(t2.label));

			const placeHolder = nls.localize('TODO-3897115', "Select a Git ref to switch to...");
			const autoFocusIndex = firstIndex(picks, p => p.id === currentRefID);

			return this.quickOpenService.pick(picks, { placeHolder, autoFocus: { autoFocusIndex } }).then(
				pick => {
					if (pick) {
						return gitProvider.setRevision({ rawSpecifier: pick.ref.name, specifier: pick.ref.ref }) as TPromise<any>;
					}
					return TPromise.as(void 0);
				},
			);
		});
	}
}

const gitSwitchRevisionDescriptor = new SyncActionDescriptor(GitSwitchRevisionAction, GitSwitchRevisionAction.ID, GitSwitchRevisionAction.LABEL, { primary: KeyMod.Alt | KeyCode.KEY_V });
Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions).registerWorkbenchAction(gitSwitchRevisionDescriptor, 'Git: Switch to Revision...');

/**
 * Listens to the active SCM provider for changes to the current revision (e.g.,
 * when the user uses GitSwitchRevisionAction to switch to a different Git branch) and
 * propagates this update to the file service (so that open documents are reloaded with
 * the contents at the new revision) and the history service.
*/
export class SCMProviderRevisionListener extends Disposable implements IWorkbenchContribution {

	private initialUpdate = true;

	constructor(
		@ISCMService private scmService: ISCMService,
		@IHistoryService private historyService: IHistoryService,
		@IFileService private fileService: IFileService,
		@IModelService private modelService: IModelService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@ICommandService private commandService: ICommandService,
		@IViewletService private viewletService: IViewletService,
		@IPartService private partService: IPartService,
		@IMessageService private messageService: IMessageService,
	) {
		super();
		this._register(onDidChangeOrUpdateSCMProvider(scmService, provider => this.onDidChangeOrUpdateProvider(provider)));
	}

	getId(): string {
		return 'sourcegraph.scm.scmProviderRevisionListener';
	}

	private onDidChangeOrUpdateProvider(provider: ISCMProvider): void {
		if (this.initialUpdate) {
			// The initial update occurs while the workbench is still loading. There's no
			// need to refresh anything during the initial workbench load.
			this.initialUpdate = false;
			return;
		}

		// Reload all open files and send (roughly) the same file changes events that
		// would happen if the user had run "git checkout" on the desktop. E.g., if an
		// open file has changed or does not exist in the new revision, then send a
		// changed/deleted file event.
		const fileService = this.getRemoteRepoFileService();
		if (fileService) {
			TPromise.join<IFileChange>(
				this.modelService.getModels()
					.filter(model => !model.isDisposed())
					.filter(model => model.uri.scheme === Schemas.remoteRepo)
					.filter(model => this.contextService.isInsideWorkspace(model.uri))
					.map(model =>
						// Check if file exists in new revision.
						fileService.resolveFile(model.uri).then(
							// The file exists in the new revision. Assume it changed so
							// FileEditorTracker tries reloads its contents.
							() => ({ type: FileChangeType.UPDATED, resource: model.uri }),

							// The file does not exist in the new revision (or some other
							// error occurred, but assume it's not-exists).
							err => ({ type: FileChangeType.DELETED, resource: model.uri }),
						),
				),
			)
				.then(changes => {
					fileService.fireFileChanges(new FileChangesEvent(changes));
					if (changes.some(change => change.type === FileChangeType.DELETED)) {
						this.messageService.show(Severity.Info, nls.localize('TODO-194734271', "Files were closed that do not exist in the current revision."));
					}
				});
		}

		if (this.partService.isVisible(Parts.SIDEBAR_PART)) {
			// Refresh file explorer. HACK: For some reason, it's necessary to toggle
			// setSideBarHidden for the explorer to redraw itself.
			this.viewletService.openViewlet(EXPLORER_VIEWLET_ID, false)
				.then((explorerViewlet: ExplorerViewlet) => explorerViewlet.getExplorerView().refresh())
				.then(() => this.partService.setSideBarHidden(true))
				.then(() => this.partService.setSideBarHidden(false));
		}
	}

	private getRemoteRepoFileService(): RemoteRepoFileService | undefined {
		if (this.fileService instanceof SchemeRouterFileService) {
			const remoteRepoFileService = this.fileService.getFileService(Schemas.remoteRepo);
			if (remoteRepoFileService && remoteRepoFileService instanceof RemoteRepoFileService) {
				return remoteRepoFileService;
			}
		}
		return undefined;
	}
}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(SCMProviderRevisionListener);