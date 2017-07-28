/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { CodeCommentsHoverProvider } from 'vs/workbench/parts/codeComments/browser/codeCommentsHoverProvider';
import { CodeCommentsDecorationRenderer } from 'vs/workbench/parts/codeComments/browser/codeCommentsDecorationRenderer';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ICodeCommentsService } from 'vs/editor/common/services/codeCommentsService';
import { CodeCommentsService } from 'vs/workbench/services/codeComments/electron-browser/codeCommentsService';
import 'vs/workbench/parts/codeComments/electron-browser/createCodeCommentAction';

registerSingleton(ICodeCommentsService, CodeCommentsService);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(CodeCommentsHoverProvider);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(CodeCommentsDecorationRenderer);