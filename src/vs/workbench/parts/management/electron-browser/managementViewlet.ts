/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/managementViewlet';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { VIEWLET_ID, IManagementViewlet } from 'vs/workbench/parts/management/common/management';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewsRegistry, ViewLocation, IViewDescriptor } from 'vs/workbench/browser/parts/views/viewsRegistry';
import { PersistentViewsViewlet } from 'vs/workbench/browser/parts/views/views';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { CodeHostView } from 'vs/workbench/parts/management/electron-browser/codeHostView';
import { IAction } from 'vs/base/common/actions';
import { UpdateContribution } from 'vs/workbench/parts/update/electron-browser/update';

const ManagementViewletVisibleContext = new RawContextKey<boolean>('managementViewletVisible', false);

/**
 * ManagementViewlet renders a PersistentViewsViewlet. The viewlet is triggered by a GlobalViewletActionItem.
 * This viewlet holds all account settings and editor settings items.
 * Currently the only PersistentViewViewlet rendered is the CodeHostView and settings actions are
 * exposed through secondary actions.
 */
export class ManagementViewlet extends PersistentViewsViewlet implements IManagementViewlet {
	private managementViewletVisibleContextKey: IContextKey<boolean>;

	private root: HTMLElement;
	private disposables: IDisposable[] = [];
	private secondaryActions: IAction[] = [];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super(VIEWLET_ID, ViewLocation.Management, `${VIEWLET_ID}.state`, true, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);

		this.registerViews();
		this.managementViewletVisibleContextKey = ManagementViewletVisibleContext.bindTo(contextKeyService);
		this.secondaryActions = this.instantiationService.createInstance(UpdateContribution).getActions();
	}

	private registerViews(): void {
		let viewDescriptors = [];
		viewDescriptors.push(this.createCodeHostDescriptor());
		ViewsRegistry.registerViews(viewDescriptors);
	}

	create(parent: Builder): TPromise<void> {
		parent.addClass('management-viewlet');
		this.root = parent.getHTMLElement();
		let viewBox = append(this.root, $('.header'));
		return super.create(new Builder(viewBox));
	}

	private createCodeHostDescriptor(): IViewDescriptor {
		return {
			id: CodeHostView.ID,
			name: localize('accountSettings', "Account Settings"),
			location: ViewLocation.Management,
			ctor: CodeHostView,
			size: 100,
		};
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
					this.telemetryService.publicLog('management.openViewlet');
				}
			}
		});
	}

	layout(dimension: Dimension): void {
		toggleClass(this.root, 'narrow', dimension.width <= 250);
		super.layout(new Dimension(dimension.width, dimension.height - 38));
	}

	getOptimalWidth(): number {
		return 400;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
