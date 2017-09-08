/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/navbarpart';
import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import * as errors from 'vs/base/common/errors';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IContextMenuService, IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IIntegrityService } from 'vs/platform/integrity/common/integrity';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { attachInputBoxStyler } from 'vs/platform/theme/common/styler';
import { InputBox } from 'vs/base/browser/ui/inputbox/inputBox';
import { Widget } from 'vs/base/browser/ui/widget';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { FocusLocationBarAction } from 'vs/workbench/browser/parts/navbar/navbarActions';

export class LocationBarInput extends Widget {

	private inputBox: InputBox;

	constructor(
		parent: HTMLElement,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextViewService protected contextViewService: IContextViewService,
		@IWindowService private windowService: IWindowService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IWindowsService private windowsService: IWindowsService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IHistoryService private historyService: IHistoryService,
		@IKeybindingService protected keybindingService: IKeybindingService,
		@IIntegrityService private integrityService: IIntegrityService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IThemeService private themeService: IThemeService,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@IMessageService protected messageService: IMessageService,
		@IPartService private partService: IPartService
	) {
		super();

		this.create(parent);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.onmousedown(this.inputBox.inputElement, () => this.onMouseDown());
		this.onfocus(this.inputBox.inputElement, () => this.onFocus());
		this.onblur(this.inputBox.inputElement, () => this.onBlur());
		this.onkeydown(this.inputBox.inputElement, (e: IKeyboardEvent) => {
			if (e.equals(KeyCode.Enter)) {
				this.onEnter(e);
			} else if (e.equals(KeyCode.Escape)) {
				this.editorGroupService.focusGroup(this.editorGroupService.getStacksModel().activeGroup);
			}
		});
	}

	private onMouseDown(): void {
		this.inputBox.inputElement.setSelectionRange(0, 0);
	}

	private onFocus(): void {
		// Delay so that double-clicking in the input box selects a word.
		setTimeout(() => {
			if (this.inputBox.inputElement.selectionStart === this.inputBox.inputElement.selectionEnd) {
				this.inputBox.select();
			}
		}, 75);
	}

	private onBlur(): void {
		this.inputBox.inputElement.setSelectionRange(0, 0);
	}

	private onEnter(e: IKeyboardEvent): void {
		e.preventDefault();
		// TODO(sqs): pasting in about.sourcegraph.com URLs is broken because URI.toString(true)
		// over-encodes the ? in a URI fragment.
		const resource = URI.parse(this.inputBox.value);
		this.editorService.openEditor({ resource })
			.done(null, errors.onUnexpectedError);
	}

	public create(container: HTMLElement): void {
		this.inputBox = new InputBox(container, this.contextViewService, {
			ariaLabel: nls.localize('ariaLabelLocationInput', "Location input"),
		});
		this._register(attachInputBoxStyler(this.inputBox, this.themeService));
		this._register(this.inputBox);

		this.inputBox.inputElement.title = nls.localize('locationInputTooltip', "Location Bar ({0})", this.getKeybindingLabel(FocusLocationBarAction.ID));
	}

	public focus(): void {
		if (this.inputBox) {
			this.inputBox.focus();
			this.inputBox.select();
		}
	}

	set value(newValue: string) {
		this.inputBox.value = newValue;
	}

	get value(): string {
		return this.inputBox.value;
	}

	private getKeybindingLabel(id: string): string {
		const kb = this.keybindingService.lookupKeybinding(id);
		if (kb) {
			return kb.getLabel();
		}

		return null;
	}
}
