/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { ICodeCommentsService, IFileCommentsModel, Thread, CommentsDidChangeEvent } from 'vs/editor/common/services/codeCommentsService';
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
import { first, uniqueFilter } from 'vs/base/common/arrays';
import { values } from 'vs/base/common/map';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';

/**
 * Don't fetch threads from network more often than this.
 */
const REFETCH_DELAY_MS = 5000;

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

/**
 * Models the state of comments on a file.
 */
export class FileCommentsModel implements IFileCommentsModel {

	private _selectedThread: Thread | undefined;
	private selectedThreadDidChangeEmitter = new Emitter<void>();

	/**
	 * See documentation on ICodeCommentsModel.
	 */
	public onSelectedThreadDidChange: Event<void> = this.selectedThreadDidChangeEmitter.event;

	public set selectedThread(thread: Thread | undefined) {
		this._selectedThread = thread;
		this.selectedThreadDidChangeEmitter.fire();
	}

	public get selectedThread(): Thread | undefined {
		return this._selectedThread;
	}
}

// TODO: validation (at least one comment per thread)
export class CodeCommentsService implements ICodeCommentsService {
	public _serviceBrand: any;

	/**
	 * Map of file uri -> model.
	 */
	private models = new Map<string, IFileCommentsModel>();

	private commentsDidChangeEmitter = new Emitter<CommentsDidChangeEvent>();

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public onCommentsDidChange: Event<CommentsDidChangeEvent> = this.commentsDidChangeEmitter.event;

	/**
	 * Map of file uri -> thread id -> thread (unadjusted range).
	 */
	private threadCache = new Map<string, Map<number, Thread>>();

	/**
	 * Map of file uri -> threads with adjusted ranges.
	 *
	 * TODO: needs to be invalidated in certain edge conditions.
	 */
	private adjustedThreadCache = new Map<string, Thread[]>();

	/**
	 * Map of file uri -> promise that resolves after threads have been fetched from network.
	 */
	private fetchingThreads = new Map<string, TPromise<void>>();

	/**
	 * Map of file uri -> promise that resolves after thread ranges have been adjusted.
	 */
	private adjustingThreads = new Map<string, TPromise<Thread[]>>();

	/**
	 * Map of file uri -> promise that resolves after threads have been fetched
	 * and ranges have been adjusted.
	 */
	private refreshingThreads = new Map<string, TPromise<void>>();

