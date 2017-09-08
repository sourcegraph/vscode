/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';

export class Disposable implements IDisposable {
	/**
	 * Objects that will be disposed when this object's dispose method is called.
	 */
	protected disposables: IDisposable[] = [];

	private willDispose = this.disposable(new Emitter<void>());

	/**
	 * Event that is fired when this object is disposed.
	 */
	public onWillDispose: Event<void> = this.willDispose.event;

	/**
	 * Registers a disposable to be disposed when this object's dispose method is called.
	 */
	protected disposable<T extends IDisposable>(t: T): T {
		this.disposables.push(t);
		return t;
	}

	public dispose() {
		this.willDispose.fire();
		this.disposables = dispose(this.disposables);
	}
}