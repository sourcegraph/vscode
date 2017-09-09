/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/navbarpart';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { Builder, $ } from 'vs/base/browser/builder';
import * as DOM from 'vs/base/browser/dom';
import { Part } from 'vs/workbench/browser/part';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IAction, Action } from 'vs/base/common/actions';
import { prepareActions } from 'vs/workbench/browser/actions';
import { EventType as BaseEventType } from 'vs/base/common/events';
import { INavBarService } from 'vs/workbench/services/nav/common/navBar';
import { INavService } from 'vs/workbench/services/nav/common/nav';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ResolvedKeybinding } from 'vs/base/common/keyCodes';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { NAV_BAR_ACTIVE_BACKGROUND, NAV_BAR_ACTIVE_FOREGROUND, NAV_BAR_INACTIVE_FOREGROUND, NAV_BAR_INACTIVE_BACKGROUND, NAV_BAR_BORDER } from 'vs/workbench/common/theme';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { NavigateBackwardsAction, NavigateForwardAction } from 'vs/workbench/browser/parts/editor/editorActions';
import { ToolBar } from 'vs/base/browser/ui/toolbar/toolbar';
import { IActionItem, ActionItem, ActionsOrientation } from 'vs/base/browser/ui/actionbar/actionbar';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { CopyLocationAction, ShareLocationAction, LocationHistoryActionItem } from 'vs/workbench/browser/parts/navbar/navbarActions';
import { LocationBarInput } from 'vs/workbench/browser/parts/navbar/locationBarInput';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';

export class NavbarPart extends Part implements INavBarService {

	public _serviceBrand: any;

	private navigateBackwardsAction: NavigateBackwardsAction;
	private navigateForwardAction: NavigateForwardAction;
	private copyLocationAction: CopyLocationAction;
	private shareLocationAction: ShareLocationAction;

	private navigationActionsToolbar: ToolBar; // before the locationBarInput
	private locationActionsToolbar: ToolBar; // after the locationBarInput
	private locationBarInput: LocationBarInput;

	private scheduler: RunOnceScheduler;
	private refreshScheduled: boolean;

	private navContainer: Builder;
	private locationContainer: Builder;

	private isInactive: boolean;

	constructor(
		id: string,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextViewService private contextViewService: IContextViewService,
		@IWindowService private windowService: IWindowService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IHistoryService private historyService: IHistoryService,
		@IKeybindingService private keybindingService: IKeybindingService,
		@IIntegrityService private integrityService: IIntegrityService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ISCMService private scmService: ISCMService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IThemeService themeService: IThemeService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IMessageService private messageService: IMessageService,
		@INavService private navService: INavService,
		@IPartService private partService: IPartService
	) {
		super(id, { hasTitle: false }, themeService);

		this.scheduler = new RunOnceScheduler(() => this.onSchedule(), 0);
		this.toUnbind.push(this.scheduler);

		this.registerListeners();
	}

	private initActions(): void {
		this.navigateBackwardsAction = this.instantiationService.createInstance(NavigateBackwardsAction, NavigateBackwardsAction.ID, NavigateBackwardsAction.LABEL);
		this.navigateForwardAction = this.instantiationService.createInstance(NavigateForwardAction, NavigateForwardAction.ID, NavigateForwardAction.LABEL);
		this.copyLocationAction = this.instantiationService.createInstance(CopyLocationAction, CopyLocationAction.ID, CopyLocationAction.LABEL);
		this.shareLocationAction = this.instantiationService.createInstance(ShareLocationAction, ShareLocationAction.ID, ShareLocationAction.LABEL);

		this.updateNavigationEnablement();
	}

	private registerListeners(): void {
		this._register(DOM.addDisposableListener(window, DOM.EventType.BLUR, () => this.onBlur()));
		this._register(DOM.addDisposableListener(window, DOM.EventType.FOCUS, () => this.onFocus()));

		this._register(this.navService.onDidNavigate(this.onDidNavigate, this));
		this.updateNavigationEnablement();
	}

	private onBlur(): void {
		this.isInactive = true;
		this.updateStyles();
	}

	private onFocus(): void {
		this.isInactive = false;
		this.updateStyles();
	}

	public createContentArea(parent: Builder): Builder {
		this.initActions();

		this.navContainer = $(parent);

		// Location
		this.locationContainer = $(this.navContainer).div({ class: 'location' });

		// Navigation actions toolbar (before the location bar input)
		const navigationActionsContainer = $(this.locationContainer).div({ class: 'actions navigation' });
		this.createNavigationActionsToolbar(navigationActionsContainer.getHTMLElement());

		// Location input
		const locationBarInputContainer = $(this.locationContainer).div({ class: 'location-input' });
		this.locationBarInput = this.instantiationService.createInstance(LocationBarInput, locationBarInputContainer.getHTMLElement());
		this._register(this.locationBarInput);

		// Location actions toolbar (after the location bar input)
		const locationActionsContainer = $(this.locationContainer).div({ class: 'actions location' });
		this.createLocationActionsToolbar(locationActionsContainer.getHTMLElement());

		this.refresh(true /* instant */);

		return this.navContainer;
	}