	private git: Git;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IRemoteService private remoteService: IRemoteService,
		@ISCMService private scmService: ISCMService,
	) {
		this.git = instantiationService.createInstance(Git);
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public getModel(file: URI): IFileCommentsModel {
		let model = this.models.get(file.toString());
		if (!model) {
			model = new FileCommentsModel();
			this.models.set(file.toString(), model);
		}
		return model;
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public createThread(file: URI, range: Range, contents: string): TPromise<Thread> {
		const revision = this.git.getLastPushedRevision(file);
		const reverseDiff = revision.then(rev => this.git.getDiff(file, rev, { reverse: true }));
		return TPromise.join<any>([
			revision,
			reverseDiff,
			this.git.getUserName(file),
			this.git.getUserEmail(file),
			this.getPathRelativeToRepo(file),
			this.git.getRemoteRepo(file),
			this.git.getAccessToken(file),
		])
			.then(([revision, diff, authorName, authorEmail, relativeFile, repo, accessToken]) => {
				// We adjust the range to be for the last pushed revision.
				// If this line doesn't exist in the last pushed revision, then we shouldn't publish the comment
				// because nobody would be able to see it.
				const adjustedRange = (new Diff(diff)).transformRange(range);
				if (!adjustedRange) {
					throw new Error(localize('notPushed', 'unable to comment on this line because it has not been pushed'));
				}
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
						startLine: adjustedRange.startLineNumber,
						endLine: adjustedRange.endLineNumber,
						startCharacter: adjustedRange.startColumn,
						endCharacter: adjustedRange.endColumn,
						contents,
						authorName,
						authorEmail,
					});
			})
			.then(data => Thread.fromGraphQL(data.createThread))
			.then(thread => {
				let threads = this.threadCache.get(file.toString());
				if (!threads) {
					threads = new Map<number, Thread>();
					this.threadCache.set(file.toString(), threads);
				}
				threads.set(thread.id, thread);
				return this.adjustCachedThreadRanges(file).then(adjustedThreads => {
					return first(adjustedThreads, adjustedThread => adjustedThread.id === thread.id);
				});
			});
	}

	/**
	 * See the documentation on ICommentService.
	 */
	public replyToThread(file: URI, thread: Thread, contents: string): TPromise<void> {
		return TPromise.join<any>([
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
				let threads = this.threadCache.get(file.toString());
				if (!threads) {
					threads = new Map<number, Thread>();
					this.threadCache.set(file.toString(), threads);
				}
				threads.set(thread.id, thread);
				this.adjustCachedThreadRanges(file);
			});
	}

	/**
	 * Returns a canonical identifier for the local file path, or undefined for resources
	 * that don't support code comments.
	 *
	 * For example:
	 * file:///Users/nick/dev/xsourcegraph/README.md -> github.com/sourcegraph/xsourcegraph/README.md
	 */
	private getDocumentId(file: URI): TPromise<DocumentId | undefined> {
		if (!isFileLikeResource(file)) {
			return TPromise.as(void 0);
		}
		return TPromise.join([
			this.getPathRelativeToRepo(file),
			this.git.getRemoteRepo(file),
		]).then(([relativeFile, repo]) => {
			return { repo, file: relativeFile };
		});
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public getThreads(file: URI): Thread[] {
		return this.adjustedThreadCache.get(file.toString()) || [];
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public getThread(file: URI, id: number): Thread | undefined {
		return first(this.getThreads(file), thread => thread.id === id);
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public refreshThreads(file: URI): TPromise<void> {
		const refreshing = this.fetchThreads(file)
			.then(() => this.adjustCachedThreadRanges(file))
			.then(() => { });
		this.refreshingThreads.set(file.toString(), refreshing);
		return refreshing;
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public refreshing(file: URI): TPromise<void> {
		return this.refreshingThreads.get(file.toString()) || TPromise.wrap(undefined);
	}

	/**
	 * Fetches threads from the network and saves them to the in-memory cache.
	 */
	private fetchThreads(file: URI): TPromise<void> {
		const fetchId = file.toString();
		const alreadyFetching = this.fetchingThreads.get(fetchId);
		if (alreadyFetching) {
			return alreadyFetching;
		}

		interface ThreadsResponse {
			threads: GQL.IThread[];
		}

		const fetch = TPromise.join([
			this.getDocumentId(file),
			this.git.getAccessToken(file),
		]).then<ThreadsResponse>(([documentId, accessToken]) => {
			if (!documentId) {
				return TPromise.wrap({ threads: [] });
			}
			return requestGraphQL<ThreadsResponse>(this.remoteService, `query ThreadsForFile(
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
					...documentId,
					accessToken,
				});
		})
			.then(data => {
				const cachedThreads = data.threads.reduce((threads, thread) => {
					threads.set(thread.id, Thread.fromGraphQL(thread));
					return threads;
				}, new Map<number, Thread>());
				this.threadCache.set(file.toString(), cachedThreads);
			});
		this.fetchingThreads.set(fetchId, fetch);
		fetch.done(() => {
			setTimeout(() => {
				this.fetchingThreads.delete(fetchId);
			}, REFETCH_DELAY_MS);
		}, err => {
			this.fetchingThreads.delete(fetchId);
		});
		return fetch;
	}

	private adjustCachedThreadRanges(file: URI): TPromise<Thread[]> {
		const alreadyAdjusting = this.adjustingThreads.get(file.toString());
		if (alreadyAdjusting) {
			return alreadyAdjusting;
		}

		const threads = values(this.threadCache.get(file.toString()));
		const adjusting = this.adjustThreadRanges(file, threads).then(adjustedThreads => {
			this.adjustedThreadCache.set(file.toString(), adjustedThreads);
			this.commentsDidChangeEmitter.fire({ file });
			return adjustedThreads;
		});
		this.adjustingThreads.set(file.toString(), adjusting);
		adjusting.done(() => {
			this.adjustingThreads.delete(file.toString());
		}, () => {
			this.adjustingThreads.delete(file.toString());
		});
		return adjusting;
	}

	/**
	 * Returns the subset of threads that are attached to the file at its current revision.
	 */
	private adjustThreadRanges(file: URI, threads: Thread[]): TPromise<Thread[]> {
		interface RevDiff {
			rev: string;
			diff: Diff;
		};

		// Collect all relevant diffs.
		const revs = threads.map(thread => thread.revision).filter(uniqueFilter(rev => rev));
		return TPromise.join<RevDiff | undefined>(revs.map(rev =>
			this.git.getDiff(file, rev)
				.then(diff => ({ rev, diff: new Diff(diff) }), err => {
					const stderr = err.stderr;
					if (typeof stderr === 'string' && stderr.indexOf('bad object') >= 0) {
						// We were unable to compute the diff because the ref is not accessible on the local machine.
						// This is what happens if commit is made on a ref in a branch and then the branch is deleted.
						// Not uncommon since this is what happens when a branch is squash merged into another branch.
						// We don't want to throw or log an error in this case, just silently skip over this comment.
						return undefined;
					}
					throw err;
				})
		))
			.then(diffs => {
				return diffs.reduce((map, diff) => {
					if (diff) {
						map.set(diff.rev, diff.diff);
					}
					return map;
				}, new Map<string, Diff>());
			})
			.then(diffs => {
				// Adjust thread ranges.
				return threads.reduce<Thread[]>((threads, thread) => {
					const diff = diffs.get(thread.revision);
					if (!diff) {
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

	private getPathRelativeToRepo(file: URI): TPromise<string> {
		const repository = this.scmService.getRepositoryForResource(file);
		if (!repository) {
			return TPromise.wrapError(new Error(`no scm provider in context ${file.toString()}`));
		}
		if (!repository.provider.rootFolder) {
			return TPromise.wrapError(new Error(`scmProvider for context ${file.toString()} has no root folder`));
		}
		const root = this.endsWithSlash(repository.provider.rootFolder.path);
		if (!startsWith(file.path, root)) {
			return TPromise.wrapError(new Error(`file ${file.path} not in root ${root}`));
		}
		return TPromise.wrap(file.path.substr(root.length));
	}

	private endsWithSlash(s: string): string {
		if (s.charAt(s.length - 1) === '/') {
			return s;
		}
		return s + '/';
	}
}

function mostRecentCommentTimeDescending(left: Thread, right: Thread): number {
	return right.mostRecentComment.createdAt.getTime() - left.mostRecentComment.createdAt.getTime();
}
