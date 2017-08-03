/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/launcherPart';
import * as arrays from 'vs/base/common/arrays';
import * as errors from 'vs/base/common/errors';
import { Builder, $, Dimension } from 'vs/base/browser/builder';
import { Part } from 'vs/workbench/browser/part';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { Scope as MementoScope } from 'vs/workbench/common/memento';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { LAUNCHER_BAR_BACKGROUND } from 'vs/workbench/common/theme';
import { List } from 'vs/base/browser/ui/list/listWidget';
import { IDelegate, IRenderer } from 'vs/base/browser/ui/list/list';
import URI from 'vs/base/common/uri';
import { IListService } from 'vs/platform/list/browser/listService';
import { IWorkspaceEditingService } from "vs/workbench/services/workspace/common/workspaceEditing";
import { IWorkspaceContextService } from "vs/platform/workspace/common/workspace";
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { IWorkspacesService } from "vs/platform/workspaces/common/workspaces";
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
// TODO(sqs): fix import patterns so we can undisable lint here
// tslint:disable-next-line:import-patterns
import { ExplorerViewlet } from 'vs/workbench/parts/files/browser/explorerViewlet';
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from 'vs/workbench/parts/files/common/files';
import { IDisposable } from 'vs/base/common/lifecycle';
import { attachListStyler, attachButtonStyler } from 'vs/platform/theme/common/styler';
import { IconLabel } from 'vs/base/browser/ui/iconLabel/iconLabel';
import { Button } from 'vs/base/browser/ui/button/button';
// tslint:disable-next-line:import-patterns
// TODO a better way would be to let the search component register itself dynamically at the nav list
import { VIEWLET_ID as SEARCH_VIEWLET_ID } from 'vs/workbench/parts/search/common/constants';
import { ICommandService } from 'vs/platform/commands/common/commands';

const HARDCODED_ROOTS = [
	'repo://github.com/gorilla/mux',
	'repo://github.com/gorilla/schema',
	'repo://github.com/go-kit/kit',
	'repo://github.com/dgrijalva/jwt-go',
	'repo://github.com/mholt/caddy',
	'repo://github.com/golang/dep',
	'repo://github.com/Microsoft/vscode-languageserver-node',
	'repo://github.com/golang/oauth2',
	'repo://github.com/sourcegraph/checkup',
].sort();

interface ILauncherMemento {
	/** URIs of repos in the launcher */
	repos?: string[];
}

/**
 * Holds references to template elements for renderElement to render element data into
 */
interface INavTemplateData {
	/** Holds the icon of the entry */
	readonly icon: HTMLElement;
	/** Holds the display name of the entry */
	readonly label: IconLabel;
}

/**
 * Represents an item in the launcher list
 */
interface INavListElement {
	/** The displayed name in the list */
	readonly displayName: string;
	/** An octicon icon class, e.g. octicon-search */
	readonly icon: string;
}

interface IRepoListElement extends INavListElement {
	/** The URI of the repo */
	readonly uri: URI;
}

/** Template ID for List elements in the repo list */
const NAV_TEMPLATE_ID = 'nav';

/**
 * Renders individual repo List elements
 */
class NavRenderer implements IRenderer<INavListElement, INavTemplateData> {

	/** The template ID of this renderer */
	readonly templateId = NAV_TEMPLATE_ID;

	/**
	 * Creates the HTML elements that List element values are rendered into
	 */
	renderTemplate(container: HTMLElement): INavTemplateData {
		const item = document.createElement('div');
		item.classList.add('item');
		container.appendChild(item);
		const iconContainer = document.createElement('div');
		iconContainer.className = 'icon-container';
		item.appendChild(iconContainer);
		const icon = document.createElement('span');
		icon.className = 'octicon';
		iconContainer.appendChild(icon);
		const label = new IconLabel(item);
		return { icon, label };
	}

	/**
	 * Renders the INav values into the previously created template HTML elements
	 */
	renderElement(element: INavListElement, index: number, templateData: INavTemplateData): void {
		templateData.label.setValue(element.displayName);
		// TODO different icons for public/private/fork
		templateData.icon.classList.add(element.icon);
	}

	disposeTemplate(templateData: INavTemplateData): void {
		templateData.label.dispose();
	}
}

/**
 * Handles delegating an element to the correct renderer (I think)
 */
class NavDelegate implements IDelegate<INavListElement> {

	/**
	 * Returns the template to use for this element (there is only one template as of now)
	 */
	getTemplateId(element: INavListElement) {
		return NAV_TEMPLATE_ID;
	}

