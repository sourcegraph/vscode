/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from 'vs/base/browser/builder';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Widget } from 'vs/base/browser/ui/widget';

export interface IOptions {
	id: string;
	label: string;
	notFoundMessage: string;
}

export class CheckboxInputWidget extends Widget {
	private domNode: HTMLElement;
	private input: HTMLElement;
	private label: HTMLElement;
	private results: HTMLElement;

	constructor(private parent: HTMLElement, private telemetryService: ITelemetryService, private options: IOptions) {
		super();
		this.render();
	}

	private render(): void {
		this.domNode = document.createElement('div');
		this.input = document.createElement('input');
		this.input.setAttribute('type', 'checkbox');
		this.input.setAttribute('id', this.options.id);
		this.domNode.appendChild(this.input);

		this.label = document.createElement('label');
		this.label.setAttribute('for', this.options.id);
		this.label.innerText = this.options.label;
		this.domNode.appendChild(this.label);

		this.results = document.createElement('div');
		this.domNode.appendChild(this.results);

		this.onchange(this.input, (e) => {
			if (e.target['checked']) {
				this.telemetryService.publicLog('stub:searchDependencies');
				this.results.innerHTML = this.options.notFoundMessage;
				$(this.results).show();
			} else {
				$(this.results).hide();
			}
		});

		this.parent.appendChild(this.domNode);
	}
}