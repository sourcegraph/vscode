/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Nico T. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Builder } from 'vs/base/browser/builder';

export abstract class Filter {
	constructor(
		public container: Builder,
	) {
		this.render();
	}

	abstract render(): void
}

export class RepoFilter extends Filter {

	onChange(cb: (repos: string[]) => void): void {

	}

	render(): void {
		this.container.innerHtml('foo');
	}
}
