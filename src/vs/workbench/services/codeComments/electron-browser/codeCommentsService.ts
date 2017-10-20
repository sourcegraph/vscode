/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { IThreads, ICodeCommentsService, Filter, IFileComments, IThreadComments, IComment, IDraftThreadComments, IOrgComments, IRepoComments } from 'vs/editor/common/services/codeCommentsService';
import { Range } from 'vs/editor/common/core/range';
import Event, { Emitter, any } from 'vs/base/common/event';
import { VSDiff as Diff } from 'vs/workbench/services/codeComments/common/vsdiff';
import { Disposable } from 'vs/workbench/services/codeComments/common/disposable';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { Git } from 'vs/workbench/services/codeComments/browser/git';
import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { startsWith } from 'vs/base/common/strings';
import { IRemoteService, requestGraphQL, requestGraphQLMutation, IRemoteConfiguration } from 'vs/platform/remote/node/remote';
import { TPromise } from 'vs/base/common/winjs.base';
import { first, uniqueFilter, coalesce } from 'vs/base/common/arrays';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ICommonCodeEditor, IModel } from 'vs/editor/common/editorCommon';
import { RawTextSource } from 'vs/editor/common/model/textSource';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import { StrictResourceMap } from 'vs/base/common/map';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IModelContentChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { InterruptibleDelayer, ThrottledDelayer } from 'vs/base/common/async';
import { IAuthService } from 'vs/platform/auth/common/auth';
import { DiffWorkerClient } from 'vs/workbench/services/codeComments/node/diffWorkerClient';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TextModel } from 'vs/editor/common/model/textModel';
// TODO(nick): fix this
// tslint:disable-next-line:import-patterns
import { IOutputService } from 'vs/workbench/parts/output/common/output';
// TODO(nick): fix this
// tslint:disable-next-line:import-patterns
import { CommentsChannelId } from 'vs/workbench/parts/codeComments/common/constants';
import * as objects from 'vs/base/common/objects';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export { Event }

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
 * Graphql representation of a comment.
 */
const commentsGraphql = `
comments {
	id
	contents
	createdAt
	updatedAt
	author {
		displayName
		email
		avatarURL
	}
}`;

/**
 * Graphql representation of an entire thread and its comments.
 */
const threadGraphql = `
id
title
file
branch
revision
startLine
endLine
startCharacter
endCharacter
createdAt
archivedAt
repo {
	remoteUri
}
${commentsGraphql}`;

const threadConnectionGraphql = `
nodes {
${threadGraphql}
}`;

export class CodeCommentsService implements ICodeCommentsService {
	public _serviceBrand: any;

	/**
	 * Map of file uri -> model.
	 */
	private models = new StrictResourceMap<FileComments>();

	private diffWorkerProvider: DiffWorkerClient;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IOutputService private outputService: IOutputService,
		@IAuthService private authService: IAuthService,
		@IRemoteService private remoteService: IRemoteService,
		@ISCMService private scmService: ISCMService
	) {
		this.diffWorkerProvider = new DiffWorkerClient(environmentService.debugDiff);
	}

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public getFileComments(file: URI): FileComments {
		// TODO(nick): prevent memory from growing unbounded.
		// We should tie the lifecycle of our code comments models to the lifecycle of the
		// editor models that they are attached to; however, we woud need to persist certain data
		// like draft threads and draft replies so they could be restored.
		let model = this.models.get(file);
		if (!model) {
			model = this.instantiationService.createInstance(FileComments, this, this.diffWorkerProvider, file);
			this.models.set(file, model);
		}
		return model;
	}

	public getThreads(filter: Filter): Threads {
		return this.instantiationService.createInstance(Threads, this, filter);
	}

	public shareComment(commentID: number): TPromise<string> {
		return requestGraphQLMutation<{ shareComment: string }>(this.remoteService, `mutation ShareComment {
			shareComment(commentID: $commentID)
		}`, {
				commentID: commentID,
			})
			.then(response => response.shareComment);
	}

	public shareThread(threadID: number): TPromise<string> {
		return requestGraphQLMutation<{ shareThread: string }>(this.remoteService, `mutation ShareThread {
			shareThread(threadID: $threadID)
		}`, {
				threadID: threadID,
			})
			.then(response => response.shareThread);
	}

	/**
	 * @deprecated TODO(kingy): use Threads instead
	 */
	public getOrgComments(): IOrgComments {
		return this.instantiationService.createInstance(OrgComments, this);
	}

	public readonly didCreateThread = new Emitter<IThreadCommentsMemento>();
	public readonly onDidCreateThread = this.didCreateThread.event;

	public readonly didUpdateThread = new Emitter<IThreadCommentsMemento>();
	public readonly onDidUpdateThread = this.didUpdateThread.event;

	public readonly didFetchThreads = new Emitter<IFetchThreadsEvent>();
	public readonly onDidFetchThreads = this.didFetchThreads.event;
}

/**
 * The parameters used to fetch a set of threads from the server.
 */
export interface IThreadQueryParams {
	readonly orgId: number;
	readonly repo: string | undefined;
	readonly branch: string | undefined;
	readonly file: string | undefined;
}

/**
 * An event that is fired when threads are fetched from the server.
 */
export interface IFetchThreadsEvent {

