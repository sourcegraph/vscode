/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGlobalActivity } from 'vs/workbench/common/activity';
import { IAction } from 'vs/base/common/actions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WelcomePageAction } from 'vs/workbench/parts/welcome/page/electron-browser/welcomePage';

export class HomeContribution implements IGlobalActivity {
	get id() { return 'vs.home'; }
	get name() { return ''; }
	get cssClass() { return 'home-activity'; }

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {

	}

	getActions(): IAction[] {
		return [this.instantiationService.createInstance(WelcomePageAction, WelcomePageAction.ID, WelcomePageAction.LABEL)];
	}
}
