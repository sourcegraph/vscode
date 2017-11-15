/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import DOM = require('vs/base/browser/dom');
import errors = require('vs/base/common/errors');
import resources = require('vs/base/common/resources');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { Action } from 'vs/base/common/actions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { ITree } from 'vs/base/parts/tree/browser/tree';
import { INavigator } from 'vs/base/common/iterator';
import { SearchViewlet } from 'vs/workbench/parts/search/browser/searchViewlet';
import { Match, FileMatch, FileMatchOrMatch, FolderMatch, RenderableMatch } from 'vs/workbench/parts/search/common/searchModel';
import { IReplaceService } from 'vs/workbench/parts/search/common/replace';
import * as Constants from 'vs/workbench/parts/search/common/constants';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ResolvedKeybinding, createKeybinding } from 'vs/base/common/keyCodes';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IListService } from 'vs/platform/list/browser/listService';
import { explorerItemToFileResource } from 'vs/workbench/parts/files/common/files';
import { OS } from 'vs/base/common/platform';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { SourcegraphSearchViewlet } from 'vs/workbench/parts/search/browser/sourcegraphSearchViewlet';

export function isSearchViewletFocused(viewletService: IViewletService): boolean {
	let activeViewlet = viewletService.getActiveViewlet();
	let activeElement = document.activeElement;
	return activeViewlet && activeViewlet.getId() === Constants.VIEWLET_ID && activeElement && DOM.isAncestor(activeElement, (<SearchViewlet>activeViewlet).getContainer().getHTMLElement());
}

export function appendKeyBindingLabel(label: string, keyBinding: number | ResolvedKeybinding, keyBindingService2: IKeybindingService): string {
	if (typeof keyBinding === 'number') {
		const resolvedKeybindings = keyBindingService2.resolveKeybinding(createKeybinding(keyBinding, OS));
		return doAppendKeyBindingLabel(label, resolvedKeybindings.length > 0 ? resolvedKeybindings[0] : null);
	} else {
		return doAppendKeyBindingLabel(label, keyBinding);
	}
}

function doAppendKeyBindingLabel(label: string, keyBinding: ResolvedKeybinding): string {
	return keyBinding ? label + ' (' + keyBinding.getLabel() + ')' : label;
}

export const toggleCaseSensitiveCommand = (accessor: ServicesAccessor) => {
	const viewletService = accessor.get<IViewletService>(IViewletService);
	let searchViewlet = <SearchViewlet>viewletService.getActiveViewlet();
	searchViewlet.toggleCaseSensitive();
};

export const toggleWholeWordCommand = (accessor: ServicesAccessor) => {
	const viewletService = accessor.get<IViewletService>(IViewletService);
	let searchViewlet = <SearchViewlet>viewletService.getActiveViewlet();
	searchViewlet.toggleWholeWords();
};

export const toggleRegexCommand = (accessor: ServicesAccessor) => {
	const viewletService = accessor.get<IViewletService>(IViewletService);
	let searchViewlet = <SearchViewlet>viewletService.getActiveViewlet();
	searchViewlet.toggleRegex();
};

export class ShowNextSearchIncludeAction extends Action {

	public static ID = 'search.history.showNextIncludePattern';
	public static LABEL = nls.localize('nextSearchIncludePattern', "Show Next Search Include Pattern");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.PatternIncludesFocusedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowNextSearchIncludeAction.CONTEXT_KEY_EXPRESSION);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchIncludePattern;
		searchAndReplaceWidget.showNextTerm();
		return TPromise.as(null);
	}
}

export class ShowPreviousSearchIncludeAction extends Action {

	public static ID = 'search.history.showPreviousIncludePattern';
	public static LABEL = nls.localize('previousSearchIncludePattern', "Show Previous Search Include Pattern");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.PatternIncludesFocusedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowPreviousSearchIncludeAction.CONTEXT_KEY_EXPRESSION);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchIncludePattern;
		searchAndReplaceWidget.showPreviousTerm();
		return TPromise.as(null);
	}
}

