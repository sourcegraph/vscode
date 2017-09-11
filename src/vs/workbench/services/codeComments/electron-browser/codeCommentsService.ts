/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { ICodeCommentsService, IFileComments, IThreadComments, IComment, IDraftThreadComments } from 'vs/editor/common/services/codeCommentsService';
import { Range } from 'vs/editor/common/core/range';
import Event, { Emitter, any } from 'vs/base/common/event';
import { VSDiff as Diff } from 'vs/workbench/services/codeComments/common/vsdiff';
import { Disposable } from 'vs/workbench/services/codeComments/common/disposable';
import { ISCMService, ISCMRepository } from 'vs/workbench/services/scm/common/scm';
import { Git } from 'vs/workbench/services/codeComments/browser/git';
import URI from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { startsWith } from 'vs/base/common/strings';
import { IRemoteService, requestGraphQL, requestGraphQLMutation } from 'vs/platform/remote/node/remote';
import { TPromise } from 'vs/base/common/winjs.base';
import { first, uniqueFilter } from 'vs/base/common/arrays';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ICommonCodeEditor, IModel } from 'vs/editor/common/editorCommon';
import { RawTextSource } from 'vs/editor/common/model/textSource';
import { dispose } from 'vs/base/common/lifecycle';
import { StrictResourceMap } from 'vs/base/common/map';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
export { Event }

/**
 * Don't fetch threads from network more often than this.
 */
const REFETCH_DELAY_MS = 2000;

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
	authorName
	authorEmail
}`;

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
archivedAt
${commentsGraphql}`;


export class CodeCommentsService implements ICodeCommentsService {
	public _serviceBrand: any;

	/**
	 * Map of file uri -> model.
	 */
	private models = new StrictResourceMap<FileComments>();

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
	) { }

	/**
	 * See documentation on ICodeCommentsService.
	 */
	public getFileComments(file: URI): FileComments {
		let model = this.models.get(file);
		if (!model) {
			model = this.instantiationService.createInstance(FileComments, file);
			this.models.set(file, model);
		}
		return model;
	}
}

/**
 * Model for comments on a file.
 */
export class FileComments extends Disposable implements IFileComments {
	private model: IModel;

