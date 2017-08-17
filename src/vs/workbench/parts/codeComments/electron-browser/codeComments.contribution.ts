/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/codeComments';
import { Registry } from 'vs/platform/registry/common/platform';
import { localize } from 'vs/nls';
import * as Constants from 'vs/workbench/parts/codeComments/common/constants';
import { ViewletRegistry, Extensions as ViewletExtensions, ViewletDescriptor } from 'vs/workbench/browser/viewlet';
import 'vs/workbench/parts/codeComments/browser/codeCommentsDecorationRenderer';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { ICodeCommentsService } from 'vs/editor/common/services/codeCommentsService';
import { CodeCommentsService } from 'vs/workbench/services/codeComments/electron-browser/codeCommentsService';
import 'vs/workbench/parts/codeComments/browser/createCodeCommentAction';
import 'vs/workbench/parts/codeComments/electron-browser/codeCommentsViewlet';

registerSingleton(ICodeCommentsService, CodeCommentsService);

Registry.as<ViewletRegistry>(ViewletExtensions.Viewlets).registerViewlet(new ViewletDescriptor(
	'vs/workbench/parts/codeComments/electron-browser/codeCommentsViewlet',
	'CodeCommentsViewlet',
	Constants.VIEWLET_ID,
	localize('name', "Code Comments"),
	'codeComments',
	11 // after search viewlet
));