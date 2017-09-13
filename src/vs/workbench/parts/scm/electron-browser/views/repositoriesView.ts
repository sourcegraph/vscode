/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../media/scmViews';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { TPromise } from 'vs/base/common/winjs.base';
import dom = require('vs/base/browser/dom');
import { RunOnceScheduler } from 'vs/base/common/async';
import { filterEvent } from 'vs/base/common/event';
import { combinedDisposable } from 'vs/base/common/lifecycle';
import { Tree } from 'vs/base/parts/tree/browser/treeImpl';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { CollapsibleView, IViewletViewOptions, IViewOptions } from 'vs/workbench/browser/parts/views/views';
import { VIEWLET_ID, SCMViewletActiveRepositoryContext } from 'vs/workbench/parts/scm/common/scm';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { Renderer, DataSource, Controller, AccessibilityProvider, ActionProvider } from 'vs/workbench/parts/scm/electron-browser/views/repositoriesViewer';
import { IContextKeyService, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IListService } from 'vs/platform/list/browser/listService';
import { attachListStyler } from 'vs/platform/theme/common/styler';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { ViewSizing } from 'vs/base/browser/ui/splitview/splitview';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { IRepositoriesModel, RepositoriesModel } from './repositoriesModel';

const $ = dom.$;

export class RepositoriesView extends CollapsibleView {

	private static DEFAULT_VISIBLE_REPOSITORIES = 9;
	private static DEFAULT_DYNAMIC_HEIGHT = true;
	static ID = 'scm.activeRepositoriesView';
	static NAME = nls.localize('activeRepositories', "Active Repositories");

	private model: RepositoriesModel;
	private visibleRepositories: number;
	private dynamicHeight: boolean;
	private structuralTreeRefreshScheduler: RunOnceScheduler;
	private structuralRefreshDelay: number;
	private fullRefreshNeeded: boolean;

	private scmViewletActiveRepositoryContextKey: IContextKey<string>;

	constructor(
		initialSize: number,
		options: IViewletViewOptions,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IListService private listService: IListService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewletService private viewletService: IViewletService,
		@ISCMService private scmService: ISCMService,
		@IThemeService private themeService: IThemeService
	) {
		super(initialSize,
			{
				...(options as IViewOptions),
				ariaHeaderLabel: nls.localize('activeRepositoriesSection', "Active Repositories Section"),
				sizing: ViewSizing.Fixed,
				initialBodySize: RepositoriesView.computeExpandedBodySize(scmService.repositories.length)
			}, keybindingService, contextMenuService);

		this.scmViewletActiveRepositoryContextKey = SCMViewletActiveRepositoryContext.bindTo(contextKeyService);

		this.structuralRefreshDelay = 0;
		this.structuralTreeRefreshScheduler = new RunOnceScheduler(() => this.structuralTreeUpdate(), this.structuralRefreshDelay);

		this.model = this.instantiationService.createInstance(RepositoriesModel);
	}

	public renderHeader(container: HTMLElement): void {
		const focusTracker = dom.trackFocus(container);
		this.toDispose.push(focusTracker.addFocusListener(() => {
			if (this.treeContainer) {
				this.tree.DOMFocus();
			}
		}));
		this.toDispose.push(focusTracker);

		const titleDiv = dom.append(container, $('.title'));
		const titleSpan = dom.append(titleDiv, $('span'));
		titleSpan.textContent = this.name;

		super.renderHeader(container);
	}

	public renderBody(container: HTMLElement): void {
		this.treeContainer = super.renderViewTree(container);
		dom.addClass(this.treeContainer, 'repositories-list');
		dom.addClass(this.treeContainer, 'show-file-icons');

		const dataSource = this.instantiationService.createInstance(DataSource);
		const actionProvider = this.instantiationService.createInstance(ActionProvider, this.model);
		this.toDispose.push(actionProvider);
		const renderer = this.instantiationService.createInstance(Renderer, actionProvider, this.model);
		const controller = this.instantiationService.createInstance(Controller, actionProvider, this.model);
		const accessibilityProvider = this.instantiationService.createInstance(AccessibilityProvider);
		this.tree = new Tree(this.treeContainer, {
			dataSource,
			renderer,
			controller,
			accessibilityProvider,
		}, {
				indentPixels: 0,
				twistiePixels: 22,
				ariaLabel: nls.localize('treeAriaLabel', "Active Repositories: List of Active Repositories"),
				showTwistie: false,
				keyboardSupport: false
			});

		// Theme styler
		this.toDispose.push(attachListStyler(this.tree, this.themeService));

		// Register to list service
		this.toDispose.push(this.listService.register(this.tree));

		// Open when selecting via keyboard
		this.toDispose.push(this.tree.addListener('selection', event => {
			if (event && event.payload && event.payload.origin === 'keyboard') {
				controller.setActiveRepository(this.tree.getFocus());
			}
		}));

		this.onActiveRepositoryChanged();

		this.fullRefreshNeeded = true;
		this.structuralTreeUpdate();
	}

