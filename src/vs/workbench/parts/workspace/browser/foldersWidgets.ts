/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/foldersWidgets';
import { isUndefinedOrNull } from 'vs/base/common/types';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IFolder, IFoldersWorkbenchService } from 'vs/workbench/services/folders/common/folders';
import { append, $, addClass, toggleClass } from 'vs/base/browser/dom';
import * as platform from 'vs/base/common/platform';
import * as paths from 'vs/base/common/paths';

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
		@IFoldersWorkbenchService catalogService: IFoldersWorkbenchService
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

/**
 * A label for emphasizing (bolding) the final path component in a folder display path.
 */
export class PathLabel implements IDisposable {

	private listener: IDisposable;
	private _folder: IFolder;
	get folder(): IFolder { return this._folder; }
	set folder(folder: IFolder) { this._folder = folder; this.render(); }

	constructor(
		private container: HTMLElement,
		@IFoldersWorkbenchService catalogService: IFoldersWorkbenchService
	) {
		addClass(container, 'folder-path');
		this.render();
		this.listener = catalogService.onChange(this.render, this);
	}

	private render(): void {
		this.container.innerHTML = '';
		if (!this.folder) {
			return;
		}

		const isAbsolute = paths.isAbsolute(this.folder.displayPath) || paths.isAbsolute_posix(this.folder.displayPath);
		toggleClass(this.container, 'abs-path', isAbsolute);

		const path = isAbsolute ? this.folder.displayName : this.folder.displayPath;

		const components = path.split(/[/\\]/);
		let separatorIndex = 0;
		for (let i = 0; i < components.length; i++) {
			const component = components[i];
			const isAncestor = i !== components.length - 1;

			if (!component) {
				separatorIndex++;
				return;
			}
			separatorIndex += component.length;

			if (isAncestor) {
				const elem = append(this.container, $('span.ancestor'));
				elem.textContent = component;
				append(this.container, $('span.separator')).textContent = path[separatorIndex];
				separatorIndex++;
			} else {
				const elem = append(this.container, $('span.leaf'));
				elem.textContent = component;
			}
		}
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
		@IFoldersWorkbenchService catalogService: IFoldersWorkbenchService
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
