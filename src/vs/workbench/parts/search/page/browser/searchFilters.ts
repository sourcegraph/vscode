/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nico T. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Builder } from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';

export type Items = Map<string, boolean>;

export class CheckList {

	listeners: ((repo: string, checked: boolean) => void)[] = [];

	constructor(
		public container: Builder,
		public items: Items,
	) {
		this.render();
	}

	onChange(cb: (repo: string, checked: boolean) => void): void {
		this.listeners.push(cb);
	}

	render(): void {
		this.items.forEach((checked, repo) => {
			this.container.div({
				style: {
					whiteSpace: 'nowrap'
				}
			}, c => {
				this.renderItem(c, repo, checked);
			});
		});
	}

	checked(repo: string): (v) => void {
		return (v) => {
			this.listeners.forEach(cb => {
				cb(repo, v.target.checked);
			});
		};
	}

	renderItem(d: Builder, repo: string, checked: boolean): void {
		const id = 'filter-id-' + repo;
		if (checked) {
			d.element('input', { id, type: 'checkbox', checked: true }, checkbox => {
				checkbox.on('change', this.checked(repo));
			});
		} else {
			d.element('input', { id, type: 'checkbox' }, checkbox => {
				checkbox.on('change', this.checked(repo));
			});
		}
		d.element('label', { for: id }, c => {
			c.safeInnerHtml(repo);
		});
	}

}

export interface IFilteredChecklist {

	selectionChanged(cb: (repos: string[]) => void): void;

}

export abstract class FilteredChecklist {

	filterValue: string = '';
	savedItems: Items;
	input: Builder;
	listeners: ((v: string[]) => void)[] = [];

	abstract getItems(): TPromise<string[]>;

	abstract getDescription(): string;

	constructor(
		public container: Builder,
	) {
		this.getAndSaveItems().then(() => {
			this.render();
		});
	}

	getAndSaveItems(): TPromise<void> {
		return this.getItems().then(items => {
			this.savedItems = new Map<string, boolean>();
			items.forEach(item => {
				// TODO read from localstorage.
				this.savedItems.set(item, true);
			});
		});
	}

	render(): void {
		this.container.clearChildren();
		if (!this.input) {
			this.container.div({
				innerHTML: this.getDescription(),
			});
			this.container.element('input', {}, input => {
				input.on('input', e => this.filterChanged(e));
				this.input = input;
			});
		}
		this.container.div({}, div => {
			this.renderChecklist(div);
		});
	}

	renderChecklist(container: Builder): void {
		const filteredItems = new Map<string, boolean>();
		this.savedItems.forEach((checked, repo) => {
			if (repo.indexOf(this.filterValue) >= 0) {
				filteredItems.set(repo, checked);
			}
		});
		const ck = new CheckList(container, filteredItems);
		ck.onChange((r, c) => {
			this.savedItems.set(r, c);
			this.notifyListeners();
		});
	}

	notifyListeners(): void {
		const items = [];
		this.savedItems.forEach((checked, repo) => {
			if (checked) {
				items.push(repo);
			}
		});
		this.listeners.forEach(cb => {
			cb(items);
		});
	}

	filterChanged(e: any): void {
		this.filterValue = e.target.value;
		this.render();
	}

	selectionChanged(cb: (repos: string[]) => void): void {
		this.listeners.push(cb);
	}

}

export class RepoSelector extends FilteredChecklist {

	getDescription(): string {
		return 'Filter by repository';
	}

	getItems(): TPromise<string[]> {
		return TPromise.wrap([
			'github.com/kubernetes/kubernetes',
			'github.com/gorilla/mux'
		]);
	}
}

export class LangSelector extends FilteredChecklist {

	getDescription(): string {
		return 'Return results of language:';
	}

	getItems(): TPromise<string[]> {
		return TPromise.wrap([
			'Go',
			'Java',
			'Ruby',
			'C',
			'C++',
			'TypeScript',
			'JavaScript',
			'Swift',
			'Python',
			'Bash',
			'Haskell',
		]);
	}
}
