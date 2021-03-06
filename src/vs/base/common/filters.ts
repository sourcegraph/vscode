/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import strings = require('vs/base/common/strings');
import { BoundedLinkedMap } from 'vs/base/common/map';
import { CharCode } from 'vs/base/common/charCode';

export interface IFilter {
	// Returns null if word doesn't match.
	(word: string, wordToMatchAgainst: string): IMatch[];
}

export interface IMatch {
	start: number;
	end: number;
}

// Combined filters

/**
 * @returns A filter which combines the provided set
 * of filters with an or. The *first* filters that
 * matches defined the return value of the returned
 * filter.
 */
export function or(...filter: IFilter[]): IFilter {
	return function (word: string, wordToMatchAgainst: string): IMatch[] {
		for (let i = 0, len = filter.length; i < len; i++) {
			let match = filter[i](word, wordToMatchAgainst);
			if (match) {
				return match;
			}
		}
		return null;
	};
}

/**
 * @returns A filter which combines the provided set
 * of filters with an and. The combines matches are
 * returned if *all* filters match.
 */
export function and(...filter: IFilter[]): IFilter {
	return function (word: string, wordToMatchAgainst: string): IMatch[] {
		let result: IMatch[] = [];
		for (let i = 0, len = filter.length; i < len; i++) {
			let match = filter[i](word, wordToMatchAgainst);
			if (!match) {
				return null;
			}
			result = result.concat(match);
		}
		return result;
	};
}

// Prefix

export const matchesStrictPrefix: IFilter = _matchesPrefix.bind(undefined, false);
export const matchesPrefix: IFilter = _matchesPrefix.bind(undefined, true);

function _matchesPrefix(ignoreCase: boolean, word: string, wordToMatchAgainst: string): IMatch[] {
	if (!wordToMatchAgainst || wordToMatchAgainst.length < word.length) {
		return null;
	}

	let matches: boolean;
	if (ignoreCase) {
		matches = strings.beginsWithIgnoreCase(wordToMatchAgainst, word);
	} else {
		matches = wordToMatchAgainst.indexOf(word) === 0;
	}

	if (!matches) {
		return null;
	}

	return word.length > 0 ? [{ start: 0, end: word.length }] : [];
}

// Contiguous Substring

export function matchesContiguousSubString(word: string, wordToMatchAgainst: string): IMatch[] {
	let index = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
	if (index === -1) {
		return null;
	}

	return [{ start: index, end: index + word.length }];
}

// Substring

export function matchesSubString(word: string, wordToMatchAgainst: string): IMatch[] {
	return _matchesSubString(word.toLowerCase(), wordToMatchAgainst.toLowerCase(), 0, 0);
}

function _matchesSubString(word: string, wordToMatchAgainst: string, i: number, j: number): IMatch[] {
	if (i === word.length) {
		return [];
	} else if (j === wordToMatchAgainst.length) {
		return null;
	} else {
		if (word[i] === wordToMatchAgainst[j]) {
			let result: IMatch[] = null;
			if (result = _matchesSubString(word, wordToMatchAgainst, i + 1, j + 1)) {
				return join({ start: j, end: j + 1 }, result);
			}
		}

		return _matchesSubString(word, wordToMatchAgainst, i, j + 1);
	}
}

// CamelCase

function isLower(code: number): boolean {
	return CharCode.a <= code && code <= CharCode.z;
}

function isUpper(code: number): boolean {
	return CharCode.A <= code && code <= CharCode.Z;
}

function isNumber(code: number): boolean {
	return CharCode.Digit0 <= code && code <= CharCode.Digit9;
}

function isWhitespace(code: number): boolean {
	return (
		code === CharCode.Space
		|| code === CharCode.Tab
		|| code === CharCode.LineFeed
		|| code === CharCode.CarriageReturn
	);
}

function isAlphanumeric(code: number): boolean {
	return isLower(code) || isUpper(code) || isNumber(code);
}

function join(head: IMatch, tail: IMatch[]): IMatch[] {
	if (tail.length === 0) {
		tail = [head];
	} else if (head.end === tail[0].start) {
		tail[0].start = head.start;
	} else {
		tail.unshift(head);
	}
	return tail;
}

function nextAnchor(camelCaseWord: string, start: number): number {
	for (let i = start; i < camelCaseWord.length; i++) {
		let c = camelCaseWord.charCodeAt(i);
		if (isUpper(c) || isNumber(c) || (i > 0 && !isAlphanumeric(camelCaseWord.charCodeAt(i - 1)))) {
			return i;
		}
	}
	return camelCaseWord.length;
}

function _matchesCamelCase(word: string, camelCaseWord: string, i: number, j: number): IMatch[] {
	if (i === word.length) {
		return [];
	} else if (j === camelCaseWord.length) {
		return null;
	} else if (word[i] !== camelCaseWord[j].toLowerCase()) {
		return null;
	} else {
		let result: IMatch[] = null;
		let nextUpperIndex = j + 1;
		result = _matchesCamelCase(word, camelCaseWord, i + 1, j + 1);
		while (!result && (nextUpperIndex = nextAnchor(camelCaseWord, nextUpperIndex)) < camelCaseWord.length) {
			result = _matchesCamelCase(word, camelCaseWord, i + 1, nextUpperIndex);
			nextUpperIndex++;
		}
		return result === null ? null : join({ start: j, end: j + 1 }, result);
	}
}

