/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeCommentsService, Thread, CommentsDidChangeEvent } from 'vs/editor/common/services/codeCommentsService';
import { Range } from 'vs/editor/common/core/range';
import Event, { Emitter } from 'vs/base/common/event';
import { Diff } from 'vs/workbench/services/codeComments/common/diff';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { Git } from 'vs/workbench/services/codeComments/browser/git';
import URI from 'vs/base/common/uri';
import { startsWith } from 'vs/base/common/strings';
import { isFileLikeResource } from 'vs/platform/files/common/files';
import { IRemoteService, requestGraphQL, requestGraphQLMutation } from 'vs/platform/remote/node/remote';
import { TPromise } from 'vs/base/common/winjs.base';

/**
 * A unique identifier for a file.
 */
interface DocumentId {
	/**
	 * The repo identifier (e.g. github.com/sourcegraph/sourcegraph).
	 */
	repo: string;

	/**
	 * The file identifier (e.g. dev/start.sh).
	 * It is relative to the repo.
	 */
	file: string;
}

/**
 * Graphql representation of an entire thread and its comments.
 */
const threadGraphql = `
id
file
revision
startLine
endLine
startCharacter
endCharacter
createdAt
comments {
	id
	contents
	createdAt
	updatedAt
	authorName
	authorEmail
}
`;

// TODO: sorting, validation (at least one comment per thread)
export class CodeCommentsService implements ICodeCommentsService {
	public _serviceBrand: any;

	private commentsDidChangeEmitter = new Emitter<CommentsDidChangeEvent>();

	/**
	 * Event that is fired when comments change for a file.
	 */
	public onCommentsDidChange: Event<CommentsDidChangeEvent> = this.commentsDidChangeEmitter.event;

	/**
	 * Map of file -> thread id -> thread.
	 * TODO: this cache needs to be invalidated when scm changes.
	 */
	private threadCache = new Map<URI, Map<number, Thread>>();

	private git: Git;