	/**
	 * The query that was used to fetch the threads.
	 */
	readonly query: IThreadQueryParams;

	/**
	 * The threads returned by the server that matched the query.
	 */
	readonly threads: ReadonlyArray<IThreadCommentsMemento>;
}


/**
 * @deprecated TODO(kingy): use Threads instead
 */
export class OrgComments extends Disposable implements IOrgComments {
	private _repoComments: IRepoComments[] = [];
	private didChangeRepoComments = this.disposable(new Emitter<void>());
	public readonly onDidChangeRepoComments = this.didChangeRepoComments.event;

	public get repoComments(): IRepoComments[] {
		return this._repoComments;
	}

	constructor(
		private commentsService: CodeCommentsService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IRemoteService private remoteService: IRemoteService,
		@IAuthService private authService: IAuthService,
	) {
		super();
	}

	private refreshDelayer = new ThrottledDelayer<void>(100);
	public refresh(): TPromise<void> {
		return this.refreshDelayer.trigger(() => TPromise.wrap(this.refreshNow()));
	}

	private async refreshNow(): Promise<void> {
		if (!this.authService.currentUser || !this.authService.currentUser.currentOrgMember) {
			return TPromise.as(undefined);
		}
		const response = await requestGraphQL<{ org: { repos: { remoteUri: string, threads: GQL.IThread[] }[] } }>(this.remoteService, `query ThreadsForOrgs (
			) {
				root {
					org(id: $orgId) {
						repos {
							remoteUri
							threads {
								${threadGraphql}
							}
						}
					}
				}
			}`, {
				orgId: this.authService.currentUser.currentOrgMember.org.id,
			});
		if (!response) {
			return TPromise.as(undefined);
		}

		this._repoComments = response.org.repos.map(repo => {
			const threads = repo.threads.map(thread => {
				return this.instantiationService.createInstance(ThreadComments, this.commentsService, undefined, gqlThreadToMemento(thread));
			}).sort((left: ThreadComments, right: ThreadComments) => {
				// Most recent comment timestamp descending.
				const rightTime = right.comments.length === 0 ? right.createdAt : right.mostRecentComment.createdAt;
				const leftTime = left.comments.length === 0 ? left.createdAt : left.mostRecentComment.createdAt;
				return rightTime.getTime() - leftTime.getTime();
			});

			return {
				remoteUri: repo.remoteUri,
				threads: threads,
			};
		});

		this.didChangeRepoComments.fire();
	}
}

export class Threads extends Disposable implements IThreads {

	private _threads: ThreadComments[] = [];
	private didChangeThreads = this.disposable(new Emitter<void>());
	public readonly onDidChangeThreads = this.didChangeThreads.event;
	public get threads(): ThreadComments[] {
		return this._threads;
	}

	private git: Git;

	constructor(
		private commentService: CodeCommentsService,
		private filter: Filter,
		@IWindowsService windowsService: IWindowsService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IRemoteService private remoteService: IRemoteService,
		@IAuthService private authService: IAuthService,
		@ISCMService private scmService: ISCMService,
		@IOutputService private outputService: IOutputService,
	) {
		super();
		this.git = new Git(this.filter.resource, scmService);
		commentService.onDidFetchThreads(this.onDidFetchThreads, this, this.disposables);
		commentService.onDidCreateThread(this.onDidCreateThread, this, this.disposables);
		windowsService.onWindowFocus(this.refresh, this, this.disposables);
	}

	private refreshDelayer = new ThrottledDelayer<void>(100);
	public refresh(): TPromise<void> {
		this.scheduleNextAutoRefresh();
		return this.refreshDelayer.trigger(() => TPromise.wrap(this.refreshNow()));
	}

	/**
	 * Refresh the collection after a certain time interval if no other refreshes have happened.
	 */
	private refreshTimeout = TPromise.timeout(0);
	private scheduleNextAutoRefresh(): void {
		this.refreshTimeout.cancel();
		this.refreshTimeout = TPromise.timeout(60 * 1000).then(() => this.refresh());
	}

	private query: IThreadQueryParams;
	private async refreshNow(): Promise<void> {
		const repoFile = await this.getRepoFile();
		if (!repoFile) {
			return;
		}
		const { repo, file } = repoFile;
		if (!this.authService.currentUser || !this.authService.currentUser.currentOrgMember) {
			return;
		}
		this.query = {
			orgId: this.authService.currentUser.currentOrgMember.org.id,
			repo,
			branch: this.filter.branch,
			file,
		};
		const response = await requestGraphQL<{ org: { threads2: { nodes: GQL.IThread[] } } }>(this.remoteService, `query Threads (
			$file: String!,
		) {
			root {
				org(id: $orgId) {
					threads2(repoRemoteURI: $remoteURI, branch: $branch, file: $file) {
						${threadConnectionGraphql}
					}
				}
			}
		}`, this.query);
		const threads = response.org.threads2.nodes.map(thread => {
			const memento = gqlThreadToMemento(thread);
			this.commentService.didUpdateThread.fire(memento);
			return memento;
		});

		this.commentService.didFetchThreads.fire({ query: this.query, threads });
	}

