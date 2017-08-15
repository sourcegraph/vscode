/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IViewlet } from 'vs/workbench/common/viewlet';
import { Range } from 'vs/editor/common/core/range';
import URI from 'vs/base/common/uri';

export interface ICodeCommentsViewlet extends IViewlet {
	/**
	 * Renders a UI to create a new comment thread on the line or selection of the current editor.
	 */
	createThread(file: URI, range: Range): void;

	/**
	 * Renders a UI to display the specified thread and comment.
	 */
	viewThread(threadID: number, commentID?: number): void;
}
