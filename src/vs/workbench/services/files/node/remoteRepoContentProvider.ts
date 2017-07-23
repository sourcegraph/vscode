/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IFileService } from 'vs/platform/files/common/files';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { Schemas } from 'vs/base/common/network';
import { Registry } from 'vs/platform/registry/common/platform';

export class RemoteRepoContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	constructor(
		@ITextModelService private textModelResolverService: ITextModelService,
		@IFileService private fileService: IFileService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
	) {
		this.textModelResolverService.registerTextModelContentProvider(Schemas.remoteGitRepo, this);
	}

	public provideTextContent(resource: URI): TPromise<IModel> {
		const content = this.fileService.resolveContent(resource).then(content => content.value);
		return content.then(content => {
			let codeEditorModel = this.modelService.getModel(resource);
			if (!codeEditorModel) {
				codeEditorModel = this.modelService.createModel(content, this.modeService.getOrCreateModeByFilenameOrFirstLine(resource.fsPath), resource);
			} else {
				this.modelService.updateModel(codeEditorModel, content);
			}
			return codeEditorModel;
		});
	}

	public getId(): string {
		return 'sourcegraph.remoteRepoContentProvider';
	}
}

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(RemoteRepoContentProvider);