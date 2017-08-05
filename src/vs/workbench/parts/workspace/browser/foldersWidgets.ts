/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/foldersWidgets';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IFolder, IFolderCatalogService } from '../common/workspace';
import { append, $, addClass } from 'vs/base/browser/dom';
import * as platform from 'vs/base/common/platform';

export interface IOptions {
	folder?: IFolder;
	small?: boolean;
}

export class Label implements IDisposable {

	private listener: IDisposable;
	private _folder: IFolder;
	get folder(): IFolder { return this._folder; }
	set folder(folder: IFolder) { this._folder = folder; this.render(); }

	constructor(
		private element: HTMLElement,
		private fn: (folder: IFolder) => string,
		@IFolderCatalogService catalogService: IFolderCatalogService
	) {
		this.render();
		this.listener = catalogService.onChange(this.render, this);
	}

	private render(): void {
		this.element.textContent = this.folder ? this.fn(this.folder) : '';
	}

	dispose(): void {
		this.listener = dispose(this.listener);
	}
}

export class StarsWidget implements IDisposable {

	private disposables: IDisposable[] = [];
	private _folder: IFolder;
	get folder(): IFolder { return this._folder; }
	set folder(folder: IFolder) { this._folder = folder; this.render(); }

	constructor(
		private container: HTMLElement,
		private options: IOptions,
		@IFolderCatalogService catalogService: IFolderCatalogService
	) {
		this._folder = options.folder;
		this.disposables.push(catalogService.onChange(() => this.render()));
		addClass(container, 'folder-stars');

		if (options.small) {
			addClass(container, 'small');
		}

		this.render();
	}

	private render(): void {
		this.container.innerHTML = '';

		if (!this.folder) {
			return;
		}

		if (isUndefinedOrNull(this.folder.starsCount)) {
			return;
		}

		if (this.options.small && this.folder.starsCount === 0) {
			return;
		}

		const count = this.folder.starsCount;
		let label: string;
		if (this.options.small) {
			if (count > 1000000) {
				label = `${Math.floor(count / 100000) / 10}M`;
			} else if (count > 1000) {
				label = `${Math.floor(count / 1000)}K`;
			} else {
				label = String(count);
			}
		} else {
			label = count.toLocaleString(platform.locale);
		}

		append(this.container, $('span.octicon.octicon-star'));
		const stars = append(this.container, $('span.count'));
		stars.textContent = String(label);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