	private async getRepoFile(): Promise<{ repo?: string, file?: string }> {
		if (!this.filter.resource) {
			return {};
		}
		try {
			const [repo, file] = await Promise.all([
				this.git.getRemoteRepo(),
				this.instantiationService.invokeFunction(getPathRelativeToResource, this.filter.resource),
			]);
			return { repo, file };
		} catch (err) {
			// These errors happen a lot on startup because the source control providers
			// arent registered yet. It isn't a problem on startup because we just retry later
			// when the source control providers change.
			const error = Array.isArray(err) ? err[0] : err;
			this.outputService.getChannel(CommentsChannelId).append(error.message);
			return undefined;
		}
	}

	private onDidFetchThreads(event: IFetchThreadsEvent): void {
		if (!objects.equals(event.query, this.query)) {
			return;
		}

		// Index our current threads by id.
		const threadsById = this.threads.reduce((threads, thread) => {
			threads.set(thread.id, thread);
			return threads;
		}, new Map<number, ThreadComments>());

		this._threads = event.threads
			.map(thread => {
				const currentThread = threadsById.get(thread.id);
				if (currentThread) {
					// Delete from map so we don't dispose this thread later.
					threadsById.delete(thread.id);
					return currentThread;
				} else {
					return this.instantiationService.createInstance(ThreadComments, this.commentService, this.git, thread);
				}
			})
			.sort((left: ThreadComments, right: ThreadComments) => {
				// Most recent comment timestamp descending.
				const rightTime = right.comments.length === 0 ? right.createdAt : right.mostRecentComment.createdAt;
				const leftTime = left.comments.length === 0 ? left.createdAt : left.mostRecentComment.createdAt;
				return rightTime.getTime() - leftTime.getTime();
			});

		// Dipose everything that is now unused by our collection.
		threadsById.forEach(t => t.dispose());

		this.didChangeThreads.fire();
	}

	private onDidCreateThread(threadMemento: IThreadCommentsMemento): void {
		if (!this.matchesFilter(threadMemento)) {
			return;
		}
		const thread = this.instantiationService.createInstance(ThreadComments, this.commentService, this.git, threadMemento);
		this._threads.unshift(thread);
		this.didChangeThreads.fire();
	}

	private matchesFilter(thread: IThreadCommentsMemento): boolean {
		if (!this.query) {
			// We are not initialized yet.
			return false;
		}
		if (!this.matchesFilterValue(this.query.repo, thread.repo)) {
			return false;
		}
		if (!this.matchesFilterValue(this.query.branch, thread.branch)) {
			return false;
		}
		if (!this.matchesFilterValue(this.query.file, thread.file)) {
			return false;
		}
		// if (!this.matchesFilterValue(this.filter.archived, thread.archived)) {
		// 	return false;
		// }
		return true;
	}

	private matchesFilterValue<V>(expected: V | undefined, actual: V | undefined): boolean {
		return typeof expected === 'undefined' || expected === actual;
	}
}

function gqlCommentToMemento(comment: GQL.IComment): IComment {
	return {
		id: comment.id,
		contents: comment.contents,
		createdAt: new Date(comment.createdAt),
		updatedAt: new Date(comment.createdAt),
		author: {
			email: comment.author.email,
			displayName: comment.author.displayName,
			avatarUrl: comment.author.avatarURL,
		}
	};
}

function gqlThreadToMemento(thread: GQL.IThread): IThreadCommentsMemento {
	const comments = thread.comments.map(gqlCommentToMemento);
	return {
		id: thread.id,
		title: thread.title,
		file: thread.file,
		branch: thread.branch,
		revision: thread.revision,
		range: new Range(thread.startLine, thread.startCharacter, thread.endLine, thread.endCharacter),
		createdAt: new Date(thread.createdAt),
		archived: !!thread.archivedAt,
		comments,
		repo: thread.repo.remoteUri,
		displayRange: false,
		draftReply: undefined,
	};
}

/**
 * Model for comments on a file.
 */
export class FileComments extends Disposable implements IFileComments {

	private modelWatcher: ModelWatcher;

	private didChangeThreads = this.disposable(new Emitter<void>());
	public readonly onDidChangeThreads = this.didChangeThreads.event;
	public get threads(): ThreadComments[] {
		return this.collection.threads;
	}
	public getThread(id: number): IThreadComments | undefined {
		return first(this.threads, thread => thread.id === id);
	}

	private _draftThreads: DraftThreadComments[] = [];
	private didChangeDraftThreads = this.disposable(new Emitter<void>());
	public readonly onDidChangeDraftThreads = this.didChangeDraftThreads.event;
	public get draftThreads(): DraftThreadComments[] {
		return this._draftThreads;
	}
	public getDraftThread(id: number): DraftThreadComments | undefined {
		return first(this.draftThreads, thread => thread.id === id);
	}

	private git: Git;
	private scmRepository: ISCMRepository;
	private collection: Threads;