export class ShowNextSearchExcludeAction extends Action {

	public static ID = 'search.history.showNextExcludePattern';
	public static LABEL = nls.localize('nextSearchExcludePattern', "Show Next Search Exclude Pattern");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.PatternExcludesFocusedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowNextSearchExcludeAction.CONTEXT_KEY_EXPRESSION);
	}
	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchExcludePattern;
		searchAndReplaceWidget.showNextTerm();
		return TPromise.as(null);
	}
}

export class ShowPreviousSearchExcludeAction extends Action {

	public static ID = 'search.history.showPreviousExcludePattern';
	public static LABEL = nls.localize('previousSearchExcludePattern', "Show Previous Search Exclude Pattern");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.PatternExcludesFocusedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowPreviousSearchExcludeAction.CONTEXT_KEY_EXPRESSION);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchExcludePattern;
		searchAndReplaceWidget.showPreviousTerm();
		return TPromise.as(null);
	}
}

export class ShowNextSearchTermAction extends Action {

	public static ID = 'search.history.showNext';
	public static LABEL = nls.localize('nextSearchTerm', "Show Next Search Term");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocusedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowNextSearchTermAction.CONTEXT_KEY_EXPRESSION);

	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchAndReplaceWidget;
		searchAndReplaceWidget.showNextSearchTerm();
		return TPromise.as(null);
	}
}

export class ShowPreviousSearchTermAction extends Action {

	public static ID = 'search.history.showPrevious';
	public static LABEL = nls.localize('previousSearchTerm', "Show Previous Search Term");
	public static CONTEXT_KEY_EXPRESSION: ContextKeyExpr = ContextKeyExpr.and(Constants.SearchViewletVisibleKey, Constants.SearchInputBoxFocusedKey);

	constructor(id: string, label: string,
		@IViewletService private viewletService: IViewletService,
		@IContextKeyService private contextKeyService: IContextKeyService
	) {
		super(id, label);
		this.enabled = this.contextKeyService.contextMatchesRules(ShowPreviousSearchTermAction.CONTEXT_KEY_EXPRESSION);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchAndReplaceWidget;
		searchAndReplaceWidget.showPreviousSearchTerm();
		return TPromise.as(null);
	}
}

export class FocusNextInputAction extends Action {

	public static ID = 'search.focus.nextInputBox';
	public static LABEL = nls.localize('focusNextInputBox', "Focus Next Input Box");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		(<SearchViewlet>this.viewletService.getActiveViewlet()).focusNextInputBox();
		return TPromise.as(null);
	}
}

export class FocusPreviousInputAction extends Action {

	public static ID = 'search.focus.previousInputBox';
	public static LABEL = nls.localize('focusPreviousInputBox', "Focus Previous Input Box");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		(<SearchViewlet>this.viewletService.getActiveViewlet()).focusPreviousInputBox();
		return TPromise.as(null);
	}
}

export const FocusActiveEditorCommand = (accessor: ServicesAccessor) => {
	const editorService = accessor.get(IWorkbenchEditorService);
	const editor = editorService.getActiveEditor();
	if (editor) {
		editor.focus();
	}
	return TPromise.as(true);
};

export interface IFindOrReplaceActionOpts {
	selectWidgetText: boolean;
	focusReplace: boolean;
	expandSearchReplaceWidget: boolean;
	takeEditorText?: boolean;
}

export abstract class FindOrReplaceInFilesAction extends Action {

	constructor(id: string, label: string, private viewletService: IViewletService,
		private options: IFindOrReplaceActionOpts) {
		super(id, label);
	}

	public run(): TPromise<any> {
		const viewlet = this.viewletService.getActiveViewlet();
		const searchViewletWasOpen = viewlet && viewlet.getId() === Constants.VIEWLET_ID;
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then((viewlet) => {
			if (this.options.takeEditorText) {
				(<SearchViewlet>viewlet).takeEditorText();
			}

			if (!searchViewletWasOpen || this.options.expandSearchReplaceWidget) {
				const searchAndReplaceWidget = (<SearchViewlet>viewlet).searchAndReplaceWidget;
				searchAndReplaceWidget.toggleReplace(this.options.expandSearchReplaceWidget);
				searchAndReplaceWidget.focus(this.options.selectWidgetText, this.options.focusReplace);
			}

			return viewlet;
		});
	}
}

