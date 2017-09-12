/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/contextbarpart';
import { TPromise } from 'vs/base/common/winjs.base';
import dom = require('vs/base/browser/dom');
import { dispose, IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { runAtThisOrScheduleAtNextAnimationFrame } from 'vs/base/browser/dom';
import { $, Builder } from 'vs/base/browser/builder';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Part } from 'vs/workbench/browser/part';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';
import { getCodeEditor } from 'vs/editor/common/services/codeEditorService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { CONTEXT_BAR_BACKGROUND, CONTEXT_BAR_FOREGROUND, CONTEXT_BAR_BORDER } from 'vs/workbench/common/theme';
import { contrastBorder } from 'vs/platform/theme/common/colorRegistry';
import { isEmptyMarkdownString } from 'vs/base/common/htmlContent';
import { MarkdownRenderer } from 'vs/editor/contrib/markdown/browser/markdownRenderer';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { IContextData } from 'vs/editor/contrib/context/common/context';
import { EditorContextController } from 'vs/editor/contrib/context/browser/contextController';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { WorkbenchContextWidget } from 'vs/workbench/browser/parts/contextbar/contextWidgets';
import { HideContextbarAction } from 'vs/workbench/browser/actions/toggleContextbarVisibility';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

interface IEditorData extends IDisposable {
	control: ICommonCodeEditor;
	controller: EditorContextController;
	markdownRenderer: MarkdownRenderer;
	widget: WorkbenchContextWidget;
	items: IContextData[];
}

export class ContextbarPart extends Part {

	public _serviceBrand: any;

	private enabled: boolean = false;
	private activeEditorData: IEditorData | undefined;
	private delayedRender: IDisposable;

	constructor(
		id: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
	) {
		super(id, { hasTitle: false }, themeService);

		this._register(toDisposable(() => {
			if (this.delayedRender) {
				this.delayedRender.dispose();
			}
		}));
		this._register(toDisposable(() => {
			if (this.activeEditorData) {
				this.activeEditorData.dispose();
			}
		}));
		this._register(this.configurationService.onDidUpdateConfiguration(() => this.onConfigurationChanged()));
		this.onConfigurationChanged();
	}

	public createContentArea(parent: Builder): Builder {
		const container = $(parent);

		$(container).on('contextmenu', (e: MouseEvent) => {
			dom.EventHelper.stop(e, true);
			this.showContextMenu(new StandardMouseEvent(e));
		});

		this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged());
		this.themeService.onThemeChange(() => this.update());

		this.onEditorsChanged();

		return container;
	}

	protected updateStyles(): void {
		super.updateStyles();

		const container = this.getContainer();

		container.style('color', this.getColor(CONTEXT_BAR_FOREGROUND));
		container.style('background-color', this.getColor(CONTEXT_BAR_BACKGROUND));

		const borderColor = this.getColor(CONTEXT_BAR_BORDER) || this.getColor(contrastBorder);
		container.style('border-top-width', borderColor ? '1px' : null);
		container.style('border-top-style', borderColor ? 'solid' : null);
		container.style('border-top-color', borderColor);
	}

	private update(): void {
		if (this.delayedRender) {
			return;
		}

		this.delayedRender = runAtThisOrScheduleAtNextAnimationFrame(() => {
			this.delayedRender = null;
			this.renderNow();
		});
	}

	private renderNow(): void {
		if (this.activeEditorData) {
			const items = this.activeEditorData.items;
			const fragment = document.createDocumentFragment();
			for (const { item } of items) {
				if (item.contents) {
					for (const content of item.contents) {
						if (!isEmptyMarkdownString(content)) {
							const renderedContents = this.activeEditorData.markdownRenderer.render(content);

							const el = document.createElement('div');
							dom.addClass(el, 'context-row');
							dom.append(el, renderedContents);

							fragment.appendChild(el);
						}
					}
				}
			}

			this.activeEditorData.widget.updateContents(fragment);
			this.activeEditorData.widget.show();
		}
	}

	private onConfigurationChanged(): void {
		type ContextBarConfiguration = {
			workbench: {
				contextBar: {
					visible: boolean;
				};
			};
		};
		const config = this.configurationService.getConfiguration<ContextBarConfiguration>();
		const enabled = !!config.workbench.contextBar.visible;

		const didChange = this.enabled !== enabled;
		this.enabled = enabled;
		if (didChange) {
			if (enabled) {
				this.onEditorsChanged();
			} else {
				if (this.activeEditorData) {
					this.activeEditorData.dispose();
					this.activeEditorData = undefined;
				}
			}
		}
	}

	private onEditorsChanged(): void {
		if (this.activeEditorData) {
			this.activeEditorData.dispose();
			this.activeEditorData = undefined;
		}

		const activeEditor = this.editorService.getActiveEditor();
		const control = getCodeEditor(activeEditor);

		if (control) {
			const activeEditorDisposables: IDisposable[] = [];

			const controller = this.instantiationService.createInstance(EditorContextController, control);
			activeEditorDisposables.push(controller);

			const widget = this.instantiationService.createInstance(WorkbenchContextWidget, this.getContainer().getHTMLElement(), control);
			activeEditorDisposables.push(widget);

			this.activeEditorData = {
				control,
				controller,
				markdownRenderer: this.instantiationService.createInstance(MarkdownRenderer, control),
				widget,
				items: [],
				dispose: () => dispose(activeEditorDisposables),
			};

			activeEditorDisposables.push(controller.onDidChange(items => {
				this.activeEditorData.items = items;
				this.update();
			}));
		}

		this.update();
	}

	private showContextMenu(event: StandardMouseEvent): void {
		this.contextMenuService.showContextMenu({
			getAnchor: () => ({ x: event.posx, y: event.posy }),
			getActions: () => TPromise.as([
				this.instantiationService.createInstance(HideContextbarAction, HideContextbarAction.ID, HideContextbarAction.LABEL),
			]),
		});
	}
}