	constructor(
		private commentsService: CodeCommentsService,
		private diffWorker: DiffWorkerClient,
		resource: URI,
		@ISCMService scmService: ISCMService,
		@IModelService private modelService: IModelService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IRemoteService private remoteService: IRemoteService,
		@IAuthService private authService: IAuthService,
		@IOutputService private outputService: IOutputService,
	) {
		super();
		this.git = instantiationService.createInstance(Git, resource);
		this.collection = this.disposable(commentsService.getThreads({ resource }));
		this.collection.onDidChangeThreads(this.updateDisplayRanges, this, this.disposables);

		this.modelWatcher = this.disposable(instantiationService.createInstance(ModelWatcher, resource));
		this.disposable(this.modelWatcher.onDidChangeContent(() => {
			this.updateDisplayRanges();
		}));

		this.disposable(any(
			scmService.onDidAddRepository,
			scmService.onDidRemoveRepository,
			scmService.onDidChangeRepository
		)(() => {
			const scmRepository = scmService.getRepositoryForResource(this.modelWatcher.uri);
			if (this.scmRepository !== scmRepository) {
				this.scmRepository = scmRepository;
				if (scmRepository) {
					this.refreshThreads();
				}
			}
		}));

		this.disposable(this.authService.onDidChangeCurrentUser(() => this.refreshThreads()));
	}

	public dispose() {
		this._draftThreads = dispose(this._draftThreads);
		super.dispose();
	}

	/**
	 * See documentation on IFileComments.
	 */
	public createDraftThread(editor: ICommonCodeEditor): DraftThreadComments {
		const draft = this.instantiationService.createInstance(DraftThreadComments, this.commentsService, this.git, editor);
		draft.onDidSubmit(thread => {
			draft.dispose();
			this.updateDisplayRanges();
		});
		draft.onWillDispose(() => {
			const idx = this._draftThreads.indexOf(draft);
			if (idx < 0) {
				return;
			}
			this._draftThreads.splice(idx, 1);
			this.didChangeDraftThreads.fire();
		});
		this._draftThreads.push(draft);
		this.didChangeDraftThreads.fire();
		return draft;
	}

	public refreshingThreads = TPromise.wrap<void>(undefined);
	private refreshThreadsDelayer = new ThrottledDelayer<void>(100);
	private didStartRefreshing = this.disposable(new Emitter<void>());
	public onDidStartRefreshingThreads = this.didStartRefreshing.event;

	/**
	 * See documentation on IFileComments.
	 */
	public refreshThreads(): TPromise<void> {
		return this.refreshThreadsDelayer.trigger(() => this.refreshThreadsNow());
	}

	private refreshThreadsNow(): TPromise<void> {
		this.refreshingThreads = this.collection.refresh()
			.then(response => this.updateDisplayRanges());

		this.didStartRefreshing.fire();
		return this.refreshingThreads;
	}

	/**
	 * Returns a canonical identifier for the local file path, or undefined for resources
	 * that don't support code comments.
	 *
	 * For example:
	 * file:///Users/nick/dev/src/README.md -> github.com/sourcegraph/src/README.md
	 */
	private getDocumentId(): TPromise<DocumentId | undefined> {
		if (this.modelWatcher.uri.scheme !== Schemas.file) {
			return TPromise.as(void 0);
		}
		return TPromise.join([
			this.instantiationService.invokeFunction(getPathRelativeToResource, this.modelWatcher.uri),
			this.git.getRemoteRepo(),
		])
			.then(([relativeFile, repo]) => {
				return { repo, file: relativeFile };
			})
			.then(docId => docId, err => {
				// These errors happen a lot on startup because the source control providers
				// arent registered yet. It isn't a problem on startup because we just retry later
				// when the source control providers change.
				const error = Array.isArray(err) ? err[0] : err;
				this.outputService.getChannel(CommentsChannelId).append(error.message);
				return undefined;
			});
	}

	private updateDisplayRangeDelayer = new InterruptibleDelayer<void>(1000);

	private updateDisplayRanges(): TPromise<void> {
		return this.updateDisplayRangeDelayer.trigger(() => {
			return this.updateDisplayRangesNow();
		});
	}

	private updateDisplayRangesNow(): TPromise<void> {
		return this.getDocumentId()
			.then<{ revision: string, content: string }[]>(documentId => {
				if (!documentId) {
					return TPromise.wrap(undefined);
				}
				return TPromise.join(
					this.threads
						// TODO(nick): ideally we don't want to compute display ranges for archived threads
						// unless the user actually clicks on it. For now, we compute them up front because
						// we don't have lazy computation yet.
						// .filter(thread => !thread.archived)
						.filter(uniqueFilter(thread => thread.revision))
						.filter(thread => thread.revision)
						.map(thread => this.instantiationService.invokeFunction(resolveContent, this.git, documentId, thread.revision)
							.then(content => content, err => {
								this.outputService.getChannel(CommentsChannelId).append(err.message);
								return undefined;
							})
						)
				);
			})
			.then(revContents => {
				if (!revContents || !this.modelWatcher.model) {
					return TPromise.as(undefined);
				}
				const revLines = revContents
					// Filter out revisions that failed to resolve
					.filter(revContent => revContent)
					.map(revContent => {
						const lines = RawTextSource.fromString(revContent.content).lines;
						return { revision: revContent.revision, lines };
					});
				const revRanges = this.threads.map(thread => {
					return {
						revision: thread.revision,
						range: thread.range,
					};
				});
				const modifiedLines = this.modelWatcher.model.getLinesContent();
				return this.diffWorker.diff({
					revLines,
					revRanges,
					modifiedLines,
				});
			})
			.then(result => {
				if (!result) {
					return;
				}
				for (const thread of this.threads) {
					const transforms = result[thread.revision];
					if (transforms) {
						thread.displayRange = Range.lift(transforms[thread.range.toString()]);
					}
				}
				this.didChangeThreads.fire();
			});
	}
}

