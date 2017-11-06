/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { done } from './util';

function decorate(decorator: (fn: Function, key: string) => Function): Function {
	return (target: any, key: string, descriptor: any) => {
		let fnKey: string | null = null;
		let fn: Function | null = null;

		if (typeof descriptor.value === 'function') {
			fnKey = 'value';
			fn = descriptor.value;
		} else if (typeof descriptor.get === 'function') {
			fnKey = 'get';
			fn = descriptor.get;
		}

		if (!fn || !fnKey) {
			throw new Error('not supported');
		}

		descriptor[fnKey] = decorator(fn, key);
	};
}

function _memoize(fn: Function, key: string): Function {
	const memoizeKey = `$memoize$${key}`;

	const data: { [key: string]: any } = {};

	return function (this: Function, ...args: any[]) {
		if (!data.hasOwnProperty(memoizeKey)) {
			Object.defineProperty(data, memoizeKey, {
				configurable: false,
				enumerable: false,
				writable: false,
				value: fn.apply(this, args)
			});
		}

		return data[memoizeKey];
	};
}

export const memoize = decorate(_memoize);

function _throttle<T>(fn: Function, key: string): Function {
	const currentKey = `$throttle$current$${key}`;
	const nextKey = `$throttle$next$${key}`;

	const data: { [key: string]: any } = {};

	const trigger = function (this: Function, ...args: any[]) {
		if (data[nextKey]) {
			return data[nextKey];
		}

		if (data[currentKey]) {
			data[nextKey] = done(data[currentKey]).then(() => {
				data[nextKey] = undefined;
				return trigger.apply(this, args);
			});

			return data[nextKey];
		}

		data[currentKey] = fn.apply(this, args) as Promise<T>;

		const clear = () => data[currentKey] = undefined;
		done(data[currentKey]).then(clear, clear);

		return data[currentKey];
	};

	return trigger;
}

export const throttle = decorate(_throttle);

function _sequentialize<T>(fn: Function, key: string): Function {
	const currentKey = `__$sequence$${key}`;

	const data: { [key: string]: any } = {};

	return function (this: Function, ...args: any[]) {
		const currentPromise = data[currentKey] as Promise<any> || Promise.resolve(null);
		const run = async () => await fn.apply(this, args);
		data[currentKey] = currentPromise.then(run, run);
		return data[currentKey];
	};
}

export const sequentialize = decorate(_sequentialize);

export function debounce(delay: number): Function {
	const data: { [key: string]: any } = {};

	return decorate((fn, key) => {
		const timerKey = `$debounce$${key}`;

		return function (this: Function, ...args: any[]) {
			clearTimeout(data[timerKey]);
			data[timerKey] = setTimeout(() => fn.apply(this, args), delay);
		};
	});
}