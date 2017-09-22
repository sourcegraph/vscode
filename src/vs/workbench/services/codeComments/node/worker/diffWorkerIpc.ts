/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { DiffWorker } from './diffWorker';
import { IRange } from 'vs/editor/common/core/range';

export interface IDiffWorker {
	/**
	 * Transforms a set of ranges between two versions of content.
	 */
	diff(args: IDiffArgs): TPromise<IDiffResult>;
}

export interface IDiffArgs {
	/**
	 * Past revisions of the file.
	 */
	revLines: IRevLines[];

	/**
	 * The ranges at past revisions to transform to the
	 * current state represented in modifiedLines.
	 */
	revRanges: IRevRange[];

	/**
	 * The current state of the file.
	 */
	modifiedLines: string[];
}

/**
 * The lines of a file at a revision.
 */
export interface IRevLines {
	revision: string;
	lines: string[];
}

/**
 * A range at a revision.
 */
export interface IRevRange {
	revision: string;
	range: IRange;
}

/**
 * A map of revisions to range transformations for that revision.
 */
export interface IDiffResult {
	[revision: string]: IRangeTransforms;
}

/**
 * A map of a range at a revision to a range
 * in the modified lines.
 */
export interface IRangeTransforms {
	[range: string]: IRange;
}

export interface IDiffWorkerChannel extends IChannel {
	call(command: 'diff', args: IDiffArgs): TPromise<IDiffResult>;
	call(command: string, arg?: any): TPromise<any>;
}

export class DiffWorkerChannel implements IDiffWorkerChannel {
	constructor(private worker: DiffWorker) {
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'diff': return this.worker.diff(arg);
		}
		return undefined;
	}
}