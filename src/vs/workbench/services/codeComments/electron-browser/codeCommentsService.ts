/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ICodeCommentsService, IThread, CommentsDidChangeEvent } from 'vs/editor/common/services/codeCommentsService';
import { Range } from 'vs/editor/common/core/range';
import Event, { Emitter } from 'vs/base/common/event';
import { Diff } from 'vs/workbench/services/codeComments/common/diff';
import { ISCMService } from 'vs/workbench/services/scm/common/scm';
import { Git } from 'vs/workbench/services/codeComments/electron-browser/git';
import URI from 'vs/base/common/uri';
import { startsWith } from 'vs/base/common/strings';
import { isFileLikeResource } from 'vs/platform/files/common/files';

let nextId = 0;

/**
 * Temporary until the server is wired up.
 */
function getNextId(): number {
	const id = nextId;
	nextId++;
	return id;
}

// TODO: sorting, validation (at least one comment per thread)
export class CodeCommentsService implements ICodeCommentsService {
	public _serviceBrand: any;

	private commentsDidChangeEmitter = new Emitter<CommentsDidChangeEvent>();

	/**
	 * Event that is fired when comments change for a file.
	 */
	public onCommentsDidChange: Event<CommentsDidChangeEvent> = this.commentsDidChangeEmitter.event;

	/**
	 * An in-memory datastore of threads by document id (this.getDocumentId).
	 */
	private threads = new Map<string, IThread[]>();

	private git: Git;

	constructor(
		@ISCMService private scmService: ISCMService,
	) {
		this.git = new Git(scmService);
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public createThread(file: URI, range: Range, content: string): Promise<IThread> {
		// TODO: do network request
		// in the meantime, simulate network request latency
		return new Promise(resolve => setTimeout(resolve, 10))
			.then(() => {
				return Promise.all([
					this.git.getRevisionSHA(file),
					this.git.getUserName(file),
					this.git.getUserEmail(file),
					this.git.getRoot(file),
					this.git.getRemoteRepo(file),
				]);
			})
			.then(([revision, authorName, authorEmail, root, repo]) => {
				const relativeFile = this.relativePath(root, file);
				const thread: IThread = {
					id: getNextId(),
					repo,
					revision,
					file: relativeFile,
					range,
					comments: [{
						id: getNextId(),
						authorEmail,
						authorName,
						content,
						createdAt: new Date(),
					}],
				};
				const id = this.joinDocumentId(repo, relativeFile);
				let threads = this.threads.get(id);
				if (!threads) {
					threads = [];
					this.threads.set(id, threads);
				}
				threads.push(thread);
				this.commentsDidChangeEmitter.fire({
					file,
					threads: [thread],
				});
				return thread;
			});
	}

	/**
	 * See the documentation on ICommentService.
	 */
	public replyToThread(file: URI, thread: IThread, content: string): Promise<IThread> {
		return Promise.all([
			this.git.getUserName(file),
			this.git.getUserEmail(file),
		]).then(([authorName, authorEmail]) => {
			thread.comments.push({
				id: getNextId(),
				authorEmail,
				authorName,
				content,
				createdAt: new Date(),
			});
			this.commentsDidChangeEmitter.fire({ file, threads: [thread] });
			return thread;
		});
	}

	/**
	 * Returns the document id for a repo and a file inside of that repo.
	 */
	private joinDocumentId(repo: string, repoRelativeFilePath: string): string {
		return repo + '/' + repoRelativeFilePath;
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
	private getDocumentId(file: URI): Promise<string | undefined> {
		if (!isFileLikeResource(file)) { return undefined; }
		return Promise.all([
			this.git.getRoot(file),
			this.git.getRemoteRepo(file),
		]).then(([root, repo]) => {
			if (!repo) {
				return undefined;
			}
			const relativeFile = this.relativePath(root, file);
			return this.joinDocumentId(repo, relativeFile);
		});
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public async getThreads(file: URI): Promise<IThread[]> {
		const id = await this.getDocumentId(file);
		if (id === undefined) {
			return [];
		}
		const threads = this.threads.get(id) || [];
		return this.adjustThreadRanges(file, threads);
	}

	/**
	 * Returns the subset of threads that are attached to the file at its current revision.
	 */
	private async adjustThreadRanges(file: URI, threads: IThread[]): Promise<IThread[]> {
		const toRev = await this.git.getRevisionSHA(file);

		// Collect all relevant diffs.
		const revs = threads.map(thread => thread.revision).filter(uniqueFilter);
		const diffs = new Map<string, Diff>();
		for (const rev of revs) {
			// We are serially quering diffs for simplicity.
			// This could be optimized to be done in parallel,
			// but we would also want to avoid spawing too many commands at once.
			// Using observable semantics here would be cool.
			const diff = await this.git.getDiff(file, rev, toRev);
			diffs.set(rev, new Diff(diff));
		}

		// Adjust thread ranges.
		const adjustedThreads: IThread[] = [];
		for (const thread of threads) {
			const diff = diffs.get(thread.revision);
			if (!diff) {
				// Should never happen assuming the logic above is correct.
				console.error('missing diff for revision', thread.revision);
				continue;
			}
			const range = diff.transformRange(thread.range);
			if (range) {
				adjustedThreads.push({ ...thread, range });
			}
		}
		// TODO: remove sort once server does this
		return adjustedThreads.sort(mostRecentCommentTimeDescending);
	}
}

function uniqueFilter<T>(value: T, index: number, values: T[]): boolean {
	return values.indexOf(value) === index;
}

function mostRecentCommentTimeDescending(left: IThread, right: IThread): number {
	return right.comments[0].createdAt.getTime() - left.comments[0].createdAt.getTime();
}