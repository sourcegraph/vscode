/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Schemas } from 'vs/base/common/network';

export class WalkThroughContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	constructor(
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
	) {
		this.textModelResolverService.registerTextModelContentProvider(Schemas.walkThrough, this);
	}

	public provideTextContent(resource: URI): TPromise<IModel> {
		const mode = this.modeService.getMode('html');
		const model = this.modelService.createModel('<div id="search-page"></div>', mode, resource);
		return TPromise.wrap(model);
	}

	public getId(): string {
		return 'vs.walkThroughContentProvider';
	}
}