/**
 * Watches a URI for changes.
 */
class ModelWatcher extends Disposable {
	private _model: IModel;
	public get model(): IModel {
		return this._model;
	}

	private didChangeContent = this.disposable(new Emitter<IModelContentChangedEvent>());
	public readonly onDidChangeContent = this.didChangeContent.event;

	constructor(
		public readonly uri: URI,
		@IModelService private modelService: IModelService,
	) {
		super();

		this.disposable(any(
			modelService.onModelAdded,
			modelService.onModelRemoved,
		)(this.handleModelChange, this));
		this.handleModelChange();
	}

	private disposeOnModelChange: IDisposable[] = [];

	private handleModelChange(): void {
		const model = this.modelService.getModel(this.uri);
		if (this._model === model) {
			return;
		}
		this._model = model;
		this.disposeOnModelChange = dispose(this.disposeOnModelChange);
		if (!model) {
			return;
		}
		this.disposeOnModelChange.push(model.onDidChangeContent(e => {
			this.didChangeContent.fire(e);
		}));
	}

	public dispose() {
		this.disposeOnModelChange = dispose(this.disposeOnModelChange);
		super.dispose();
	}
}

/**
 * This is a serilizable form of IThreadComments that is used in event notifications.
 */
export interface IThreadCommentsMemento {
	readonly id: number;
	readonly title: string;
	readonly file: string;
	readonly branch: string;
	readonly revision: string;
	readonly range: Range;
	readonly createdAt: Date;

	readonly archived: boolean;
	readonly comments: ReadonlyArray<IComment>;
	readonly draftReply: string | undefined;
	readonly pendingOperation?: boolean;

	/**
	 * A display range is either:
	 * - A range if the thread is attached
	 * - undefined if the range is not attached
	 * - false if this memento does not know the state of the display range
	 */
	readonly displayRange: Range | undefined | false;

	readonly repo: string;
}

export class ThreadComments extends Disposable implements IThreadComments {
	public readonly id: number;
	public readonly title: string;
	public readonly file: string;
	public readonly branch: string;
	public readonly revision: string;
	public readonly range: Range;
	public readonly createdAt: Date;
	public readonly repo: string;

	private _pendingOperation = false;
	private didChangePendingOperation = this.disposable(new Emitter<void>());
	public readonly onDidChangePendingOperation = this.didChangePendingOperation.event;
	public get pendingOperation() { return this._pendingOperation; }
	public set pendingOperation(pendingOperation: boolean) {
		if (this._pendingOperation !== pendingOperation) {
			this._pendingOperation = pendingOperation;
			this.didChangePendingOperation.fire();
			this.fireDidUpdateThreadEvent();
		}
	}

	private _archived = false;
	private didChangeArchived = this.disposable(new Emitter<void>());
	public onDidChangeArchived = this.didChangeArchived.event;
	public get archived(): boolean { return this._archived; }
	public set archived(archived: boolean) {
		if (this._archived !== archived) {
			this._archived = archived;
			this.didChangeArchived.fire();
			this.fireDidUpdateThreadEvent();
		}
	}

	private _comments: ReadonlyArray<IComment>;
	private didChangeComments = this.disposable(new Emitter<void>());
	public readonly onDidChangeComments = this.didChangeComments.event;
	public get comments(): ReadonlyArray<IComment> { return this._comments; }
	public set comments(comments: ReadonlyArray<IComment>) {
		this._comments = comments;
		this.didChangeComments.fire();
		this.fireDidUpdateThreadEvent();
	}

	private _draftReply = '';
	private didChangeDraftReply = this.disposable(new Emitter<void>());
	public readonly onDidChangeDraftReply = this.didChangeDraftReply.event;
	public get draftReply(): string { return this._draftReply; }
	public set draftReply(draftReply: string) {
		if (this._draftReply !== draftReply) {
			this._draftReply = draftReply;
			this.didChangeDraftReply.fire();
			this.fireDidUpdateThreadEvent();
		}
	}

	private _displayRange?: Range;
	private didChangeDisplayRange = this.disposable(new Emitter<void>());
	public readonly onDidChangeDisplayRange = this.didChangeDisplayRange.event;
	public get displayRange(): Range | undefined { return this._displayRange; }
	public set displayRange(displayRange: Range | undefined) {
		if (this._displayRange !== displayRange) {
			this._displayRange = displayRange;
			this.didChangeDisplayRange.fire();
			this.fireDidUpdateThreadEvent();
		}
	}

	public get mostRecentComment(): IComment {
		return this.comments[this.comments.length - 1];
	}

	constructor(
		private commentsService: CodeCommentsService,
		private git: Git,
		thread: IThreadCommentsMemento,
		@IRemoteService private remoteService: IRemoteService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IAuthService private authService: IAuthService,
	) {
		super();
		this.id = thread.id;
		this.title = thread.title;
		this.file = thread.file;
		this.branch = thread.branch;
		this.revision = thread.revision;
		this.range = thread.range;
		this.createdAt = thread.createdAt;
		this.archived = thread.archived;
		this._comments = thread.comments;
		this.repo = thread.repo;
		commentsService.onDidUpdateThread(this.onDidUpdateThread, this, this.disposables);
	}

