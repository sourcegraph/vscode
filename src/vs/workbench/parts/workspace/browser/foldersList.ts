/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { append, $, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Action } from 'vs/base/common/actions';
import { ActionBar, IActionItemOptions } from 'vs/base/browser/ui/actionbar/actionbar';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { once } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { IFolder, WorkspaceFolderState } from 'vs/workbench/parts/workspace/common/workspace';
import { AddWorkspaceFolderAction, RemoveWorkspaceFolderAction, ManageWorkspaceFolderAction } from 'vs/workbench/parts/workspace/browser/folderActions';
import { FolderSCMRevisionLabelAction } from 'vs/workbench/parts/workspace/browser/scmFolderActions';
import { EventType } from 'vs/base/common/events';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { Label, PathLabel, StarsWidget } from './foldersWidgets';
// tslint:disable-next-line:import-patterns
import * as date from 'date-fns';

export interface ITemplateData {
	root: HTMLElement;
	element: HTMLElement;
	iconImage: HTMLImageElement;
	iconOcticon: HTMLElement;
	name: HTMLElement;
	stars: HTMLElement;
	description: HTMLElement;
	folder: IFolder;
	disposables: IDisposable[];
	folderDisposables: IDisposable[];
}

export class Delegate implements IDelegate<IFolder> {
	getHeight() { return 62; }
	getTemplateId() { return 'folder'; }
}

const actionOptions: IActionItemOptions = { icon: true, label: true };

export class Renderer implements IPagedRenderer<IFolder, ITemplateData> {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IContextMenuService private contextMenuService: IContextMenuService,
		@IMessageService private messageService: IMessageService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
	) { }

	get templateId() { return 'folder'; }

	renderTemplate(root: HTMLElement): ITemplateData {
		const element = append(root, $('.folder'));
		const iconImage = append(element, $<HTMLImageElement>('img.icon'));
		const iconOcticon = append(element, $('span.octicon'));
		const details = append(element, $('.details'));
		const headerContainer = append(details, $('.header-container'));
		const header = append(headerContainer, $('.header'));
		const name = append(header, $('div.name'));
		const stars = append(headerContainer, $('.stars'));
		const description = append(details, $('.description.ellipsis'));
		const footer = append(details, $('.footer'));
		const timestamp = append(footer, $('.timestamp.ellipsis'));

		iconImage.style.display = 'none';
		iconOcticon.style.display = 'none';

		const headerActionBar = new ActionBar(header, {
			animated: false,
		});
		headerActionBar.addListener(EventType.RUN, ({ error }) => error && this.messageService.show(Severity.Error, error));

		const footerActionBar = new ActionBar(footer, {
			animated: false,
			actionItemProvider: (action: Action) => {
				if (action.id === ManageWorkspaceFolderAction.ID) {
					return (<ManageWorkspaceFolderAction>action).actionItem;
				}
				return null;
			}
		});
		footerActionBar.addListener(EventType.RUN, ({ error }) => error && this.messageService.show(Severity.Error, error));

		const nameWidget = this.instantiationService.createInstance(PathLabel, name);
		const starsWidget = this.instantiationService.createInstance(StarsWidget, stars, { small: true });
		const timestampWidget = this.instantiationService.createInstance(Label, timestamp, (f: IFolder) => {
			if (f.updatedAt) {
				return localize('timeAgo', 'Updated {0} ago', date.distanceInWordsToNow(f.updatedAt));
			}
			return undefined;
		});

		const scmRevisionAction = this.instantiationService.createInstance(FolderSCMRevisionLabelAction);
		headerActionBar.push([scmRevisionAction], actionOptions);

		const addAction = this.instantiationService.createInstance(AddWorkspaceFolderAction);
		const removeAction = this.instantiationService.createInstance(RemoveWorkspaceFolderAction);
		const manageAction = this.instantiationService.createInstance(ManageWorkspaceFolderAction);
		footerActionBar.push([addAction, removeAction, manageAction], actionOptions);

		const disposables = [nameWidget, starsWidget, timestampWidget, scmRevisionAction, headerActionBar, addAction, removeAction, manageAction, footerActionBar];

		return {
			root, element, iconImage, iconOcticon, name, stars, description, disposables,
			folderDisposables: [],
			set folder(folder: IFolder) {
				nameWidget.folder = folder;
				starsWidget.folder = folder;
				timestampWidget.folder = folder;
				scmRevisionAction.folder = folder;
				addAction.folder = folder;
				removeAction.folder = folder;
				manageAction.folder = folder;
			}
		};
	}

	renderPlaceholder(index: number, data: ITemplateData): void {
		addClass(data.element, 'loading');

		data.root.removeAttribute('aria-label');
		data.folderDisposables = dispose(data.folderDisposables);
		data.iconImage.style.display = 'none';
		data.iconImage.src = '';
		data.iconOcticon.style.display = 'none';
		data.iconOcticon.className = 'octicon';
		data.name.style.display = 'none';
		data.description.textContent = '';
		data.stars.style.display = 'none';
		data.folder = null;
	}

	renderElement(folder: IFolder, index: number, data: ITemplateData): void {
		removeClass(data.element, 'loading');

		data.folderDisposables = dispose(data.folderDisposables);

		toggleClass(data.element, 'disabled', folder.state !== WorkspaceFolderState.Active && folder.state !== WorkspaceFolderState.Inactive);

		const displayGenericIcon = () => {
			data.iconOcticon.className = `octicon octicon-${folder.genericIconClass}`;
			data.iconOcticon.style.display = '';
		};
		if (folder.iconUrl) {
			const onError = once(domEvent(data.iconImage, 'error'));
			onError(() => {
				data.iconImage.src = '';
				data.iconImage.style.display = 'none';
				displayGenericIcon();
			}, null, data.folderDisposables);
			data.iconImage.style.display = '';
			data.iconImage.src = folder.iconUrl;
		} else {
			displayGenericIcon();
		}

		if (!data.iconImage.complete) {
			data.iconImage.style.visibility = 'hidden';
			data.iconImage.onload = () => data.iconImage.style.visibility = 'inherit';
		} else {
			data.iconImage.style.visibility = 'inherit';
		}

		data.root.setAttribute('aria-label', folder.displayPath);
		data.name.style.display = '';
		data.name.title = folder.displayPath;
		data.description.textContent = folder.description;
		data.stars.style.display = '';
		data.folder = folder;
	}

	disposeTemplate(data: ITemplateData): void {
		data.disposables = dispose(data.disposables);
	}
}