export const SHOW_SEARCH_LABEL = nls.localize('showSearchViewlet', "Show Search");

export class FindInFilesAction extends FindOrReplaceInFilesAction {

	public static LABEL = nls.localize('findInFiles', "Find in Files");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService) {
		super(id, label, viewletService, {
			expandSearchReplaceWidget: false,
			selectWidgetText: true,
			focusReplace: false
		});
	}
}

export class FindInFilesWithSelectedTextAction extends FindOrReplaceInFilesAction {

	public static ID = 'workbench.action.findInFilesWithSelectedText';
	public static LABEL = nls.localize('findInFilesWithSelectedText', "Find in Files With Selected Text");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService) {
		super(id, label, viewletService, {
			expandSearchReplaceWidget: false,
			selectWidgetText: true,
			focusReplace: false,
			takeEditorText: true
		});
	}
}

export class RunQueryAction {

	constructor( @IViewletService private viewletService: IViewletService) { }

	public run(query: string): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then((viewlet: SourcegraphSearchViewlet) => {
			viewlet.searchAndReplaceWidget.searchInput.setValue(query);
			viewlet.onQueryChanged(true, true, false);
		});
	}
}

export class ReplaceInFilesAction extends FindOrReplaceInFilesAction {

	public static ID = 'workbench.action.replaceInFiles';
	public static LABEL = nls.localize('replaceInFiles', "Replace in Files");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService) {
		super(id, label, viewletService, {
			expandSearchReplaceWidget: true,
			selectWidgetText: false,
			focusReplace: true
		});
	}
}

export class ReplaceInFilesWithSelectedTextAction extends FindOrReplaceInFilesAction {

	public static ID = 'workbench.action.replaceInFilesWithSelectedText';
	public static LABEL = nls.localize('replaceInFilesWithSelectedText', "Replace in Files With Selected Text");

	constructor(id: string, label: string, @IViewletService viewletService: IViewletService) {
		super(id, label, viewletService, {
			expandSearchReplaceWidget: true,
			selectWidgetText: false,
			focusReplace: true,
			takeEditorText: true
		});
	}
}

export class CloseReplaceAction extends Action {

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		let searchAndReplaceWidget = (<SearchViewlet>this.viewletService.getActiveViewlet()).searchAndReplaceWidget;
		searchAndReplaceWidget.toggleReplace(false);
		searchAndReplaceWidget.focus();
		return TPromise.as(null);
	}
}

export class FindInWorkspaceAction extends Action {

	public static ID = 'filesExplorer.findInWorkspace';

	constructor( @IViewletService private viewletService: IViewletService) {
		super(FindInWorkspaceAction.ID, nls.localize('findInWorkspace', "Find in Workspace..."));
	}

	public run(event?: any): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID, true).then(viewlet => {
			(viewlet as SearchViewlet).searchInFolder(null);
		});
	}
}

export class FindInFolderAction extends Action {

	public static ID = 'filesExplorer.findInFolder';

	private resource: URI;

	constructor(resource: URI, @IInstantiationService private instantiationService: IInstantiationService) {
		super(FindInFolderAction.ID, nls.localize('findInFolder', "Find in Folder..."));

		this.resource = resource;
	}

	public run(event?: any): TPromise<any> {
		return this.instantiationService.invokeFunction.apply(this.instantiationService, [findInFolderCommand, this.resource]);
	}
}