	/**
	 * Returns the height of the list element
	 */
	getHeight(element: INavListElement) {
		return 32;
	}
}

export class LauncherPart extends Part implements IDisposable {

	public _serviceBrand: any;

	/**
	 * The List widget that contains all repos the user can switch between
	 */
	private repoList: List<IRepoListElement>;

	/**
	 * The List widget that contains all repos the user can switch between
	 */
	private navList: List<INavListElement>;

	/**
	 * The button to add a new repository to the repo list and open it
	 */
	private addRepoButton: Button;

	/**
	 * Repos in the List in the order they occur
	 */
	private repos: IRepoListElement[] = [];

	/**
	 * Persistent storage for the launcher
	 */
	private memento: ILauncherMemento;

	private toDispose = new Set<IDisposable>();

	constructor(
		id: string,
		@IStorageService private storageService: IStorageService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPartService private partService: IPartService,
		@IThemeService themeService: IThemeService,
		@IWorkspaceEditingService private workspaceEditingService: IWorkspaceEditingService,
		@IWorkspaceContextService private workspaceContextService: IWorkspaceContextService,
		@IWorkspacesService private workspacesService: IWorkspacesService,
		@IViewletService private viewletService: IViewletService,
		@IListService private listService: IListService,
		@IWindowsService private windowsService: IWindowsService,
		@IWindowService private windowService: IWindowService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ICommandService private commandService: ICommandService
	) {
		super(id, { hasTitle: false }, themeService);

		this.memento = this.getMemento(this.storageService, MementoScope.GLOBAL);
	}

	public createContentArea(parent: Builder): Builder {
		const contentArea = document.createElement('div');
		parent.append(contentArea);
		this.createRepoList(contentArea);
		return $(contentArea);
	}

	public updateStyles(): void {
		super.updateStyles();
		// Part container
		const container = this.getContainer();
		const background = this.getColor(LAUNCHER_BAR_BACKGROUND);
		container.style('background-color', background);
	}