	public focusLocationBar(): void {
		if (this.locationBarInput) {
			this.locationBarInput.focus();
		}
	}

	protected updateStyles(): void {
		super.updateStyles();

		// Part container
		const container = this.getContainer();
		if (container) {
			container.style('color', this.getColor(this.isInactive ? NAV_BAR_INACTIVE_FOREGROUND : NAV_BAR_ACTIVE_FOREGROUND));
			container.style('background-color', this.getColor(this.isInactive ? NAV_BAR_INACTIVE_BACKGROUND : NAV_BAR_ACTIVE_BACKGROUND));

			const titleBorder = this.getColor(NAV_BAR_BORDER);
			container.style('border-bottom', titleBorder ? `1px solid ${titleBorder}` : null);
		}

		this.update(true /* instant */);
	}

	private onSchedule(): void {
		if (this.refreshScheduled) {
			this.doRefresh();
		} else {
			this.doUpdate();
		}

		this.refreshScheduled = false;
	}

	public update(instant?: boolean): void {
		if (instant) {
			this.scheduler.cancel();
			this.onSchedule();
		} else {
			this.scheduler.schedule();
		}
	}

	public refresh(instant?: boolean) {
		this.refreshScheduled = true;

		if (instant) {
			this.scheduler.cancel();
			this.onSchedule();
		} else {
			this.scheduler.schedule();
		}
	}

	private doUpdate(): void {
		this.doRefresh();
	}

	private doRefresh(): void {
		this.updateNavigationEnablement();

		// TODO(sqs): only if not dirty
		this.updateLocationInput();
	}

	private createNavigationActionsToolbar(container: HTMLElement): void {
		this.navigationActionsToolbar = new ToolBar(container, this.contextMenuService, {
			actionItemProvider: (action: Action) => this.actionItemProvider(action),
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: nls.localize('ariaLabelNavigationActions', "Navigation actions"),
			getKeyBinding: (action) => this.getKeybinding(action)
		});

		const primaryActions: IAction[] = prepareActions([
			this.navigateBackwardsAction,
			this.navigateForwardAction,
		]);
		this.navigationActionsToolbar.setActions(primaryActions)();

		// Action Run Handling
		this.toUnbind.push(this.navigationActionsToolbar.actionRunner.addListener(BaseEventType.RUN, e => this.didRunAction(e)));
	}

	private createLocationActionsToolbar(container: HTMLElement): void {
		this.locationActionsToolbar = new ToolBar(container, this.contextMenuService, {
			actionItemProvider: (action: Action) => new ActionItem(null, action, {
				label: true,
				keybinding: this.getKeybindingLabel(action.id),
			}),
			orientation: ActionsOrientation.HORIZONTAL,
			ariaLabel: nls.localize('ariaLabelLocationActions', "Location actions"),
			getKeyBinding: (action) => this.getKeybinding(action)
		});

		const primaryActions: IAction[] = prepareActions([
			this.shareLocationAction,
		]);
		const secondaryActions: IAction[] = prepareActions([
			this.copyLocationAction,
		]);
		this.locationActionsToolbar.setActions(primaryActions, secondaryActions)();

		// Action Run Handling
		this.toUnbind.push(this.locationActionsToolbar.actionRunner.addListener(BaseEventType.RUN, e => this.didRunAction(e)));
	}

	private didRunAction(e: any): void {
		// Check for Error
		if (e.error && !errors.isPromiseCanceledError(e.error)) {
			this.messageService.show(Severity.Error, e.error);
		}

		// Log in telemetry
		if (this.telemetryService) {
			this.telemetryService.publicLog('workbenchActionExecuted', { id: e.action.id, from: 'navPart' });
		}
	}

	private actionItemProvider(action: Action): IActionItem {
		return this.instantiationService.createInstance(LocationHistoryActionItem, action);
	}

	private getKeybinding(action: IAction): ResolvedKeybinding {
		return this.keybindingService.lookupKeybinding(action.id);
	}

	private getKeybindingLabel(id: string): string {
		const kb = this.keybindingService.lookupKeybinding(id);
		if (kb) {
			return kb.getLabel();
		}

		return null;
	}

	private onDidNavigate(): void {
		this.updateNavigationEnablement();
		this.updateLocationInput();
	}

	private updateNavigationEnablement(): void {
		const { back, forward } = this.historyService.canNavigate();
		if (this.navigateBackwardsAction) {
			this.navigateBackwardsAction.enabled = back;
		}
		if (this.navigateForwardAction) {
			this.navigateForwardAction.enabled = forward;
		}
	}

	private updateLocationInput(): void {
		if (!this.locationBarInput) {
			return;
		}

		const location = this.navService.getLocation();
		if (location) {
			this.locationBarInput.value = location.toString(true);
		} else {
			this.locationBarInput.value = '';
		}
	}
}