	private fireDidUpdateThreadEvents = true;
	private onDidUpdateThread(thread: IThreadCommentsMemento): void {
		if (this.id !== thread.id) {
			return;
		}
		this.fireDidUpdateThreadEvents = false;
		this.archived = thread.archived;
		this.comments = thread.comments;
		this.pendingOperation = thread.pendingOperation;
		if (thread.displayRange !== false) {
			this.displayRange = thread.displayRange;
		}
		if (typeof thread.draftReply !== 'undefined') {
			this.draftReply = thread.draftReply;
		}
		this.fireDidUpdateThreadEvents = true;
	}

	private fireDidUpdateThreadEvent(): void {
		if (this.fireDidUpdateThreadEvents) {
			this.commentsService.didUpdateThread.fire(this);
		}
	}

	public setArchived(archived: boolean): TPromise<void> {
		return this.operation(() => {
			return requestGraphQLMutation<{ updateThread: GQL.IThread }>(this.remoteService, `mutation ThreadSetArchived {
				updateThread(
					threadID: $threadID,
					archived: $archived,
				) {
					archivedAt
				}
			}`, {
					threadID: this.id,
					archived,
				})
				.then(response => {
					this.archived = !!response.updateThread.archivedAt;
				});
		});
	}

	public submitDraftReply(): TPromise<void> {
		if (!this.draftReply.length) {
			return TPromise.wrapError(new Error(localize('emptyCommentError', "Comment can not be empty.")));
		}
		return this.operation(() => {
			return requestGraphQLMutation<{ addCommentToThread: GQL.IThread }>(this.remoteService, `mutation SubmitDraftReply {
				addCommentToThread(
					threadID: $threadID,
					contents: $contents,
				) {
					${commentsGraphql}
				}
			}`, {
					threadID: this.id,
					contents: this.draftReply,
				})
				.then(response => {
					this.draftReply = '';
					this.comments = response.addCommentToThread.comments.map(gqlCommentToMemento);
				});
		});
	}

	private operation(operation: () => TPromise<void>): TPromise<void> {
		if (this.pendingOperation) {
			return TPromise.wrapError(new Error('pending operation'));
		}
		this.pendingOperation = true;
		const result = operation();
		const clearPendingOperation = () => { this.pendingOperation = false; };
		result.done(clearPendingOperation, clearPendingOperation);
		return result;
	}

}

export class DraftThreadComments extends Disposable implements IDraftThreadComments {
	private static NEXT_ID = 1;

	public readonly id = DraftThreadComments.NEXT_ID++;

	private _content: string = '';
	private didChangeContent = this.disposable(new Emitter<void>());
	public readonly onDidChangeContent = this.didChangeContent.event;
	public get content(): string { return this._content; }
	public set content(content: string) {
		if (this._content !== content) {
			this._content = content;
			this.didChangeContent.fire();
			let title = content;
			const match = content.match(/[.!?]\s/);
			if (match) {
				title = content.substr(match.index + 1);
			}
			const newline = title.indexOf('\n');
			if (newline !== -1) {
				title = content.substr(0, newline);
			}
			title = title.trim();
			if (title.length > 140) {
				title = title.substr(0, 137) + '...';
			}
			this.title = title.trim();
		}
	}

	private _title: string = '';
	private didChangeTitle = this.disposable(new Emitter<void>());
	public readonly onDidChangeTitle = this.didChangeTitle.event;
	public get title(): string { return this._title; }
	public set title(title: string) {
		if (this._title !== title) {
			this._title = title;
			this.didChangeTitle.fire();
		}
	}

	private _displayRange: Range;
	private didChangeDisplayRange = this.disposable(new Emitter<void>());
	public readonly onDidChangeDisplayRange = this.didChangeDisplayRange.event;
	public get displayRange(): Range { return this._displayRange; }
	public set displayRange(displayRange: Range) {
		if (this._displayRange !== displayRange) {
			this._displayRange = displayRange;
			this.didChangeDisplayRange.fire();
		}
	}

	private didSubmit = this.disposable(new Emitter<ThreadComments>());
	public readonly onDidSubmit = this.didSubmit.event;

	private didChangeSubmitting = this.disposable(new Emitter<void>());
	public readonly onDidChangeSubmitting = this.didChangeSubmitting.event;

	private submitData: TPromise<{
		remoteURI: string,
		file: string,
		branch: string,
		revision: string,
		startLine: number,
		endLine: number,
		startCharacter: number,
		endCharacter: number,
		rangeLength: number,
		lines: GQL.IThreadLines,
	}>;

	/**
	 * Whether or not the user configuration allows sharing context (the literal
	 * code being commented on) with the remote Sourcegraph server.
	 */
	private shareContext: boolean;