	public create(): TPromise<void> {

		// listeners
		this.registerListeners();

		return super.create();
	}

	private registerListeners(): void {

		// update on model changes
		this.toDispose.push(this.model.onDidUpdateRepositories(e => this.onRepositoriesModelChanged()));
		this.toDispose.push(this.model.onDidAddRepository(repository => this.onDidAddRepository(repository)));
		this.toDispose.push(this.model.onDidChangeActiveRepository(() => this.onActiveRepositoryChanged()));
		this.model.repositories.forEach(repository => this.onDidAddRepository(repository));

		// We are not updating the tree while the viewlet is not visible. Thus refresh when viewlet becomes visible #6702
		this.toDispose.push(this.viewletService.onDidViewletOpen(viewlet => {
			if (viewlet.getId() === VIEWLET_ID) {
				this.fullRefreshNeeded = true;
				this.structuralTreeUpdate();
			}
		}));
	}

	private onDidAddRepository(repository: ISCMRepository): void {
		const changeDisposable = repository.provider.onDidChange(() => {
			this.tree.refresh(repository, false).done(() => this.highlightActiveRepository(), null);
		});

		const onDidRemove = filterEvent(this.scmService.onDidRemoveRepository, e => e === repository);
		const removeDisposable = onDidRemove(() => {
			disposable.dispose();
			this.toDispose = this.toDispose.filter(d => d !== removeDisposable);
		});

		const disposable = combinedDisposable([changeDisposable, removeDisposable]);
		this.toDispose.push(disposable);
	}

	private onRepositoriesModelChanged(): void {
		if (this.isDisposed || !this.isVisible() || !this.tree) {
			return;
		}

		this.fullRefreshNeeded = true;
		this.structuralTreeRefreshScheduler.schedule(this.structuralRefreshDelay);
	}

	private structuralTreeUpdate(): void {
		// View size
		this.setBodySize(this.getExpandedBodySize(this.model));

		let p: TPromise<any>;
		if (this.tree.getInput() !== this.model) {
			p = this.tree.setInput(this.model);
		} else {
			p = this.tree.refresh(this.model, true);
		}
		p.done(() => {
			this.fullRefreshNeeded = false;

			this.highlightActiveRepository();
		}, errors.onUnexpectedError);
	}

	private onActiveRepositoryChanged(): void {
		const activeRepository = this.model.activeRepository;
		if (activeRepository) {
			this.scmViewletActiveRepositoryContextKey.set(activeRepository.provider.id);
		} else {
			this.scmViewletActiveRepositoryContextKey.reset();
		}
	}

	private highlightActiveRepository(): void {
		this.tree.clearFocus();
		this.tree.clearSelection();

		if (this.model.activeRepository) {
			this.tree.setFocus(this.model.activeRepository);
			this.tree.setSelection([this.model.activeRepository]);
			const relativeTop = this.tree.getRelativeTop(this.model.activeRepository);
			if (relativeTop <= 0 || relativeTop >= 1) {
				// Only reveal the element if it is not visible #8279
				this.tree.reveal(this.model.activeRepository).done(null, errors.onUnexpectedError);
			}
		}
	}

	private getExpandedBodySize(model: IRepositoriesModel): number {
		return RepositoriesView.computeExpandedBodySize(model.repositories.length, this.visibleRepositories, this.dynamicHeight);
	}

	private static computeExpandedBodySize(repositoriesCount: number, visibleRepositories = RepositoriesView.DEFAULT_VISIBLE_REPOSITORIES, dynamicHeight = RepositoriesView.DEFAULT_DYNAMIC_HEIGHT): number {
		let itemsToShow: number;
		if (dynamicHeight) {
			itemsToShow = Math.min(Math.max(visibleRepositories, 1), repositoriesCount);
		} else {
			itemsToShow = Math.max(visibleRepositories, 1);
		}

		return itemsToShow * Renderer.ITEM_HEIGHT;
	}

	public setStructuralRefreshDelay(delay: number): void {
		this.structuralRefreshDelay = delay;
	}

	public getOptimalWidth(): number {
		let parentNode = this.tree.getHTMLElement();
		let childNodes = [].slice.call(parentNode.querySelectorAll('.monaco-tree-row .content > a'));

		return dom.getLargestChildWidth(parentNode, childNodes);
	}
}
