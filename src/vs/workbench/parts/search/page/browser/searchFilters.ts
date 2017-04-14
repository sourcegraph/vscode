/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nico T. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Builder } from 'vs/base/browser/builder';
import { TPromise } from 'vs/base/common/winjs.base';

export class CheckList {
	constructor(
		public container: Builder,
		public items: string[],
	) {
		this.render();
	}

	onChange(cb: (repos: string[]) => void): void {

	}

	render(): void {
		this.container.div({}, d => {
			d.safeInnerHtml('Repositories to search');
		});
		this.container.div({}, d => {
			this.renderList(d);
		});
	}

	renderList(d: Builder): void {
		this.items.forEach(repo => {
			d.div({
				style: {
					whiteSpace: 'nowrap'
				}
			}, c => {
				this.renderItem(c, repo);
			});
		});
	}

	renderItem(d: Builder, repo: string): void {
		const id = 'filter-id-' + repo;
		d.element('input', { id, type: 'checkbox' });
		d.element('label', { for: id }, c => {
			c.safeInnerHtml(repo);
		});
	}

}

export interface IFilteredChecklist {

	selectionChanged(cb: (repos: string[]) => void): void;

}

export abstract class FilteredChecklist {

	filterValue: string;

	abstract getItems(): TPromise<string[]>

	constructor(
		public container: Builder,
	) {
		this.render();
	}

	render(): void {
		this.container.element('input', {}, inp => {
			inp.getHTMLElement().oninput = e => this.filterChanged(e);
		});
		this.container.div({}, div => {
			this.renderChecklist(div);
		});
	}

	renderChecklist(container: Builder): void {
		this.getItems().then(items => {
			new CheckList(container, items.filter(item =>
				item.indexOf(this.filterValue) >= 0
			));
		});
	}

	filterChanged(e: Event): void {
		this.filterValue = (e.target as any).value;
		this.render();
	}

	selectionChanged(cb: (repos: string[]) => void): void {
	}

}

export class RepoFilteredChecklist extends FilteredChecklist {
	getItems(): TPromise<string[]> {
		return TPromise.wrap([
			'github.com/kubernetes/kubernetes',
			'github.com/gorilla/mux'
		]);
	}
}