export const findInFolderCommand = (accessor: ServicesAccessor, resource?: URI) => {
	const listService = accessor.get(IListService);
	const viewletService = accessor.get(IViewletService);

	if (!URI.isUri(resource)) {
		const focused = listService.getFocused() ? listService.getFocused().getFocus() : void 0;
		if (focused) {
			const file = explorerItemToFileResource(focused);
			if (file) {
				resource = file.isDirectory ? file.resource : resources.dirname(file.resource);
			}
		}
	}

	viewletService.openViewlet(Constants.VIEWLET_ID, true).then(viewlet => {
		if (resource) {
			(viewlet as SearchViewlet).searchInFolder(resource);
		}
	}).done(null, errors.onUnexpectedError);
};

export class FindInFolderResourcesAction extends Action {

	public static ID = 'search.action.findInFolderResources';

	private folderResources?: string[];

	constructor(folderResources: (string | URI)[], @IInstantiationService private instantiationService: IInstantiationService) {
		super(FindInFolderResourcesAction.ID, nls.localize('findInFolderResources', "Find in Folder Resources"));

		if (folderResources) {
			this.folderResources = folderResources.map(resource => URI.isUri(resource) ? resource.toString() : resource);
		}
	}

	public run(event?: any): TPromise<any> {
		return this.instantiationService.invokeFunction.apply(this.instantiationService, [findInFolderResourcesCommand, this.folderResources]);
	}
}

export const findInFolderResourcesCommand = (accessor: ServicesAccessor, folderResources?: (string | URI)[], query?: string, regexp?: boolean) => {
	const viewletService = accessor.get(IViewletService);
	viewletService.openViewlet(Constants.VIEWLET_ID, false).then((viewlet: SourcegraphSearchViewlet) => {
		if (regexp === true || regexp === false) {
			viewlet.searchAndReplaceWidget.searchInput.setRegex(regexp);
		}
		if (query) {
			viewlet.searchAndReplaceWidget.searchInput.setValue(query);
		}
		viewlet.onQueryChanged(true);
	}).done(null, errors.onUnexpectedError);
};

export class RefreshAction extends Action {

	constructor(private viewlet: SearchViewlet) {
		super('refresh');

		this.label = nls.localize('RefreshAction.label', "Refresh");
		this.enabled = false;
		this.class = 'search-action refresh';
	}

	public run(): TPromise<void> {
		this.viewlet.onQueryChanged(true);

		return TPromise.as(null);
	}
}

export class CollapseDeepestExpandedLevelAction extends Action {
	private viewer: ITree;

	constructor(viewlet: SearchViewlet, enabled: boolean = false) {
		super('vs.tree.collapse', nls.localize('collapse', "Collapse"), 'monaco-tree-action collapse-all', enabled);
		this.viewer = viewlet.getControl();
		this.class = 'search-action collapse';
	}

	public run(context?: any): TPromise<any> {
		if (this.viewer.getHighlight()) {
			return TPromise.as(null); // Global action disabled if user is in edit mode from another action
		}

		this.viewer.collapseDeepestExpandedLevel();
		this.viewer.clearSelection();
		this.viewer.clearFocus();
		this.viewer.DOMFocus();
		this.viewer.focusFirst();

		return TPromise.as(null);
	}
}

export class ClearSearchResultsAction extends Action {

	constructor(private viewlet: SearchViewlet) {
		super('clearSearchResults');

		this.label = nls.localize('ClearSearchResultsAction.label', "Clear Search Results");
		this.enabled = false;
		this.class = 'search-action clear-search-results';
	}

	public run(): TPromise<void> {
		this.viewlet.clearSearchResults();

		return TPromise.as(null);
	}
}

export class FocusNextSearchResultAction extends Action {
	public static ID = 'search.action.focusNextSearchResult';
	public static LABEL = nls.localize('FocusNextSearchResult.label', "Focus Next Search Result");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID).then(searchViewlet => {
			(searchViewlet as SearchViewlet).selectNextMatch();
		});
	}
}

export class FocusPreviousSearchResultAction extends Action {
	public static ID = 'search.action.focusPreviousSearchResult';
	public static LABEL = nls.localize('FocusPreviousSearchResult.label', "Focus Previous Search Result");