interface ICamelCaseAnalysis {
	upperPercent: number;
	lowerPercent: number;
	alphaPercent: number;
	numericPercent: number;
}

// Heuristic to avoid computing camel case matcher for words that don't
// look like camelCaseWords.
function analyzeCamelCaseWord(word: string): ICamelCaseAnalysis {
	let upper = 0, lower = 0, alpha = 0, numeric = 0, code = 0;

	for (let i = 0; i < word.length; i++) {
		code = word.charCodeAt(i);

		if (isUpper(code)) { upper++; }
		if (isLower(code)) { lower++; }
		if (isAlphanumeric(code)) { alpha++; }
		if (isNumber(code)) { numeric++; }
	}

	let upperPercent = upper / word.length;
	let lowerPercent = lower / word.length;
	let alphaPercent = alpha / word.length;
	let numericPercent = numeric / word.length;

	return { upperPercent, lowerPercent, alphaPercent, numericPercent };
}

function isUpperCaseWord(analysis: ICamelCaseAnalysis): boolean {
	const { upperPercent, lowerPercent } = analysis;
	return lowerPercent === 0 && upperPercent > 0.6;
}

function isCamelCaseWord(analysis: ICamelCaseAnalysis): boolean {
	const { upperPercent, lowerPercent, alphaPercent, numericPercent } = analysis;
	return lowerPercent > 0.2 && upperPercent < 0.8 && alphaPercent > 0.6 && numericPercent < 0.2;
}

// Heuristic to avoid computing camel case matcher for words that don't
// look like camel case patterns.
function isCamelCasePattern(word: string): boolean {
	let upper = 0, lower = 0, code = 0, whitespace = 0;

	for (let i = 0; i < word.length; i++) {
		code = word.charCodeAt(i);

		if (isUpper(code)) { upper++; }
		if (isLower(code)) { lower++; }
		if (isWhitespace(code)) { whitespace++; }
	}

	if ((upper === 0 || lower === 0) && whitespace === 0) {
		return word.length <= 30;
	} else {
		return upper <= 5;
	}
}

export function matchesCamelCase(word: string, camelCaseWord: string): IMatch[] {
	if (!camelCaseWord || camelCaseWord.length === 0) {
		return null;
	}

	if (!isCamelCasePattern(word)) {
		return null;
	}

	if (camelCaseWord.length > 60) {
		return null;
	}

	const analysis = analyzeCamelCaseWord(camelCaseWord);

	if (!isCamelCaseWord(analysis)) {
		if (!isUpperCaseWord(analysis)) {
			return null;
		}

		camelCaseWord = camelCaseWord.toLowerCase();
	}

	let result: IMatch[] = null;
	let i = 0;

	while (i < camelCaseWord.length && (result = _matchesCamelCase(word.toLowerCase(), camelCaseWord, 0, i)) === null) {
		i = nextAnchor(camelCaseWord, i + 1);
	}

	return result;
}

// Matches beginning of words supporting non-ASCII languages
// If `contiguous` is true then matches word with beginnings of the words in the target. E.g. "pul" will match "Git: Pull"
// Otherwise also matches sub string of the word with beginnings of the words in the target. E.g. "gp" or "g p" will match "Git: Pull"
// Useful in cases where the target is words (e.g. command labels)

export function matchesWords(word: string, target: string, contiguous: boolean = false): IMatch[] {
	if (!target || target.length === 0) {
		return null;
	}

	let result: IMatch[] = null;
	let i = 0;

	while (i < target.length && (result = _matchesWords(word.toLowerCase(), target, 0, i, contiguous)) === null) {
		i = nextWord(target, i + 1);
	}

	return result;
}

function _matchesWords(word: string, target: string, i: number, j: number, contiguous: boolean): IMatch[] {
	if (i === word.length) {
		return [];
	} else if (j === target.length) {
		return null;
	} else if (word[i] !== target[j].toLowerCase()) {
		return null;
	} else {
		let result: IMatch[] = null;
		let nextWordIndex = j + 1;
		result = _matchesWords(word, target, i + 1, j + 1, contiguous);
		if (!contiguous) {
			while (!result && (nextWordIndex = nextWord(target, nextWordIndex)) < target.length) {
				result = _matchesWords(word, target, i + 1, nextWordIndex, contiguous);
				nextWordIndex++;
			}
		}
		return result === null ? null : join({ start: j, end: j + 1 }, result);
	}
}

function nextWord(word: string, start: number): number {
	for (let i = start; i < word.length; i++) {
		let c = word.charCodeAt(i);
		if (isWhitespace(c) || (i > 0 && isWhitespace(word.charCodeAt(i - 1)))) {
			return i;
		}
	}
	return word.length;
}