	constructor(
		private commentsService: CodeCommentsService,
		private git: Git,
		editor: ICommonCodeEditor,
		@IMessageService messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IRemoteService private remoteService: IRemoteService,
		@IAuthService private authService: IAuthService,
		@IConfigurationService protected configurationService: IConfigurationService,
	) {
		super();
		this.displayRange = this.getNonEmptySelection(editor);
		const model = editor.getModel();

		// Configure with current configuration now, or with future configuration changes.
		this.disposable(configurationService.onDidUpdateConfiguration(() => this.onDidUpdateConfiguration()));
		this.onDidUpdateConfiguration();

		// Save a decoration for the range so if content changes
		// while we are waiting for promises to resolve, we will have an updated range.
		const rangeDecorationId = model.changeDecorations(change => {
			return change.addDecoration(this.displayRange, {});
		});
		this.disposable(model.onDidChangeContent(() => {
			this.displayRange = model.getDecorationRange(rangeDecorationId);
		}));

		const remoteURI = git.getRemoteRepo();
		const file = instantiationService.invokeFunction(getPathRelativeToResource, model.uri);
		const revision = git.getLastPushedRevision();
		const branch = git.getBranch();
		const codeSnippet = TPromise.join<any>([
			remoteURI,
			file,
			revision,
		])
			.then(([repo, file, revision]) => instantiationService.invokeFunction(resolveContent, git, { repo, file }, revision))
			.then(content => {
				if (model.isDisposed()) {
					throw new Error(localize('modelDisposedError', "Unable to create comment on editor that no longer exists."));
				}
				const originalModel = TextModel.createFromString(content.content);
				const originalLines = originalModel.getLinesContent(); // current git directory state
				const modifiedLines = model.getLinesContent(); // current editor state

				let lines: GQL.IThreadLines;
				if (this.shareContext) {
					// Determine context lines.
					//
					// Note that we capture the first character (0) of the start
					// line up until the last character of the last line + 1. This
					// means we capture all lines that the user selection
					// intersects.
					const contextLines = 3;
					const linesBeforeRange = new Range(
						this.displayRange.startLineNumber - contextLines,
						0, // start character
						this.displayRange.startLineNumber - 1,
						model.getLineMaxColumn(this.displayRange.startLineNumber - 1), // end character / end of line
					);
					const linesRange = new Range(
						this.displayRange.startLineNumber,
						0, // start character
						this.displayRange.endLineNumber,
						model.getLineMaxColumn(this.displayRange.endLineNumber), // end character / end of line
					);
					const linesAfterRange = new Range(
						this.displayRange.endLineNumber + 1,
						0, // start character
						this.displayRange.endLineNumber + contextLines,
						model.getLineMaxColumn(this.displayRange.endLineNumber + contextLines), // end character / end of line
					);

					// For example of what these represent, consider:
					//
					// 	const originalUserSelection = lines.text.slice(
					// 		lines.textSelectionRangeStart,
					// 		lines.textSelectionRangeStart+lines.textSelectionRangeLength
					// 	)
					//
					// Or consult GQL.IThreadLines documentation.
					const textSelectionRangeStart = this.displayRange.startColumn - 1;
					const textSelectionRangeLength = model.getValueLengthInRange(this.displayRange);

					lines = {
						__typename: 'ThreadLines', // satisfy the GQL.IThreadLines interface
						textBefore: editor.getTextForRanges([linesBeforeRange]),
						text: editor.getTextForRanges([linesRange]),
						textAfter: editor.getTextForRanges([linesAfterRange]),
						htmlBefore: this.removeOuterDiv(editor.getHTMLForRanges([linesBeforeRange])),
						html: this.removeOuterDiv(editor.getHTMLForRanges([linesRange])),
						htmlAfter: this.removeOuterDiv(editor.getHTMLForRanges([linesAfterRange])),
						textSelectionRangeStart,
						textSelectionRangeLength,
					};
				}

				// Compute reverse diff.
				const diff = new Diff(modifiedLines, originalLines);
				const range = diff.transformRange(this.displayRange);
				if (!range) {
					// Dirty / modified / unpushed code.
					const rangeLength = model.getValueLengthInRange(this.displayRange);
					return {
						dirty: true,
						range: this.displayRange,
						rangeLength,
						lines
					};
				}
				const rangeLength = originalModel.getValueLengthInRange(range);
				return {
					dirty: false,
					range,
					rangeLength,
					lines
				};
			});

		this.submitData = this.join([remoteURI, file, revision, codeSnippet, branch])
			.then(([remoteURI, file, revision, codeSnippet, branch]) => {
				if (codeSnippet.dirty) {
					revision = ''; // empty string implies dirty / modified / unpushed code
				}
				return {
					remoteURI,
					file,
					branch,
					revision,
					startLine: codeSnippet.range.startLineNumber,
					endLine: codeSnippet.range.endLineNumber,
					startCharacter: codeSnippet.range.startColumn,
					endCharacter: codeSnippet.range.endColumn,
					rangeLength: codeSnippet.rangeLength,
					lines: codeSnippet.lines,
				};
			})
			.then(undefined, err => {
				const errors = coalesce(Array.isArray(err) ? err : [err]);
				const error = errors[0];
				messageService.show(Severity.Error, error.message);
				this.dispose();
				throw error;
			});
	}

	private onDidUpdateConfiguration() {
		const config = this.configurationService.getConfiguration<IRemoteConfiguration>();
		this.shareContext = config.remote.shareContext;
	}

