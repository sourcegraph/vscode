/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module TelligentTracker {
	/**
	 * Method calls take the form:
	 *      [ 'methodName', optional_parameters ]
	 * or:
	 *      [ functionObject, optional_parameters ]
	 */
	type ITelligentAsyncCall = any[];

	/**
	 * Generate a new empty Queue object
	 * @param asynchronousQueue array of method calls to be executed upon loading
	 * @param functionName global function name for future calls to tracker methods
	 */
	function Telligent(asynchronousQueue: ITelligentAsyncCall[], functionName: string): any;
}

declare module 'telligent-tracker' {
	export = TelligentTracker;
}