// Fuzzy

export enum SubstringMatching {
	Contiguous,
	Separate
}

export const fuzzyContiguousFilter = or(matchesPrefix, matchesCamelCase, matchesContiguousSubString);
const fuzzySeparateFilter = or(matchesPrefix, matchesCamelCase, matchesSubString);
const fuzzyRegExpCache = new BoundedLinkedMap<RegExp>(10000); // bounded to 10000 elements

export function matchesFuzzy(word: string, wordToMatchAgainst: string, enableSeparateSubstringMatching = false): IMatch[] {
	if (typeof word !== 'string' || typeof wordToMatchAgainst !== 'string') {
		return null; // return early for invalid input
	}

	// Form RegExp for wildcard matches
	let regexp = fuzzyRegExpCache.get(word);
	if (!regexp) {
		regexp = new RegExp(strings.convertSimple2RegExpPattern(word), 'i');
		fuzzyRegExpCache.set(word, regexp);
	}

	// RegExp Filter
	let match: RegExpExecArray = regexp.exec(wordToMatchAgainst);
	if (match) {
		return [{ start: match.index, end: match.index + match[0].length }];
	}

	// Default Filter
	return enableSeparateSubstringMatching ? fuzzySeparateFilter(word, wordToMatchAgainst) : fuzzyContiguousFilter(word, wordToMatchAgainst);
}

export function matchesFuzzy2(pattern: string, word: string): number[] {

	pattern = pattern.toLowerCase();
	word = word.toLowerCase();

	let matches: number[] = [];
	let patternPos = 0;
	let wordPos = 0;
	while (patternPos < pattern.length && wordPos < word.length) {
		if (pattern[patternPos] === word[wordPos]) {
			patternPos += 1;
			matches.push(wordPos);
		}
		wordPos += 1;
	}

	if (patternPos !== pattern.length) {
		return undefined;
	}

	return matches;
}

export function createMatches(position: number[]): IMatch[] {
	let ret: IMatch[] = [];
	let last: IMatch;
	for (const pos of position) {
		if (last && last.end === pos) {
			last.end += 1;
		} else {
			last = { start: pos, end: pos + 1 };
			ret.push(last);
		}
	}
	return ret;
}

export function fuzzyMatchAndScore(pattern: string, word: string): [number, number[]] {

	if (!pattern) {
		return [-1, []];
	}

	let matches: number[] = [];
	let score = _matchRecursive(
		pattern, pattern.toLowerCase(), pattern.toUpperCase(), 0,
		word, word.toLowerCase(), 0,
		matches
	);

	if (score <= 0) {
		return undefined;
	}

	score -= Math.min(matches[0], 3) * 3; // penalty for first matching character
	score -= (1 + matches[matches.length - 1]) - (pattern.length); // penalty for all non matching characters between first and last

	return [score, matches];
}

export function _matchRecursive(
	pattern: string, lowPattern: string, upPattern: string, patternPos: number,
	word: string, lowWord: string, wordPos: number,
	matches: number[]
): number {

	if (patternPos >= lowPattern.length) {
		return 0;
	}

	const lowPatternChar = lowPattern[patternPos];
	let idx = -1;
	let value = 0;

	if ((patternPos === wordPos
		&& lowPatternChar === lowWord[wordPos])
		&& ((value = _matchRecursive(pattern, lowPattern, upPattern, patternPos + 1, word, lowWord, wordPos + 1, matches)) >= 0)
	) {
		matches.unshift(wordPos);
		return (pattern[patternPos] === word[wordPos] ? 17 : 11) + value;
	}

	if ((idx = word.indexOf(upPattern[patternPos], wordPos)) >= 0
		&& ((value = _matchRecursive(pattern, lowPattern, upPattern, patternPos + 1, word, lowWord, idx + 1, matches)) >= 0)
	) {
		matches.unshift(idx);
		return (pattern[patternPos] === word[idx] ? 17 : 11) + value;
	}

	if ((idx = lowWord.indexOf(`_${lowPatternChar}`, wordPos)) >= 0
		&& ((value = _matchRecursive(pattern, lowPattern, upPattern, patternPos + 1, word, lowWord, idx + 2, matches)) >= 0)
	) {
		matches.unshift(idx + 1);
		return (pattern[patternPos] === word[idx + 1] ? 17 : 11) + value;
	}

	if ((idx = lowWord.indexOf(`.${lowPatternChar}`, wordPos)) >= 0
		&& ((value = _matchRecursive(pattern, lowPattern, upPattern, patternPos + 1, word, lowWord, idx + 2, matches)) >= 0)
	) {
		matches.unshift(idx + 1);
		return 11 + value;
	}

	if (patternPos > 0
		&& (idx = lowWord.indexOf(lowPatternChar, wordPos)) >= 0
		&& ((value = _matchRecursive(pattern, lowPattern, upPattern, patternPos + 1, word, lowWord, idx + 1, matches)) >= 0)
	) {
		matches.unshift(idx);
		return 1 + value;
	}

	return -1;
}