	constructor(id: string, label: string, @IViewletService private viewletService: IViewletService) {
		super(id, label);
	}

	public run(): TPromise<any> {
		return this.viewletService.openViewlet(Constants.VIEWLET_ID).then(searchViewlet => {
			(searchViewlet as SearchViewlet).selectPreviousMatch();
		});
	}
}

export abstract class AbstractSearchAndReplaceAction extends Action {

	/**
	 * Returns element to focus after removing the given element
	 */
	public getElementToFocusAfterRemoved(viewer: ITree, elementToBeRemoved: RenderableMatch): RenderableMatch {
		let elementToFocus = this.getNextElementAfterRemoved(viewer, elementToBeRemoved);
		if (!elementToFocus) {
			elementToFocus = this.getPreviousElementAfterRemoved(viewer, elementToBeRemoved);
		}
		return elementToFocus;
	}

	public getNextElementAfterRemoved(viewer: ITree, element: RenderableMatch): RenderableMatch {
		let navigator: INavigator<any> = this.getNavigatorAt(element, viewer);
		if (element instanceof FolderMatch) {
			// If file match is removed then next element is the next file match
			while (!!navigator.next() && !(navigator.current() instanceof FolderMatch)) { }
		} else if (element instanceof FileMatch) {
			// If file match is removed then next element is the next file match
			while (!!navigator.next() && !(navigator.current() instanceof FileMatch)) { }
		} else {
			navigator.next();
		}
		return navigator.current();
	}

	public getPreviousElementAfterRemoved(viewer: ITree, element: RenderableMatch): RenderableMatch {
		let navigator: INavigator<any> = this.getNavigatorAt(element, viewer);
		let previousElement = navigator.previous();
		if (element instanceof Match && element.parent().matches().length === 1) {
			// If this is the only match, then the file match is also removed
			// Hence take the previous element to file match
			previousElement = navigator.previous();
		}
		return previousElement;
	}

	private getNavigatorAt(element: RenderableMatch, viewer: ITree): INavigator<any> {
		let navigator: INavigator<any> = viewer.getNavigator();
		while (navigator.current() !== element && !!navigator.next()) { }
		return navigator;
	}
}

export class RemoveAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private element: RenderableMatch) {
		super('remove', nls.localize('RemoveAction.label', "Dismiss"), 'action-remove');
	}

	public run(): TPromise<any> {
		let nextFocusElement = this.getElementToFocusAfterRemoved(this.viewer, this.element);
		if (nextFocusElement) {
			this.viewer.setFocus(nextFocusElement);
		}

		let elementToRefresh: any;
		const element = this.element;
		if (element instanceof FolderMatch) {
			let parent = element.parent();
			parent.remove(element);
			elementToRefresh = parent;
		} else if (element instanceof FileMatch) {
			let parent = element.parent();
			parent.remove(element);
			elementToRefresh = parent;
		} else if (element instanceof Match) {
			let parent = element.parent();
			parent.remove(element);
			elementToRefresh = parent.count() === 0 ? parent.parent() : parent;
		}

		this.viewer.DOMFocus();
		return this.viewer.refresh(elementToRefresh);
	}

}

export class ReplaceAllAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private fileMatch: FileMatch, private viewlet: SearchViewlet,
		@IKeybindingService keyBindingService: IKeybindingService,
		@ITelemetryService private telemetryService: ITelemetryService) {
		super(Constants.ReplaceAllInFileActionId, appendKeyBindingLabel(nls.localize('file.replaceAll.label', "Replace All"), keyBindingService.lookupKeybinding(Constants.ReplaceAllInFileActionId), keyBindingService), 'action-replace-all');
	}

	public run(): TPromise<any> {
		/* __GDPR__
			"replaceAll.action.selected" : {}
		*/
		this.telemetryService.publicLog('replaceAll.action.selected');
		let nextFocusElement = this.getElementToFocusAfterRemoved(this.viewer, this.fileMatch);
		return this.fileMatch.parent().replace(this.fileMatch).then(() => {
			if (nextFocusElement) {
				this.viewer.setFocus(nextFocusElement);
			}
			this.viewer.DOMFocus();
			this.viewlet.open(this.fileMatch, true);
		});
	}
}