	/**
	 * removeOuterDiv removes the out <div> wrapping all of the lines.
	 */
	private removeOuterDiv(html: string): string {
		const tmp = document.createElement('div');
		tmp.innerHTML = html;
		const divs = tmp.firstElementChild.children;

		// The `html` input string has newlines after each div, which we rely
		// on / want to retain for easy line splitting later, but
		// divs.outerHTML doesn't keep those so add them back now.
		var result = '';
		for (var i = 0; i < divs.length; i++) {
			const last = i === divs.length - 1;
			result += divs[i].outerHTML + (last ? '' : '\n');
		}
		return result;
	}

	private join<T1, T2, T3, T4, T5>(promises: [PromiseLike<T1>, PromiseLike<T2>, PromiseLike<T3>, PromiseLike<T4>, PromiseLike<T5>]): TPromise<[T1, T2, T3, T4, T5]> {
		return TPromise.join<any>(promises) as TPromise<[T1, T2, T3, T4, T5]>;
	}

	private submittingPromise: TPromise<IThreadComments> | undefined;

	public get submitting(): boolean {
		return !!this.submittingPromise;
	}

	public submit(allowNoComment?: boolean): TPromise<IThreadComments> {
		if (this.submittingPromise) {
			return this.submittingPromise;
		}
		const contents = this.content;
		if (!allowNoComment && !contents.length) {
			return TPromise.wrapError(new Error(localize('emptyCommentError', "Comment can not be empty.")));
		}
		const clearSubmittingPromise = () => {
			this.submittingPromise = undefined;
			this.didChangeSubmitting.fire();
		};
		const promise = this.submitData
			.then(data => {
				return requestGraphQLMutation<{ createThread: GQL.IThread }>(this.remoteService, `mutation CreateThread {
					createThread(
						orgID: $orgId,
						remoteURI: $remoteURI,
						file: $file,
						branch: $branch,
						revision: $revision,
						startLine: $startLine,
						endLine: $endLine,
						startCharacter: $startCharacter,
						endCharacter: $endCharacter,
						rangeLength: $rangeLength,
						contents: $contents,
						lines: $lines,
					) {
						${threadGraphql}
					}
				}`, {
						...data,
						orgId: this.authService.currentUser.currentOrgMember.org.id,
						contents,
					});
			})
			.then(response => {
				const threadMemento = gqlThreadToMemento(response.createThread);
				const thread = this.instantiationService.createInstance(ThreadComments, this.commentsService, this.git, threadMemento);
				this.commentsService.didCreateThread.fire(threadMemento);
				this.didSubmit.fire(thread);
				return thread;
			});
		this.submittingPromise = promise;
		this.didChangeSubmitting.fire();
		promise.done(clearSubmittingPromise, clearSubmittingPromise);
		return promise;
	};

	/**
	 * Returns the range that the new comment should be attached to.
	 * It guarantees the returned range is not empty.
	 */
	private getNonEmptySelection(editor: ICommonCodeEditor): Range {
		let selection: Range = editor.getSelection();
		if (selection.isEmpty()) {
			// The user has not selected any text (just a cursor on a line).
			// Select the entire line.
			const line = selection.startLineNumber;
			selection = new Range(line, 1, line + 1, 1);
		}

		if (selection.endColumn === 1) {
			// A range that selects an entire line (either from the logic above, or
			// because the user tripple clicked in a location) will have an end position
			// at the first column of the next line (e.g. [4, 1] => [5, 1]).
			// Convert the range to be a single line (e.g. [4, 1] => [4, 10])
			// because that is more natural and we don't care about including the newline
			// character in the comment range.
			const line = selection.endLineNumber - 1;
			const endColumn = editor.getModel().getLineMaxColumn(line);
			const trimmedSelection = selection.setEndPosition(selection.endLineNumber - 1, endColumn);
			// Only use the trimmedSelection if it isn't empty.
			// If the trimmed selection is empty it means that the user
			// commented on a newline character, which is fine, so we keep
			// their original range.
			if (!trimmedSelection.isEmpty()) {
				selection = trimmedSelection;
			}
		}
		return selection;
	}
}

// TODO(nick): this doesn't need to return a promise
function getPathRelativeToResource(accessor: ServicesAccessor, resource: URI): TPromise<string | undefined> {
	const repository = accessor.get(ISCMService).getRepositoryForResource(resource);
	if (!repository) {
		return TPromise.wrapError(new Error(`no repository in context ${resource.toString()}`));
	}
	if (!repository.provider.rootUri) {
		return TPromise.wrapError(new Error(`provider for context ${resource.toString()} has no root folder`));
	}
	const root = endsWithSlash(repository.provider.rootUri.path);
	if (!startsWith(resource.path, root)) {
		return TPromise.wrapError(new Error(`file ${resource.path} not in root ${root}`));
	}
	return TPromise.wrap(resource.path.substr(root.length) || undefined);
}

function endsWithSlash(s: string): string {
	if (s.charAt(s.length - 1) === '/') {
		return s;
	}
	return s + '/';
}

function resolveContent(accessor: ServicesAccessor, git: Git, documentId: DocumentId, revision: string): TPromise<{ revision: string, content: string }> {
	// TODO(nick): better way to resolve content that leverages local workspaces.
	return git.getContentsAtRevision(documentId.file, revision).then(content => ({ revision, content }));
}
