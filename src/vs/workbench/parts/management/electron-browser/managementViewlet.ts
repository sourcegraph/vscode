/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/managementViewlet';
import DOM = require('vs/base/browser/dom');
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { VIEWLET_ID, IManagementViewlet } from 'vs/workbench/parts/management/common/management';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewsRegistry, ViewLocation, IViewDescriptor } from 'vs/workbench/browser/parts/views/viewsRegistry';
import { PersistentViewsViewlet } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { CodeHostView } from 'vs/workbench/parts/management/electron-browser/codeHostView';
import { ProfileView } from 'vs/workbench/parts/management/electron-browser/profileView';
import { IAction } from 'vs/base/common/actions';
import { UpdateContribution } from 'vs/workbench/parts/update/electron-browser/update';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IAuthService } from 'vs/platform/auth/common/auth';
import { UpdateView } from 'vs/workbench/parts/management/electron-browser/updateView';
import { OrganizationView } from 'vs/workbench/parts/management/electron-browser/organizationView';
import { IUpdateService, State as UpdateState } from 'vs/platform/update/common/update';
import { RefreshProfileAction } from 'vs/workbench/parts/management/browser/managementActions';

const ManagementViewletVisibleContext = new RawContextKey<boolean>('managementViewletVisible', false);

/**
 * ManagementViewlet renders a PersistentViewsViewlet. The viewlet is triggered by a GlobalViewletActionItem.
 * This viewlet holds all account settings and editor settings items.
 * Currently the only PersistentViewViewlet rendered is the CodeHostView and settings actions are
 * exposed through secondary actions.
 */
export class ManagementViewlet extends PersistentViewsViewlet implements IManagementViewlet {
	private managementViewletVisibleContextKey: IContextKey<boolean>;

	private disposables: IDisposable[] = [];
	private secondaryActions: IAction[] = [];
	private actions: IAction[] = [];
	private refreshAction: RefreshProfileAction;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IAuthService private authService: IAuthService,
		@IUpdateService private updateService: IUpdateService,
	) {
		super(VIEWLET_ID, ViewLocation.Management, `${VIEWLET_ID}.state`, true, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);

		this.configureViewlet();

		this._register(this.authService.onDidChangeCurrentUser(user => {
			this.configureViewlet();
			this.updateViews();
		}));

		this._register(this.updateService.onStateChange((e) => {
			this.configureViewlet();
			this.updateViews();
		}));

		this.managementViewletVisibleContextKey = ManagementViewletVisibleContext.bindTo(contextKeyService);
		this.secondaryActions = this.instantiationService.createInstance(UpdateContribution).getActions();
	}

	/**
	 * Initalizes and registers viewlet actions.
	 */
	private registerActions(): void {
		const actions = [];
		if (!this.refreshAction) {
			this.refreshAction = this.instantiationService.createInstance(RefreshProfileAction, true, 'explorer-action refresh-orgs');
		}

		actions.push(this.refreshAction);
		this.actions = actions;
	}

	/**
	 * Triggers a request to the server for updated account information. If the user has been updated onDidChangeCurrentUser
	 * event will handle refreshing the viewlet if necessary.
	 */
	private refreshViewlet(): void {
		if (this.refreshAction) {
			this.refreshAction.run();
		}
	}

	/**
	 * Register all viewlet actions, views, and update view descriptors.
	 */
	private configureViewlet(): void {
		this.registerActions();
		this.registerViews();
	}

	private registerViews(): void {
		const viewDescriptors = ViewsRegistry.getViews(ViewLocation.Management);
		const viewDescriptorsToRegister = [];
		const viewDescriptorsToDeregister = [];

		const codeHostDescriptor = this.createCodeHostDescriptor();
		const profileViewDescriptor = this.createProfileViewDescriptor();
		const updateViewDescriptor = this.createUpdateViewDescriptor();
		const organizationViewDescriptor = this.createOrganizationViewDescriptor();

		const codeHostDescriptorExists = viewDescriptors.some(v => v.id === codeHostDescriptor.id);
		const updateViewDescriptorExists = viewDescriptors.some(v => v.id === updateViewDescriptor.id);
		const organizationViewDescriptorExists = viewDescriptors.some(v => v.id === organizationViewDescriptor.id);

		if (this.updateService.state === UpdateState.UpdateDownloaded) {
			if (!updateViewDescriptorExists) {
				viewDescriptorsToRegister.push(updateViewDescriptor);
			}
		} else {
			viewDescriptorsToDeregister.push(updateViewDescriptor.id);
		}

		if (this.authService.currentUser) {
			if (!organizationViewDescriptorExists) {
				viewDescriptorsToRegister.push(organizationViewDescriptor);
			}
		} else {
			viewDescriptorsToDeregister.push(organizationViewDescriptor.id);
		}

		viewDescriptorsToRegister.push(profileViewDescriptor);
		viewDescriptorsToDeregister.push(profileViewDescriptor.id);

		if (!codeHostDescriptorExists) {
			viewDescriptorsToRegister.push(codeHostDescriptor);
		}

		ViewsRegistry.deregisterViews(viewDescriptorsToDeregister, ViewLocation.Management);
		ViewsRegistry.registerViews(viewDescriptorsToRegister);
	}

	async create(parent: Builder): TPromise<void> {
		await super.create(parent);
		const el = parent.getHTMLElement();
		DOM.addClass(el, 'management-viewlet');
	}

	private createProfileViewDescriptor(): IViewDescriptor {
		return {
			id: ProfileView.ID,
			name: localize('management.profileView', "PROFILE"),
			location: ViewLocation.Management,
			ctor: ProfileView,
			canToggleVisibility: false,
			order: 10,
			size: 5,
		};
	}

	private createCodeHostDescriptor(): IViewDescriptor {
		return {
			id: CodeHostView.ID,
			name: localize('management.connections', "CONNECTIONS"),
			location: ViewLocation.Management,
			ctor: CodeHostView,
			canToggleVisibility: false,
			order: 30,
			size: 80,
		};
	}

	private createUpdateViewDescriptor(): IViewDescriptor {
		return {
			id: UpdateView.ID,
			name: localize('management.update', "UPDATE"),
			location: ViewLocation.Management,
			ctor: UpdateView,
			canToggleVisibility: true,
			order: 50,
			size: 5,
		};
	}

	private createOrganizationViewDescriptor(): IViewDescriptor {
		return {
			id: OrganizationView.ID,
			name: localize('management.organizations', "ORGANIZATIONS"),
			location: ViewLocation.Management,
			ctor: OrganizationView,
			canToggleVisibility: true,
			order: 20,
			size: 20,
		};
	}

	getActions(): IAction[] {
		return this.actions;
	}

	getSecondaryActions(): IAction[] {
		return this.secondaryActions;
	}

	setVisible(visible: boolean): TPromise<void> {
		const isVisibilityChanged = this.isVisible() !== visible;
		return super.setVisible(visible).then(() => {
			if (isVisibilityChanged) {
				this.managementViewletVisibleContextKey.set(visible);
				if (visible) {
					this.refreshViewlet();
					this.telemetryService.publicLog('management.openViewlet');
				}
			}
		});
	}

	getOptimalWidth(): number {
		return 400;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