export class ReplaceAllInFolderAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private folderMatch: FolderMatch,
		@IKeybindingService keyBindingService: IKeybindingService,
		@ITelemetryService private telemetryService: ITelemetryService
	) {
		super(Constants.ReplaceAllInFolderActionId, nls.localize('file.replaceAll.label', "Replace All"), 'action-replace-all');
	}

	public async run(): TPromise<any> {
		/* __GDPR__
			"replaceAllInFolder.action.selected" : {}
		*/
		this.telemetryService.publicLog('replaceAllInFolder.action.selected');
		let nextFocusElement = this.getElementToFocusAfterRemoved(this.viewer, this.folderMatch);
		await this.folderMatch.replaceAll();

		if (nextFocusElement) {
			this.viewer.setFocus(nextFocusElement);
		}
		this.viewer.DOMFocus();
	}
}

export class ReplaceAction extends AbstractSearchAndReplaceAction {

	constructor(private viewer: ITree, private element: Match, private viewlet: SearchViewlet,
		@IReplaceService private replaceService: IReplaceService,
		@IKeybindingService keyBindingService: IKeybindingService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITelemetryService private telemetryService: ITelemetryService) {
		super(Constants.ReplaceActionId, appendKeyBindingLabel(nls.localize('match.replace.label', "Replace"), keyBindingService.lookupKeybinding(Constants.ReplaceActionId), keyBindingService), 'action-replace');
	}

	public run(): TPromise<any> {
		this.enabled = false;
		/* __GDPR__
			"replace.action.selected" : {}
		*/
		this.telemetryService.publicLog('replace.action.selected');

		return this.element.parent().replace(this.element).then(() => {
			let elementToFocus = this.getElementToFocusAfterReplace();
			if (elementToFocus) {
				this.viewer.setFocus(elementToFocus);
			}
			let elementToShowReplacePreview = this.getElementToShowReplacePreview(elementToFocus);
			this.viewer.DOMFocus();
			if (!elementToShowReplacePreview || this.hasToOpenFile()) {
				this.viewlet.open(this.element, true);
			} else {
				this.replaceService.openReplacePreview(elementToShowReplacePreview, true);
			}
		});
	}

	private getElementToFocusAfterReplace(): Match {
		let navigator: INavigator<any> = this.viewer.getNavigator();
		let fileMatched = false;
		let elementToFocus = null;
		do {
			elementToFocus = navigator.current();
			if (elementToFocus instanceof Match) {
				if (elementToFocus.parent().id() === this.element.parent().id()) {
					fileMatched = true;
					if (this.element.range().getStartPosition().isBeforeOrEqual((<Match>elementToFocus).range().getStartPosition())) {
						// Closest next match in the same file
						break;
					}
				} else if (fileMatched) {
					// First match in the next file (if expanded)
					break;
				}
			} else if (fileMatched) {
				if (!this.viewer.isExpanded(elementToFocus)) {
					// Next file match (if collapsed)
					break;
				}
			}
		} while (!!navigator.next());
		return elementToFocus;
	}

	private getElementToShowReplacePreview(elementToFocus: FileMatchOrMatch): Match {
		if (this.hasSameParent(elementToFocus)) {
			return <Match>elementToFocus;
		}
		let previousElement = this.getPreviousElementAfterRemoved(this.viewer, this.element);
		if (this.hasSameParent(previousElement)) {
			return <Match>previousElement;
		}
		return null;
	}

	private hasSameParent(element: RenderableMatch): boolean {
		return element && element instanceof Match && element.parent().resource() === this.element.parent().resource();
	}

	private hasToOpenFile(): boolean {
		const activeInput = this.editorService.getActiveEditorInput();
		const file = activeInput ? activeInput.getResource() : void 0;
		if (file) {
			return file.toString() === this.element.parent().resource().toString();
		}
		return false;
	}
}
