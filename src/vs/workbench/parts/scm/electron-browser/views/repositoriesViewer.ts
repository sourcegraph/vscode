/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import { FileLabel } from 'vs/workbench/browser/labels';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { DefaultController, ClickBehavior } from 'vs/base/parts/tree/browser/treeDefaults';
import { IDataSource, ITree, IAccessibilityProvider, ContextMenuEvent, IRenderer } from 'vs/base/parts/tree/browser/tree';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { IKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { IAction } from 'vs/base/common/actions';
import dom = require('vs/base/browser/dom');
import { IMouseEvent } from 'vs/base/browser/mouseEvent';
import { FileKind } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { ContributableActionProvider } from 'vs/workbench/browser/actions';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { IRepositoriesModel, RepositoriesModel } from './repositoriesModel';
import { SCMMenus } from 'vs/workbench/parts/scm/electron-browser/scmMenus';
import { FolderSCMRevisionLabelAction } from 'vs/workbench/parts/workspace/browser/scmFolderActions';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { EventType } from 'vs/base/common/events';

export class DataSource implements IDataSource {

	public getId(tree: ITree, element: any): string {
		if (element instanceof RepositoriesModel) {
			return 'root';
		}
		return (<ISCMRepository>element).provider.id;
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof RepositoriesModel;
	}

	public getChildren(tree: ITree, element: any): TPromise<any> {
		if (element instanceof RepositoriesModel) {
			return TPromise.as(element.repositories);
		}

		return TPromise.as([]);
	}

	public getParent(tree: ITree, element: any): TPromise<any> {
		return TPromise.as(null);
	}
}

export interface IRepositoryTemplateData {
	container: HTMLElement;
	label: FileLabel;
	actionBar: ActionBar;
	badge: CountBadge;

	disposables: IDisposable[];
	repository: ISCMRepository;
}

export class Renderer implements IRenderer {

	public static ITEM_HEIGHT = 28;
	private static REPOSITORY_TEMPLATE_ID = 'repository';

	constructor(
		private actionProvider: ActionProvider,
		private model: IRepositoriesModel,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IMessageService private messageService: IMessageService,
	) { }

	public getHeight(tree: ITree, element: ISCMRepository): number {
		return Renderer.ITEM_HEIGHT;
	}

	public getTemplateId(tree: ITree, element: ISCMRepository): string {
		return Renderer.REPOSITORY_TEMPLATE_ID;
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): IRepositoryTemplateData {
		const disposables: IDisposable[] = [];

		const header = dom.append(container, dom.$('.header'));

		const label = this.instantiationService.createInstance(FileLabel, header, void 0);
		disposables.push(label);

		const actionBar = new ActionBar(header, { animated: false });
		disposables.push(actionBar);
		actionBar.addListener(EventType.RUN, ({ error }) => error && this.messageService.show(Severity.Error, error));

		const scmRevisionAction = this.instantiationService.createInstance(FolderSCMRevisionLabelAction);
		disposables.push(scmRevisionAction);
		actionBar.push([scmRevisionAction], { label: true, icon: true });

		const badge = new CountBadge(dom.append(container, dom.$('.badge')));
		disposables.push(attachBadgeStyler(badge, this.themeService));

		return {
			container,
			label,
			actionBar,
			badge,
			disposables,
			set repository(repository: ISCMRepository) {
				scmRevisionAction.folderResource = repository.provider.rootFolder;
				label.setFile(repository.provider.rootFolder, {
					hidePath: true,
					extraClasses: ['repository'],
					fileKind: FileKind.REPOSITORY,
				});
			},
		};
	}

	public renderElement(tree: ITree, repository: ISCMRepository, templateId: string, templateData: IRepositoryTemplateData): void {
		const count = this.model.getPendingChangesCount(repository);
		if (count > 0) {
			dom.addClass(templateData.container, 'dirty');
		} else {
			dom.removeClass(templateData.container, 'dirty');
		}
		templateData.badge.setCount(count);
		templateData.badge.setTitleFormat(count > 1 ? nls.localize('repositoryPendingChanges', "{0} pending changes", count) : nls.localize('repositoryPendingChange', "{0} pending change", count));

		templateData.repository = repository;
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: IRepositoryTemplateData): void {
		templateData.disposables = dispose(templateData.disposables);
	}
}

export class Controller extends DefaultController {

	constructor(
		private actionProvider: ActionProvider,
		private model: IRepositoriesModel,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super({ clickBehavior: ClickBehavior.ON_MOUSE_DOWN, keyboardSupport: true });
	}

	protected onLeftClick(tree: ITree, element: any, event: IMouseEvent, origin: string = 'mouse'): boolean {
		const payload = { origin: origin };
		const isDoubleClick = (origin === 'mouse' && event.detail === 2);

		// Cancel Event
		const isMouseDown = event && event.browserEvent && event.browserEvent.type === 'mousedown';
		if (!isMouseDown) {
			event.preventDefault(); // we cannot preventDefault onMouseDown because this would break DND otherwise
		}
		event.stopPropagation();

		// Set DOM focus
		tree.DOMFocus();

		// Allow to unselect
		if (event.shiftKey) {
			const selection = tree.getSelection();
			if (selection && selection.length > 0 && selection[0] === element) {
				tree.clearSelection(payload);
			}
		}

		// Select, focus, and open entries.
		else {
			tree.setFocus(element, payload);

			if (isDoubleClick) {
				event.preventDefault(); // focus moves to repository, we need to prevent default
			}

			tree.setSelection([element], payload);
			this.setActiveRepository(element);
		}

		return true;
	}

	// Do not allow left / right to expand and collapse groups #7848
	protected onLeft(tree: ITree, event: IKeyboardEvent): boolean {
		return true;
	}

	protected onRight(tree: ITree, event: IKeyboardEvent): boolean {
		return true;
	}

	public onContextMenu(tree: ITree, element: any, event: ContextMenuEvent): boolean {
		if (event.target && event.target.tagName && event.target.tagName.toLowerCase() === 'input') {
			return false;
		}
		// Check if clicked on some element
		if (element === tree.getInput()) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		tree.setFocus(element);
		const repository = element as ISCMRepository;

		let anchor = { x: event.posx + 1, y: event.posy };
		this.contextMenuService.showContextMenu({
			getAnchor: () => anchor,
			getActions: () => this.actionProvider.getSecondaryActions(tree, element),
			onHide: (wasCancelled?: boolean) => {
				if (wasCancelled) {
					tree.DOMFocus();
				}
			},
			getActionsContext: () => {
				return repository.provider;
			},
		});

		return true;
	}

	public setActiveRepository(element: ISCMRepository): void {
		this.model.activeRepository = element;
		element.focus();
	}
}

export class AccessibilityProvider implements IAccessibilityProvider {

	getAriaLabel(tree: ITree, element: any): string {
		return nls.localize('repositoryAriaLabel', "{0}, Repository", (<ISCMRepository>element).provider.label);
	}
}

export class ActionProvider extends ContributableActionProvider {

	private repositoryMenus = new Map<ISCMRepository, SCMMenus>();
	private disposables: IDisposable[] = [];

	constructor(
		private model: IRepositoriesModel,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ITextFileService private textFileService: ITextFileService,
	) {
		super();
	}

	private getSCMMenus(repository: ISCMRepository): SCMMenus {
		let menus = this.repositoryMenus.get(repository);
		if (!menus) {
			menus = this.instantiationService.createInstance(SCMMenus, repository.provider);
			this.disposables.push(menus);
			this.repositoryMenus.set(repository, menus);
		}
		return menus;
	}

	public hasActions(tree: ITree, element: any): boolean {
		return super.hasActions(tree, element) ||
			this.getSCMMenus(element as ISCMRepository).getTitleActions().length > 0;
	}

	public getActions(tree: ITree, element: any): TPromise<IAction[]> {
		return super.getActions(tree, element).then(result => {
			const actions = this.getSCMMenus(element as ISCMRepository).getTitleActions();
			return result.concat(actions);
		});
	}

	public hasSecondaryActions(tree: ITree, element: any): boolean {
		return super.hasSecondaryActions(tree, element) ||
			this.getSCMMenus(element as ISCMRepository).getTitleSecondaryActions().length > 0;
	}

	public getSecondaryActions(tree: ITree, element: any): TPromise<IAction[]> {
		return super.getSecondaryActions(tree, element).then(result => {
			const actions = this.getSCMMenus(element as ISCMRepository).getTitleSecondaryActions();
			return result.concat(actions);
		});
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