	private _threads: ThreadComments[] = [];
	private didChangeThreads = this.disposable(new Emitter<void>());
	public readonly onDidChangeThreads = this.didChangeThreads.event;
	public get threads(): ThreadComments[] {
		return this._threads;
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

	constructor(
		private fileUri: URI,
		@IModelService modelService: IModelService,
		@ISCMService scmService: ISCMService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IRemoteService private remoteService: IRemoteService,
	) {
		super();
		this.git = instantiationService.createInstance(Git, fileUri);
		this.model = modelService.getModel(this.fileUri);
		this.disposable(this.model.onDidChangeContent(() => {
			this.updateDisplayRanges();
		}));

		this.disposable(any(
			scmService.onDidAddRepository,
			scmService.onDidRemoveRepository,
			scmService.onDidChangeRepository
		)(() => {
			const scmRepository = scmService.getRepositoryForResource(this.fileUri);
			if (this.scmRepository !== scmRepository) {
				this.scmRepository = scmRepository;
				if (scmRepository) {
					this.refreshThreads();
				}
			}
		}));

		// TODO(Dan): temporary: set user name from git settings for comments and telemetry
		this.git.getUserName();
	}

	public dispose() {
		this._threads = dispose(this._threads);
		this._draftThreads = dispose(this._draftThreads);
		super.dispose();
	}

	/**
	 * See documentation on IFileComments.
	 */
	public createDraftThread(editor: ICommonCodeEditor): DraftThreadComments {
		const model = editor.getModel();
		if (model.uri.toString() !== this.model.uri.toString()) {
			throw new Error(`mismatch models: ${model.uri}, ${this.model.uri}`);
		}
		const draft = this.instantiationService.createInstance(DraftThreadComments, editor, this.git);
		draft.onDidSubmit(thread => {
			draft.dispose();
			// Although we are updating this._threads here, we don't fire
			// threadsDidChange until the display ranges have updated.
			this._threads.unshift(thread);
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

	private refreshingThreads: TPromise<void> | undefined;
	public get refreshing(): TPromise<void> {
		return this.refreshingThreads || TPromise.wrap<void>(undefined);
	}

	/**
	 * See documentation on IFileComments.
	 */
	public refreshThreads(): TPromise<void> {
		if (this.refreshingThreads) {
			return this.refreshingThreads;
		}

		interface ThreadsResponse {
			threads: GQL.IThread[];
		}

		const refreshingThreads = TPromise.join([
			this.getDocumentId(),
			this.git.getAccessToken(),
		])
			.then<ThreadsResponse>(([documentId, accessToken]) => {
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
				const oldThreads = this._threads.reduce((threads, thread) => {
					threads.set(thread.id, thread);
					return threads;
				}, new Map<number, ThreadComments>());

				// Although we are updating this._threads here, we don't fire
				// threadsDidChange until the display ranges have updated.
				this._threads = data.threads
					.map(thread => {
						const oldThread = oldThreads.get(thread.id);
						if (oldThread) {
							// Reuse the existing thread so we save client state like draft replies and event listeners.
							oldThread.comments = thread.comments.map(c => new Comment(c));
							return oldThread;
						}
						return this.instantiationService.createInstance(ThreadComments, thread, this.git);
					})
					.sort((left: ThreadComments, right: ThreadComments) => {
						// Most recent comment timestamp descending.
						return right.mostRecentComment.createdAt.getTime() - left.mostRecentComment.createdAt.getTime();
					});
				this.updateDisplayRanges();
			});

		this.refreshingThreads = refreshingThreads;
		this.refreshingThreads.done(() => {
			setTimeout(() => {
				this.refreshingThreads = undefined;
			}, REFETCH_DELAY_MS);
		}, err => {
			this.refreshingThreads = undefined;
		});
		return refreshingThreads;
	}

	/**
	 * Returns a canonical identifier for the local file path, or undefined for resources
	 * that don't support code comments.
	 *
	 * For example:
	 * file:///Users/nick/dev/xsourcegraph/README.md -> github.com/sourcegraph/xsourcegraph/README.md
	 */
	private getDocumentId(): TPromise<DocumentId | undefined> {
		if (this.fileUri.scheme !== Schemas.file) {
			return TPromise.as(void 0);
		}
		return TPromise.join([
			this.instantiationService.invokeFunction(getPathRelativeToRepo, this.fileUri),
			this.git.getRemoteRepo(),
		]).then(([relativeFile, repo]) => {
			return { repo, file: relativeFile };
		});
	}

	/**
	 * True if the file content has changed while display ranges are being computed.
	 * This signals updateDisplayRanges to exit quickly and restart.
	 */
	private needsUpdateDisplayRanges = false;

	/**
	 * A promise that is set when display ranges are being updated
	 * and resolves when display ranges are done updating.
	 */
	private updatingDisplayRanges: TPromise<void> | undefined;

	private updateDisplayRanges(): TPromise<void> {
		this.needsUpdateDisplayRanges = true;
		if (this.updatingDisplayRanges) {
			return this.updatingDisplayRanges;
		}

		this.needsUpdateDisplayRanges = false;
		const updatingDisplayRanges = this.getDocumentId()
			.then(documentId => TPromise.join(
				this.threads
					.filter(uniqueFilter(thread => thread.revision))
					.map(thread => this.instantiationService.invokeFunction(resolveContent, this.git, documentId, thread.revision))
			))
			.then(revContents => {
				if (this.needsUpdateDisplayRanges) {
					this.updatingDisplayRanges = undefined;
					return this.updateDisplayRanges();
				}
				const diffs = revContents.reduce((diffs, revContent) => {
					const originalLines = RawTextSource.fromString(revContent.content).lines;
					const modifiedLines = this.model.getLinesContent();
					diffs.set(revContent.revision, new Diff(originalLines, modifiedLines));
					return diffs;
				}, new Map<string, Diff>());

				for (const thread of this.threads) {
					const diff = diffs.get(thread.revision);
					if (diff) {
						thread.displayRange = diff.transformRange(thread.range);
					}
				}
				this.didChangeThreads.fire();
				return TPromise.wrap<void>(undefined);
			});
		this.updatingDisplayRanges = updatingDisplayRanges;
		updatingDisplayRanges.done(() => {
			this.updatingDisplayRanges = undefined;
		}, error => {
			this.updatingDisplayRanges = undefined;
		});
		return updatingDisplayRanges;
	}
}

export class ThreadComments extends Disposable implements IThreadComments {
	public readonly id: number;
	public readonly file: string;
	public readonly revision: string;
	public readonly range: Range;
	public readonly createdAt: Date;

	private _pendingOperation = false;
	private didChangePendingOperation = this.disposable(new Emitter<void>());
	public readonly onDidChangePendingOperation = this.didChangePendingOperation.event;
	public get pendingOperation() { return this._pendingOperation; }
	public set pendingOperation(pendingOperation: boolean) {
		if (this._pendingOperation !== pendingOperation) {
			this._pendingOperation = pendingOperation;
			this.didChangePendingOperation.fire();
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
		}
	}

	private _comments: Comment[];
	private didChangeComments = this.disposable(new Emitter<void>());
	public readonly onDidChangeComments = this.didChangeComments.event;
	public get comments(): Comment[] { return this._comments; }
	public set comments(comments: Comment[]) {
		this._comments = comments;
		this.didChangeComments.fire();
	}

	private _draftReply = '';
	private didChangeDraftReply = this.disposable(new Emitter<void>());
	public readonly onDidChangeDraftReply = this.didChangeDraftReply.event;
	public get draftReply(): string { return this._draftReply; }
	public set draftReply(draftReply: string) {
		if (this._draftReply !== draftReply) {
			this._draftReply = draftReply;
			this.didChangeDraftReply.fire();
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
		}
	}

	public get mostRecentComment(): Comment {
		return this.comments[this.comments.length - 1];
	}

	constructor(
		thread: GQL.IThread,
		private git: Git,
		@IRemoteService private remoteService: IRemoteService,
		@IInstantiationService private instantiationService: IInstantiationService,
	) {
		super();
		const comments = thread.comments.map(comment => new Comment(comment));
		if (!comments.length) {
			throw new Error(`expected thread ${thread.id} to have at least one comment`);
		}
		this.id = thread.id;
		this.file = thread.file;
		this.revision = thread.revision;
		this.range = new Range(thread.startLine, thread.startCharacter, thread.endLine, thread.endCharacter);
		this.createdAt = new Date(thread.createdAt);
		this.archived = !!thread.archivedAt;
		this._comments = comments;
	}

	public setArchived(archived: boolean): TPromise<void> {
		return this.operation(() => TPromise.join([
			this.git.getRemoteRepo(),
			this.git.getAccessToken(),
		])
			.then(([remoteURI, accessToken]) => {
				return requestGraphQLMutation<{ updateThread: GQL.IThread }>(this.remoteService, `mutation SetArchived {
					updateThread(
						threadID: $threadID,
						remoteURI: $remoteURI,
						accessToken: $accessToken,
						archived: $archived,
					) {
						archivedAt
					}
				}`, {
						threadID: this.id,
						remoteURI,
						accessToken,
						archived,
					});
			})
			.then(response => {
				this.archived = !!response.updateThread.archivedAt;
			})
		);
	}

	public submitDraftReply(): TPromise<void> {
		return this.operation(() => TPromise.join<any>([
			this.git.getUserName(),
			this.git.getUserEmail(),
			this.git.getRemoteRepo(),
			this.git.getAccessToken(),
		])
			.then(([authorName, authorEmail, remoteURI, accessToken]) => {
				return requestGraphQLMutation<{ addCommentToThread: GQL.IThread }>(this.remoteService, `mutation SubmitDraftReply {
						addCommentToThread(
							threadID: $threadID,
							remoteURI: $remoteURI,
							accessToken: $accessToken,
							contents: $contents,
							authorName: $authorName,
							authorEmail: $authorEmail,
						) {
							${commentsGraphql}
						}
					}`, {
						threadID: this.id,
						remoteURI,
						accessToken,
						contents: this.draftReply,
						authorName,
						authorEmail,
					});
			})
			.then(response => {
				this.draftReply = '';
				this.comments = response.addCommentToThread.comments.map(c => new Comment(c));
			})
		);
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
	public get content(): string {
		return this._content;
	}
	public set content(content: string) {
		if (this._content !== content) {
			this._content = content;
			this.didChangeContent.fire();
		}
	}

	// TODO(nick): display range should continue to update if content changes
	// while comment is being written.
	private _displayRange: Range;
	public get displayRange(): Range {
		return this._displayRange;
	}
	public set displayRange(displayRange: Range) {
		if (this._displayRange !== displayRange) {
			this._displayRange = displayRange;
			this.didChangeDisplayRange.fire();
		}
	}

	private didChangeContent = this.disposable(new Emitter<void>());
	public readonly onDidChangeContent = this.didChangeContent.event;

	private didSubmit = this.disposable(new Emitter<ThreadComments>());
	public readonly onDidSubmit = this.didSubmit.event;

	private didChangeSubmitting = this.disposable(new Emitter<void>());
	public readonly onDidChangeSubmitting = this.didChangeSubmitting.event;

	private didChangeDisplayRange = this.disposable(new Emitter<void>());
	public readonly onDidChangeDisplayRange = this.didChangeDisplayRange.event;

	private submitData: TPromise<{
		remoteURI: string,
		accessToken: string,
		file: string,
		revision: string,
		startLine: number,
		endLine: number,
		startCharacter: number,
		endCharacter: number,
		authorName: string,
		authorEmail: string,
	}>;

	constructor(
		editor: ICommonCodeEditor,
		private git: Git,
		@IMessageService messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IRemoteService private remoteService: IRemoteService,
	) {
		super();

		this.ensureNonEmptySelection(editor);
		this.displayRange = editor.getSelection();

		const model = editor.getModel();
		const remoteURI = git.getRemoteRepo();
		const accessToken = git.getAccessToken();
		const file = instantiationService.invokeFunction(getPathRelativeToRepo, model.uri);
		const revision = git.getLastPushedRevision();
		const authorName = git.getUserName();
		const authorEmail = git.getUserEmail();
		const range = TPromise.join<any>([
			remoteURI,
			file,
			revision,
		])
			.then(([repo, file, revision]) => instantiationService.invokeFunction(resolveContent, git, { repo, file }, revision))
			.then(content => {
				const originalLines = RawTextSource.fromString(content.content).lines;
				const modifiedLines = model.getLinesContent();
				// Compute reverse diff.
				const diff = new Diff(modifiedLines, originalLines);
				this.displayRange = editor.getSelection();
				return diff.transformRange(this.displayRange);
			});

		this.submitData = this.join([remoteURI, accessToken, file, revision, authorName, authorEmail, range])
			.then(([remoteURI, accessToken, file, revision, authorName, authorEmail, range]) => {
				if (!range) {
					throw new Error(localize('emptyCommentRange', "Can not comment on code that has not been pushed."));
				}
				const startLine = range.startLineNumber;
				const endLine = range.endLineNumber;
				const startCharacter = range.startColumn;
				const endCharacter = range.endColumn;
				return { remoteURI, accessToken, file, revision, startLine, endLine, startCharacter, endCharacter, authorName, authorEmail };
			});
		// Handle the error separately so that
		// 1. The promise doesn't complain that it doesn't have an error handler.
		// 2. The promise that is returned by submit will still be failed with an error.
		this.submitData.done(undefined, err => {
			messageService.show(Severity.Error, err.toString());
		});
	}

	private join<T1, T2, T3, T4, T5, T6, T7>(promises: [PromiseLike<T1>, PromiseLike<T2>, PromiseLike<T3>, PromiseLike<T4>, PromiseLike<T5>, PromiseLike<T6>, PromiseLike<T7>]): TPromise<[T1, T2, T3, T4, T5, T6, T7]> {
		return TPromise.join<any>(promises) as TPromise<[T1, T2, T3, T4, T5, T6, T7]>;
	}

	private submittingPromise: TPromise<IThreadComments> | undefined;

	public get submitting(): boolean {
		return !!this.submittingPromise;
	}

	public submit(): TPromise<IThreadComments> {
		if (this.submittingPromise) {
			return this.submittingPromise;
		}
		const contents = this.content;
		if (!contents.length) {
			return TPromise.wrapError(new Error(localize('emptyCommentError', "Comment can not be empty.")));
		}
		const clearSubmittingPromise = () => {
			this.submittingPromise = undefined;
			this.didChangeSubmitting.fire();
		};
		const promise = this.submitData
			.then(data => {
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
				}`, { ...data, contents });
			})
			.then(response => {
				const thread = this.instantiationService.createInstance(ThreadComments, response.createThread, this.git);
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
	private ensureNonEmptySelection(editor: ICommonCodeEditor) {
		let selection: Range = editor.getSelection();
		if (selection.isEmpty()) {
			// The user has not selected any text (just a cursor on a line).
			// Select the entire line.
			const line = selection.startLineNumber;
			selection = new Range(line, 1, line + 1, 1);

			// Update editor selection to reflect the comment range.
			editor.setSelection(selection);
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
				editor.setSelection(selection);
			}
		}
	}
}

export class Comment implements IComment {
	public readonly id: number;
	public readonly contents: string;
	public readonly createdAt: Date;
	public readonly updatedAt: Date;
	public readonly authorName: string;
	public readonly authorEmail: string;

	constructor(comment: GQL.IComment) {
		this.id = comment.id;
		this.contents = comment.contents;
		this.createdAt = new Date(comment.createdAt);
		this.updatedAt = new Date(comment.updatedAt);
		this.authorName = comment.authorName;
		this.authorEmail = comment.authorEmail;
	}
}

function getPathRelativeToRepo(accessor: ServicesAccessor, file: URI): TPromise<string> {
	const repository = accessor.get(ISCMService).getRepositoryForResource(file);
	if (!repository) {
		return TPromise.wrapError(new Error(`no repository in context ${file.toString()}`));
	}
	if (!repository.provider.rootFolder) {
		return TPromise.wrapError(new Error(`provider for context ${file.toString()} has no root folder`));
	}
	const root = endsWithSlash(repository.provider.rootFolder.path);
	if (!startsWith(file.path, root)) {
		return TPromise.wrapError(new Error(`file ${file.path} not in root ${root}`));
	}
	return TPromise.wrap(file.path.substr(root.length));
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