	private createRepoList(contentArea: HTMLElement): void {

		// Navigation list
		const navListContainer = document.createElement('div');
		navListContainer.className = 'navlist-container';
		// navListContainer.style.borderBottomWidth = '1px';
		// navListContainer.style.borderBottomStyle = 'solid';
		// navListContainer.style.borderBottomColor = this.themeService.getTheme().getColor('contrastBorder').toString();
		// navListContainer.style.borderBottomColor = '#374D6C';
		contentArea.appendChild(navListContainer);
		// Nav items
		this.navList = new List(navListContainer, new NavDelegate(), [new NavRenderer()]);
		this.toDispose.add(this.navList);
		this.toDispose.add(attachListStyler(this.navList, this.themeService));
		this.toDispose.add(this.listService.register(this.navList));
		this.navList.splice(0, this.navList.length, [
			{
				displayName: 'Search',
				icon: 'octicon-search'
			}
		]);
		// Select search button when search viewlet is opened
		this.toDispose.add(this.viewletService.onDidViewletOpen(viewlet => {
			if (viewlet.getId() === SEARCH_VIEWLET_ID) {
				if (this.navList.getSelection()[0] !== 0) {
					this.navList.setSelection([0]);
				}
			} else {
				this.navList.setSelection([]);
				this.navList.setFocus([]);
			}
		}));
		this.toDispose.add(this.navList.onSelectionChange(event => {
			// Only allow single selection
			if (event.indexes.length > 1) {
				this.repoList.setSelection([event.indexes[0]]);
				return;
			}
			if (event.indexes[0] === 0 && this.viewletService.getActiveViewlet().getId() !== SEARCH_VIEWLET_ID) {
				this.repoList.setSelection([]);
				this.repoList.setFocus([]);
				this.viewletService.openViewlet(SEARCH_VIEWLET_ID, true)
					.done(null, errors.onUnexpectedError);
			}
		}));

		// Add Repository button
		this.addRepoButton = new Button(contentArea);
		this.toDispose.add(this.addRepoButton);
		this.addRepoButton.label = 'Add Repository';
		this.toDispose.add(attachButtonStyler(this.addRepoButton, this.themeService));
		this.toDispose.add(this.addRepoButton.addListener('click', event => {
			this.commandService.executeCommand('workbench.action.openRepo');
		}));

		// Repo list
		const repoListContainer = document.createElement('div');
		contentArea.appendChild(repoListContainer);
		this.repoList = new List<IRepoListElement>(repoListContainer, new NavDelegate(), [new NavRenderer()], {
			/** Returns a unique string for every IRepo element */
			identityProvider: repo => repo.uri.toString()
		});
		this.toDispose.add(attachListStyler(this.repoList, this.themeService));
		this.toDispose.add(this.listService.register(this.repoList));
		this.toDispose.add(this.repoList);

		this.toDispose.add(
			this.repoList.onSelectionChange(event => {
				// Only allow single selection
				if (event.indexes.length > 1) {
					this.repoList.setSelection([event.indexes[0]]);
					return;
				}
				if (event.elements.length === 0) {
					return;
				}
				const newRoots = event.elements.map(repo => repo.uri);
				if (!this.workspaceContextService.hasWorkspace() || this.workspaceContextService.hasFolderWorkspace()) {
					// Upgrade workspace to multi-folder workspace
					// TODO always ensure multi-folder mode at startup to avoid reload
					this.workspacesService.createWorkspace(newRoots.map(uri => uri.toString()))
						.then(({ configPath }) => this.windowsService.openWindow([configPath]))
						.done(null, errors.onUnexpectedError);
				} else {
					// Reset the workspace to have only the selected root.
					const roots = this.workspaceContextService.getWorkspace().roots;
					const rootsToRemove = roots.filter(root => !newRoots.some(newRoot => newRoot.toString() === root.toString()));
					const rootsToAdd: URI[] = newRoots.filter(newRoot => !roots.some(root => root.toString() === newRoot.toString()));
					this.workspaceEditingService.addRoots(rootsToAdd)
						.then(() => this.configurationService.reloadConfiguration())
						.then(() => this.workspaceEditingService.removeRoots(rootsToRemove))
						.then(() => this.configurationService.reloadConfiguration())

						// TODO doesn't actually expand the workspace folder :/
						.then(() => this.viewletService.openViewlet(EXPLORER_VIEWLET_ID, true))
						.then((viewlet: ExplorerViewlet) => {
							const explorerView = viewlet.getExplorerView();
							if (explorerView) {
								// TODO(sqs): a full refresh waits too long; there is a visual lag
								// between the new root folder appearing in the explorer and it
								// being selected.
								return explorerView.refresh().then(() => {
									explorerView.expand();
									explorerView.select(newRoots[0], true);
								});
							}
							return undefined;
						})
						.done(null, errors.onUnexpectedError);
				}
			})
		);

		// Update repo list when root folders change
		// TODO causes some sort of inifinite error loop
		// this.toDispose.add(
		// 	this.workspaceContextService.onDidChangeWorkspaceRoots(() => {
		// 		this.updateRepoList();
		// 	})
		// );

		this.updateRepoList();
	}

	private updateRepoList() {
		if (!this.repoList) {
			// Not created yet
			return;
		}

		this.repos = arrays.distinct([
			...HARDCODED_ROOTS.map(uri => URI.parse(uri)),
			...(this.memento.repos || []).map(repo => URI.parse(repo)),
			...(this.workspaceContextService.hasWorkspace() ? this.workspaceContextService.getWorkspace().roots : [])
		], uri => uri.toString())
			.map(uri => ({
				uri,
				displayName: this.displayNameFromUri(uri),
				icon: uri.scheme === 'file' ? 'octicon-file-directory' : 'octicon-repo'
			}));

		this.repoList.splice(0, this.repoList.length, this.repos);

		this.updateRepoListSelection();
	}

	/**
	 * Returns a display name for a repo URI (local or remote)
	 */
	private displayNameFromUri(uri: URI): string {
		return uri.path.split('/').pop();
	}

	/**
	 * Updates the repo list selection to the currently open folder roots in the workspace
	 */
	private updateRepoListSelection(): void {
		if (!this.workspaceContextService.hasWorkspace()) {
			return;
		}
		this.repoList.setSelection(
			this.workspaceContextService.getWorkspace().roots
				.map(root => arrays.firstIndex(this.repos, listItem => listItem.uri.toString() === root.toString()))
				.filter(index => index !== -1)
		);
	}

	/**
	 * Layout title, content and status area in the given dimension.
	 */
	public layout(dimension: Dimension): Dimension[] {
		const sizes = super.layout(dimension);
		this.navList.layout();
		this.repoList.layout();
		return sizes;
	}

	public dispose(): void {
		super.dispose();
		this.toDispose.forEach(d => d.dispose());
	}

	public shutdown(): void {
		this.memento.repos = this.repos.map(repo => repo.uri.toString());
		super.shutdown();
	}
}