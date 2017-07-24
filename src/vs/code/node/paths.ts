/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as arrays from 'vs/base/common/arrays';
import * as strings from 'vs/base/common/strings';
import * as paths from 'vs/base/common/paths';
import * as platform from 'vs/base/common/platform';
import * as types from 'vs/base/common/types';
import product from 'vs/platform/node/product';
import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { realpathSync } from 'vs/base/node/extfs';

export function validatePaths(args: ParsedArgs): ParsedArgs {

	// Realpath/normalize paths and watch out for goto line mode
	const { paths, urls } = doValidatePaths(args._, args.goto);

	// Update environment
	args._ = paths;
	args.diff = args.diff && paths.length === 2;

	// Treat code: URIs as though they were passed via --open-url, not as path args.
	if (urls.length) {
		let openURL = args['open-url'];
		if (!openURL) {
			openURL = urls;
		} else if (types.isString(openURL)) {
			openURL = [openURL, ...urls];
		} else {
			openURL = [...openURL, ...urls];
		}
		args['open-url'] = openURL;
	}

	return args;
}

function doValidatePaths(args: string[], gotoLineMode?: boolean): { paths: string[], urls: string[] } {
	const pathArgs: string[] = [];
	const urlArgs: string[] = [];
	const cwd = process.env['VSCODE_CWD'] || process.cwd();
	args.forEach(arg => {
		const resource = URI.parse(arg);
		if (resource.scheme) {
			if (resource.scheme === Schemas.file) {
				// Strip file:// and proceed with opening file normally.
				arg = resource.toString();
			} else if (resource.scheme === product.urlProtocol) {
				urlArgs.push(resource.toString());
				return;
			} else {
				pathArgs.push(resource.toString());
				return;
			}
		}

		let pathCandidate = String(arg);

		let parsedPath: IPathWithLineAndColumn;
		if (gotoLineMode) {
			parsedPath = parseLineAndColumnAware(pathCandidate);
			pathCandidate = parsedPath.path;
		}

		if (pathCandidate) {
			pathCandidate = preparePath(cwd, pathCandidate);
		}

		let realPath: string;
		try {
			realPath = realpathSync(pathCandidate);
		} catch (error) {
			// in case of an error, assume the user wants to create this file
			// if the path is relative, we join it to the cwd
			realPath = path.normalize(path.isAbsolute(pathCandidate) ? pathCandidate : path.join(cwd, pathCandidate));
		}

		const basename = path.basename(realPath);
		if (basename /* can be empty if code is opened on root */ && !paths.isValidBasename(basename)) {
			return; // do not allow invalid file names
		}

		if (gotoLineMode) {
			parsedPath.path = realPath;
			pathArgs.push(toPath(parsedPath));
			return;
		}

		pathArgs.push(realPath);
	});

	const caseInsensitive = platform.isWindows || platform.isMacintosh;
	const distinct = arrays.distinct(pathArgs, e => e && caseInsensitive ? e.toLowerCase() : e);

	return { paths: arrays.coalesce(distinct), urls: urlArgs };
}

function preparePath(cwd: string, p: string): string {

	// Trim trailing quotes
	if (platform.isWindows) {
		p = strings.rtrim(p, '"'); // https://github.com/Microsoft/vscode/issues/1498
	}

	// Trim whitespaces
	p = strings.trim(strings.trim(p, ' '), '\t');

	if (platform.isWindows) {

		// Resolve the path against cwd if it is relative
		p = path.resolve(cwd, p);

		// Trim trailing '.' chars on Windows to prevent invalid file names
		p = strings.rtrim(p, '.');
	}

	return p;
}

export interface IPathWithLineAndColumn {
	path: string;
	line?: number;
	column?: number;
}

export function parseLineAndColumnAware(rawPath: string): IPathWithLineAndColumn {
	const segments = rawPath.split(':'); // C:\file.txt:<line>:<column>

	let path: string;
	let line: number = null;
	let column: number = null;

	segments.forEach(segment => {
		const segmentAsNumber = Number(segment);
		if (!types.isNumber(segmentAsNumber)) {
			path = !!path ? [path, segment].join(':') : segment; // a colon can well be part of a path (e.g. C:\...)
		} else if (line === null) {
			line = segmentAsNumber;
		} else if (column === null) {
			column = segmentAsNumber;
		}
	});

	if (!path) {
		throw new Error('Format for `--goto` should be: `FILE:LINE(:COLUMN)`');
	}

	return {
		path: path,
		line: line !== null ? line : void 0,
		column: column !== null ? column : line !== null ? 1 : void 0 // if we have a line, make sure column is also set
	};
}

function toPath(p: IPathWithLineAndColumn): string {
	const segments = [p.path];

	if (types.isNumber(p.line)) {
		segments.push(String(p.line));
	}

	if (types.isNumber(p.column)) {
		segments.push(String(p.column));
	}

	return segments.join(':');
}