/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./homePage';
import URI from 'vs/base/common/uri';
import { WalkThroughInput } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughInput';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Position } from 'vs/platform/editor/common/editor';
import { onUnexpectedError } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { Schemas } from 'vs/base/common/network';
import { IBackupFileService } from 'vs/workbench/services/backup/common/backup';
import { used } from 'vs/workbench/parts/welcome/page/electron-browser/sourcegraph_home_page';
import { ILifecycleService, StartupKind } from 'vs/platform/lifecycle/common/lifecycle';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { StandardKeyboardEvent } from "vs/base/browser/keyboardEvent";
import { KeyCode } from "vs/base/common/keyCodes";
import { IViewletService } from "vs/workbench/services/viewlet/browser/viewlet";
import { VIEWLET_ID as SEARCH_VIEWLET_ID } from 'vs/workbench/parts/search/common/constants';
import { SourcegraphSearchViewlet } from "vs/workbench/parts/search/browser/sourcegraphSearchViewlet";
import { EditorInput, IEditorInputFactory } from "vs/workbench/common/editor";
import { ICommandService } from "vs/platform/commands/common/commands";

used();

export class HomePageContribution implements IWorkbenchContribution {

	constructor(
		@IPartService partService: IPartService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IBackupFileService backupFileService: IBackupFileService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		if (lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
			TPromise.join([
				backupFileService.hasBackups(),
				partService.joinCreation()
			]).then(([hasBackups]) => {
				const activeInput = editorService.getActiveEditorInput();
				if (!activeInput && !hasBackups) {
					return instantiationService.createInstance(HomePage)
						.openEditor();
				}
				return undefined;
			}).then(null, onUnexpectedError);
		}
	}

	public getId() {
		return 'vs.homePage';
	}
}

const homeInputTypeId = 'workbench.editors.homePageInput';
const telemetryFrom = 'homePage';

class HomePage {

	private disposables: IDisposable[] = [];

	readonly editorInput: WalkThroughInput;

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IViewletService private viewletService: IViewletService,
		@ICommandService private commandService: ICommandService,
	) {
		this.disposables.push(lifecycleService.onShutdown(() => this.dispose()));

		const resource = URI.parse(require.toUrl('./sourcegraph_home_page'))
			.with({
				scheme: Schemas.walkThrough,
				query: JSON.stringify({ moduleId: 'vs/workbench/parts/welcome/page/electron-browser/sourcegraph_home_page' })
			});
		this.editorInput = this.instantiationService.createInstance(WalkThroughInput, {
			typeId: homeInputTypeId,
			name: localize('home.title', "Search"),
			resource,
			telemetryFrom,
			onReady: container => { this.onReady(container); },
		});
	}

	public openEditor() {
		return this.editorService.openEditor(this.editorInput, { pinned: true }, Position.ONE);
	}

	private onReady(container: HTMLElement): void {
		const searchInput = <HTMLInputElement>container.querySelector('.searchInput');
		const searchButton = <HTMLLinkElement>container.querySelector('.searchButton');
		const reposInput = <HTMLTextAreaElement>container.querySelector('.reposInput');
		const regexOption = <HTMLInputElement>container.querySelector('.regexOption');
		const wholeWordsOption = <HTMLInputElement>container.querySelector('.wholeWordsOption');
		const caseSensitiveOption = <HTMLInputElement>container.querySelector('.caseSensitiveOption');
		const includePatternInput = <HTMLInputElement>container.querySelector('.includePatternInput');

		this.viewletService.resolveViewlet(SEARCH_VIEWLET_ID).then((viewlet: SourcegraphSearchViewlet) => {
			const sync = () => {
				searchInput.value = viewlet.searchAndReplaceWidget.searchInput.getValue();
				regexOption.checked = viewlet.searchAndReplaceWidget.searchInput.getRegex();
				wholeWordsOption.checked = viewlet.searchAndReplaceWidget.searchInput.getWholeWords();
				caseSensitiveOption.checked = viewlet.searchAndReplaceWidget.searchInput.getCaseSensitive();
				includePatternInput.value = viewlet.searchIncludePattern.getValue();
				reposInput.value = viewlet.inputRepoSelector.workspaces
					.map(s => s.replace(/^.*:\/\//, '')) // humans prefer reading paths not uris
					.join(' ');
			};

			sync();

			this.disposables.push(
				viewlet.searchAndReplaceWidget.searchInput.onDidOptionChange(sync),
				viewlet.searchAndReplaceWidget.searchInput.onInput(sync),
				viewlet.inputRepoSelector.onWorkspacesDidChange(sync),
				viewlet.searchIncludePattern.onSubmit(sync),
			);

			this.addEventListener(searchInput, 'input', () => {
				viewlet.searchAndReplaceWidget.searchInput.setValue(searchInput.value);
			});
			this.addEventListener(reposInput, 'blur', () => {
				if (!(viewlet instanceof SourcegraphSearchViewlet)) {
					throw new Error();
				}
				viewlet.inputRepoSelector.workspaces = reposInput.value.split(/[\s,]+/).filter(repo => !!repo);
			});
			this.addEventListener(regexOption, 'change', () => {
				viewlet.searchAndReplaceWidget.searchInput.setRegex(regexOption.checked);
			});
			this.addEventListener(wholeWordsOption, 'change', () => {
				viewlet.searchAndReplaceWidget.searchInput.setWholeWords(wholeWordsOption.checked);
			});
			this.addEventListener(caseSensitiveOption, 'change', () => {
				viewlet.searchAndReplaceWidget.searchInput.setCaseSensitive(caseSensitiveOption.checked);
			});
			this.addEventListener(includePatternInput, 'input', () => {
				viewlet.searchIncludePattern.setValue(includePatternInput.value);
				if (viewlet.searchIncludePattern.getValue()) {
					viewlet.toggleQueryDetails(false, true);
				}
			});
		}).done(null, onUnexpectedError);

		this.addEventListener(searchInput, 'keydown', e => {
			const event = new StandardKeyboardEvent(e);
			if (!event.equals(KeyCode.Enter)) {
				return;
			}
			if (!searchInput.value) {
				return;
			}
			this.viewletService.openViewlet(SEARCH_VIEWLET_ID).then((viewlet: SourcegraphSearchViewlet) => {
				viewlet.onQueryChanged(true);
			});
		});
		this.addEventListener(searchButton, 'click', () => {
			this.viewletService.openViewlet(SEARCH_VIEWLET_ID).then((viewlet: SourcegraphSearchViewlet) => {
				viewlet.onQueryChanged(true);
			});
		});
		this.addEventListener(<HTMLElement>container.querySelector('.addReposButton'), 'click', () => {
			this.commandService.executeCommand('workbench.action.search.profilePicker').done(null, onUnexpectedError);
		});
	}

	private addEventListener<K extends keyof HTMLElementEventMap, E extends HTMLElement>(element: E, type: K, listener: (this: E, ev: HTMLElementEventMap[K]) => any, useCapture?: boolean): void {
		element.addEventListener(type, listener, useCapture);
		this.disposables.push({ dispose: () => { element.removeEventListener(type, listener, useCapture); } });
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export class HomeInputFactory implements IEditorInputFactory {

	static ID = homeInputTypeId;

	public serialize(editorInput: EditorInput): string {
		return '{}';
	}

	public deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): WalkThroughInput {
		return instantiationService.createInstance(HomePage)
			.editorInput;
	}
}