	constructor(
		@ISCMService private scmService: ISCMService,
		@IRemoteService private remoteService: IRemoteService,
	) {
		this.git = new Git(scmService);
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public createThread(file: URI, range: Range, contents: string): TPromise<Thread> {
		return TPromise.join([
			this.git.getRevisionSHA(file),
			this.git.getUserName(file),
			this.git.getUserEmail(file),
			this.git.getRoot(file),
			this.git.getRemoteRepo(file),
			this.git.getAccessToken(file),
		])
			.then(([revision, authorName, authorEmail, root, repo, accessToken]) => {
				const relativeFile = this.relativePath(URI.parse(root), file);
				return requestGraphQLMutation<{ createThread: GQL.IThread }>(this.remoteService, `mutation {
					createThread(
						remoteURI: $remoteURI,
						accessToken: $accessToken,
						file: $file,
						revision: $revision,
						startLine: $startLine,
						endLine: $endLine,
						startCharacter: $startCharacter,
						endCharacter: $endCharacter,
						contents: $contents,
						authorName: $authorName,
						authorEmail: $authorEmail,
					) {
						${threadGraphql}
					}
				}`, {

						remoteURI: repo,
						accessToken,
						file: relativeFile,
						revision,
						startLine: range.startLineNumber,
						endLine: range.endLineNumber,
						startCharacter: range.startColumn,
						endCharacter: range.endColumn,
						contents,
						authorName,
						authorEmail,
					});
			})
			.then(data => Thread.fromGraphQL(data.createThread))
			.then(thread => {
				let threads = this.threadCache.get(file);
				if (!threads) {
					threads = new Map<number, Thread>();
					this.threadCache.set(file, threads);
				}
				threads.set(thread.id, thread);
				return this.fireCommentsDidChangeEvent(file, thread);
			});
	}

	/**
	 * See the documentation on ICommentService.
	 */
	public replyToThread(file: URI, thread: Thread, contents: string): TPromise<void> {
		return TPromise.join([
			this.git.getUserName(file),
			this.git.getUserEmail(file),
			this.git.getRemoteRepo(file),
			this.git.getAccessToken(file),
		])
			.then(([authorName, authorEmail, remoteURI, accessToken]) => {
				return requestGraphQLMutation<{ addCommentToThread: GQL.IThread }>(this.remoteService, `mutation {
					addCommentToThread(
						threadID: $threadID,
						remoteURI: $remoteURI,
						accessToken: $accessToken,
						contents: $contents,
						authorName: $authorName,
						authorEmail: $authorEmail,
					) {
						${threadGraphql}
					}
				}`, {
						threadID: thread.id,
						remoteURI,
						accessToken,
						contents,
						authorName,
						authorEmail,
					});
			})
			.then(data => Thread.fromGraphQL(data.addCommentToThread))
			.then(thread => {
				let threads = this.threadCache.get(file);
				if (!threads) {
					threads = new Map<number, Thread>();
					this.threadCache.set(file, threads);
				}
				threads.set(thread.id, thread);
				this.fireCommentsDidChangeEvent(file, thread);
			});
	}

	private fireCommentsDidChangeEvent(file: URI, thread: Thread): TPromise<Thread> {
		return this.adjustThreadRanges(file, [thread]).then(adjustedThreads => {
			this.commentsDidChangeEmitter.fire({ file, threads: [thread] });
			return thread;
		});
	}

	private endsWithSlash(s: string): string {
		if (s.charAt(s.length - 1) === '/') {
			return s;
		}
		return s + '/';
	}

	/**
	 * Returns fileInRoot relative to root.
	 * It throws an error if fileInRoot is not inside of root.
	 */
	private relativePath(root: URI, fileInRoot: URI): string {
		const rootPrefix = this.endsWithSlash(root.path);
		if (!startsWith(fileInRoot.path, rootPrefix)) {
			throw new Error(`file ${fileInRoot.path} not in root ${rootPrefix}`);
		}
		return fileInRoot.path.substr(rootPrefix.length);
	}

	/**
	 * Returns a canonical identifier for the local file path, or undefined for resources
	 * that don't support code comments.
	 *
	 * For example:
	 * file:///Users/nick/dev/vscode-private/README.md -> github.com/sourcegraph/vscode-private/README.md
	 */
	private getDocumentId(file: URI): TPromise<DocumentId | undefined> {
		if (!isFileLikeResource(file)) {
			return TPromise.as(void 0);
		}
		return TPromise.join([
			this.git.getRoot(file),
			this.git.getRemoteRepo(file),
		]).then(([root, repo]) => {
			const relativeFile = this.relativePath(URI.parse(root), file);
			return { repo, file: relativeFile };
		});
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public getThreads(file: URI, skipCache: boolean): TPromise<Thread[]> {
		const cachedThreads = this.threadCache.get(file);
		if (cachedThreads && !skipCache) {
			return this.adjustThreadRanges(file, toArray(cachedThreads));
		}

		return this.getDocumentId(file)
			.then(id => {
				if (id === undefined) {
					return TPromise.as<Thread[]>([]);
				}
				return this.fetchThreads(file, id);
			}).then(threads => {
				this.threadCache.set(file, toMap(threads, thread => thread.id));
				return this.adjustThreadRanges(file, threads);
			}).then(adjustedThreads => {
				this.commentsDidChangeEmitter.fire({ file, threads: adjustedThreads });
				return adjustedThreads;
			});
	}

	private fetchThreads(file: URI, id: DocumentId): TPromise<Thread[]> {
		return this.git.getAccessToken(file)
			.then(accessToken => {
				return requestGraphQL<{ threads: GQL.IThread[] }>(this.remoteService, `query ThreadsForFile(
			$repo: String!,
			$accessToken: String!,
			$file: String!,
		) {
			root {
				threads(
					remoteURI: $repo,
					accessToken: $accessToken,
					file: $file,
				) {
					${threadGraphql}
				}
			}
		}`, {
						repo: id.repo,
						file: id.file,
						accessToken,
					});
			})
			.then(data => data.threads.map(thread => Thread.fromGraphQL(thread)));
	}

	/**
	 * Returns the subset of threads that are attached to the file at its current revision.
	 * TODO: this should be cached in some way instead of being recomputed.
	 */
	private adjustThreadRanges(file: URI, threads: Thread[]): TPromise<Thread[]> {
		// TODO: this does not correctly handle uncommitted changes.
		return this.git.getRevisionSHA(file)
			.then(toRev => {
				// Collect all relevant diffs.
				const revs = threads.map(thread => thread.revision).filter(uniqueFilter);
				return TPromise.join(revs.map(rev =>
					this.git.getDiff(file, rev, toRev)
						.then(diff => ({ rev, diff: new Diff(diff) }))
				));
			})
			.then(diffs => {
				return diffs.reduce((map, diff) => {
					map.set(diff.rev, diff.diff);
					return map;
				}, new Map<string, Diff>());
			})
			.then(diffs => {
				// Adjust thread ranges.
				return threads.reduce<Thread[]>((threads, thread) => {
					const diff = diffs.get(thread.revision);
					if (!diff) {
						// Should never happen assuming the logic above is correct.
						console.error('missing diff for revision', thread.revision);
						return threads;
					}
					const range = diff.transformRange(thread.range);
					if (range) {
						threads.push(thread.with({ range }));
					}
					return threads;
				}, []);
			})
			.then(threads => threads.sort(mostRecentCommentTimeDescending));
	}
}

function uniqueFilter<T>(value: T, index: number, values: T[]): boolean {
	return values.indexOf(value) === index;
}

function mostRecentCommentTimeDescending(left: Thread, right: Thread): number {
	return right.mostRecentComment.createdAt.getTime() - left.mostRecentComment.createdAt.getTime();
}

function toArray<K, V>(map: Map<K, V>): V[] {
	const array: V[] = [];
	map.forEach(value => array.push(value));
	return array;
}

function toMap<K, V>(array: V[], key: (value: V) => K): Map<K, V> {
	return array.reduce((map, value) => {
		map.set(key(value), value);
		return map;
	}, new Map<K, V>());
}