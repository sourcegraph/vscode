/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { Model } from './model';
import * as path from 'path';
import { Discussion, MessageFromWebView, MessageFromExtension, DiscussionComment, SubmitCommentErrorMessage } from './interfaces';
import { pickPullRequest } from './pullRequests';
import { mutateGraphQL } from './util';
import { pullRequestReviewFieldsFragment, commentFieldsFragment } from './graphql';

const localize = nls.loadMessageBundle();

const discussionHtml = `
<!DOCTYPE html>
<html>
	<head>
		<meta charset="utf-8" />
		<link rel="stylesheet" type="text/css" href="${path.join(__dirname, '..', 'resources', 'discussion.css')}" />
	</head>
	<body>
		<script>
		// This is a hack that allows us to import interfaces in discussion.ts.
		// TODO(nick): remove this hack once we do proper bundling.
		exports = {};
		</script>
		<script src="${path.join(__dirname, 'discussion.js')}"></script>
	</body>
</html>
`;

export class DraftLineCommentManager {
	private disposables: vscode.Disposable[] = [];

	private canComposeLineComment = false;

	constructor(private model: Model, private outputChannel: vscode.OutputChannel) {
		this.disposables.push(vscode.window.onDidChangeTextEditorSelection(e => this.updateCanComposeLineComment()));
		this.disposables.push(vscode.commands.registerTextEditorCommand('github.pullRequests.composeLineComment', async e => {
			try {
				await this.composeLineComment(e);
			} catch (e) {
				this.outputChannel.appendLine(e.message);
				vscode.window.showErrorMessage(e.message);
			}
		}));
		this.updateCanComposeLineComment();
		// TODO(nick): listen for repository updates
	}

	private updateCanComposeLineComment(): void {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		const prs = this.getPullRequestsForResource(vscode.window.activeTextEditor.document.uri);

		// The line comment command is enabled as long as there is at least one PR associated
		// with repository of the active file. This doesn't guarantee that it is actually possible
		// to make a PR comment because you need to be on a line in a file that is actually in a PR.
		// TODO(nick): is it easy/cheap to do this every time selection changes?
		const canComposeLineComment = prs.length > 0;
		if (this.canComposeLineComment !== canComposeLineComment) {
			this.canComposeLineComment = canComposeLineComment;
			this.outputChannel.appendLine(`githubCanComposeLineComment = ${canComposeLineComment}`);
			vscode.commands.executeCommand('setContext', 'githubCanComposeLineComment', canComposeLineComment);
		}
	}

	private getPullRequestsForResource(resource: vscode.Uri): GitHubGQL.IPullRequest[] {
		const repository = this.model.getRepositoryForResource(resource);
		const prs = repository && repository.state.pullRequests && repository.state.pullRequests || [];
		return prs.filter(pr => !pr.isCrossRepository);
	}

	private async composeLineComment(textEditor: vscode.TextEditor): Promise<void> {
		const file = textEditor.document.uri;
		const repository = this.model.getRepositoryForResource(file);
		if (!repository) {
			vscode.window.showErrorMessage(localize('noRepository', "No repository for {0}", file.toString()));
			return;
		}
		const prs = this.getPullRequestsForResource(file);
		if (!prs.length) {
			vscode.window.showErrorMessage(localize('noActivePullRequest', "No active pull request for {0}", file.toString()));
			return;
		}
		const pr = await pickPullRequest(prs);
		if (!pr) {
			return;
		}
		if (!pr.baseRef) {
			vscode.window.showErrorMessage(localize('noBaseRef', "No base ref for PR {0}", pr.number));
			return;
		}
		if (!pr.headRef) {
			vscode.window.showErrorMessage(localize('noHeadRef', "No head ref for PR {0}", pr.number));
			return;
		}

		// We want to convert the line in the current editor state to a line at the head
		// commit in the PR. Unfortunately we can not do this in a single git blame command
		// (we can't specify --contents and a revision at the same time), so we need two steps.

		// Step 1: Convert the line number in the current editor state to a line number in a known revision.
		const line = textEditor.selection.active.line + 1;
		const lineStdout = await repository.execGit([
			'blame', '-p',
			'-L', `${line},${line}`,
			'--contents', '-',
			'--', file.fsPath
		], textEditor.document.getText());
		const lineBlame = parseGitBlameLinePorcelain(lineStdout);
		const lineNotInPR = localize('lineNotInPR', "Line {0} is not in PR #{1}", line, pr.number);
		if (lineBlame.commitId === '0000000000000000000000000000000000000000') {
			this.outputChannel.appendLine('Line not in PR (uncommitted)');
			vscode.window.showErrorMessage(lineNotInPR);
			return;
		}

		let headBlame: GitBlameLine;
		if (lineBlame.commitId === pr.headRef.target.oid) {
			headBlame = lineBlame;
		} else {
			// Step 2: Convert the line number in the known revision to a line number at the PR's head commit.
			// This just makes it less likely that the comment will be immediately outdated.
			const headStdout = await repository.execGit([
				'blame', '-p',
				'-L', `${lineBlame.originalLine},${lineBlame.originalLine}`,
				'--reverse', `${lineBlame.commitId}..${pr.headRef.target.oid}`,
				'--', lineBlame.filename,
			]);
			headBlame = parseGitBlameLinePorcelain(headStdout);
			if (headBlame.commitId !== pr.headRef.target.oid) {
				this.outputChannel.appendLine('Line not in PR\'s latest commit');
				vscode.window.showErrorMessage(lineNotInPR);
				return;
			}
		}

		// Now we need to find the position in the diff to send to GitHub.
		// We don't pre-filter the diffs output in case the file was involved in a rename.
		const prDiff = await repository.execGit(['diff', pr.baseRef.target.oid, pr.headRef.target.oid]);
		const fileDiffLines = diffLinesForFile(prDiff, headBlame.filename);
		if (!fileDiffLines) {
			vscode.window.showErrorMessage(localize('fileNotInPR', "{0} is not in PR #{1}", headBlame.filename, pr.number));
			return;
		}

		const position = positionInDiff(fileDiffLines, parseInt(headBlame.originalLine));
		if (!position) {
			this.outputChannel.appendLine('Line not in PR diff');
			vscode.window.showErrorMessage(lineNotInPR);
			return;
		}

		// // Stub data
		// const comments: DiscussionComment[] = [
		// 	{
		// 		contents: 'first',
		// 		createdAt: new Date(),
		// 		author: {
		// 			name: 'Nick',
		// 			email: 'nick@sourcegraph.com',
		// 		}
		// 	},
		// 	{
		// 		contents: 'second',
		// 		createdAt: new Date(),
		// 		author: {
		// 			name: 'Nick 2',
		// 			email: 'nick2@sourcegraph.com',
		// 		}
		// 	}
		// ];

		// const discussion: Discussion = {
		// 	id: '1',
		// 	comments,
		// };
		const draftDiscussion: DraftDiscussion = {
			isDraftDiscussion: true,
			pullRequestId: pr.id,
			commitOID: headBlame.commitId,
			path: headBlame.filename,
			position,
		};

		const discussionViewZone = new DiscussionViewZone(pr, draftDiscussion, this.outputChannel, textEditor);
		this.disposables.push(discussionViewZone);
		discussionViewZone.onDidClose(() => {
			const idx = this.disposables.indexOf(discussionViewZone);
			if (idx >= 0) {
				this.disposables.splice(idx, 1);
			}
		}, undefined, this.disposables);
	}

	public dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
	}
}


interface DraftDiscussion {
	isDraftDiscussion: true;

	pullRequestId: string;

	commitOID: string;

	path: string;
	position: number;
}

class DiscussionViewZone implements vscode.Disposable {
	private viewZone: vscode.TextEditorViewZone;
	private disposables: vscode.Disposable[] = [];

	constructor(
		private pr: GitHubGQL.IPullRequest,
		private state: Discussion | DraftDiscussion,
		private outputChannel: vscode.OutputChannel,
		editor: vscode.TextEditor,
	) {
		this.viewZone = editor.createViewZone('discussion', {
			type: 'html',
			value: discussionHtml,
		});
		this.updateHeader();

		this.viewZone.onMessage(this.handleMessage, this, this.disposables);
		this.viewZone.show(editor.selection.active);

		const discussion = !isDraftDiscussion(state) && state || undefined;
		this.postMessage({
			type: 'renderDiscussion',
			discussion,
		});
	}

	private updateHeader() {
		this.viewZone.header = {
			primaryHeading: isDraftDiscussion(this.state) ? 'New Discussion' : 'Discussion',
			secondaryHeading: `on PR #${this.pr.number}`,
		};
	}

	public postMessage(message: MessageFromExtension): void {
		this.viewZone.postMessage(JSON.stringify(message));
	}

	public get onDidClose(): vscode.Event<void> {
		return this.viewZone.onDidClose;
	}

	private handleMessage(json: string): void {
		this.outputChannel.appendLine(`handleMessage ${json}`);
		const message = JSON.parse(json) as MessageFromWebView;
		switch (message.type) {
			case 'submitComment':
				if (isDraftDiscussion(this.state)) {
					this.handleSubmitDraftDiscussion(this.state, message.body);
				} else {
					this.handleSubmitReplyToDiscussion(this.state, message.body);
				}
				break;
		}
	}

	private async handleSubmitReplyToDiscussion(discussion: Discussion, body: string) {
		try {
			// Replying to an exiting comment requires 3 mutations in GitHub's graphql API.

			// 1. Create a pending review.
			const reviewInput: GitHubGQL.IAddPullRequestReviewInput = {
				pullRequestId: this.pr.id,
			};
			const review = await this.mutateGraphQL(`mutation CreatePendingReview($reviewInput: AddPullRequestReviewInput!) {
				addPullRequestReview(input: $reviewInput) {
					pullRequestReview {
						id
					}
				}
			}`, { reviewInput });
			if (!review.addPullRequestReview) {
				throw new Error('addPullRequestReview missing from CreatePendingReview response');
			}

			// 2. Add a comment to the pending review.
			const pullRequestReviewId = review.addPullRequestReview.pullRequestReview.id;
			const inReplyTo = discussion.comments[0].id;
			const replyInput: GitHubGQL.IAddPullRequestReviewCommentInput = {
				pullRequestReviewId,
				inReplyTo,
				body,
			};
			const reply = await this.mutateGraphQL(`mutation ReplyToReviewComment($replyInput: AddPullRequestReviewCommentInput!) {
				addPullRequestReviewComment(input: $replyInput) {
					comment {
						...CommentFields
					}
				}
			}
			${commentFieldsFragment}`, { replyInput });
			if (!reply.addPullRequestReviewComment) {
				throw new Error('addPullRequestReviewComment missing from ReplyToReviewComment response');
			}
			const comment = toComment(reply.addPullRequestReviewComment.comment);

			// 3. Submit the pending review.
			const submitInput: GitHubGQL.ISubmitPullRequestReviewInput = {
				pullRequestReviewId,
				event: 'COMMENT',
			};
			await this.mutateGraphQL(`mutation SubmitReview($submitInput: SubmitPullRequestReviewInput!) {
				submitPullRequestReview(input: $submitInput) {
					clientMutationId
				}
			}`, { submitInput });

			// Update the UI.
			discussion.comments.push(comment);
			this.updateHeader();
			this.postMessage({
				type: 'submitCommentSuccess',
				discussion
			});
		} catch (e) {
			vscode.window.showErrorMessage(e.message);
			this.postMessage({ type: 'submitCommentError', message: e.message });
		}
	}

	private async handleSubmitDraftDiscussion(draftDiscussion: DraftDiscussion, contents: string): Promise<void> {
		this.outputChannel.appendLine(`handleSubmitDraftDiscussion ${contents}`);
		try {
			const input: GitHubGQL.IAddPullRequestReviewInput = {
				pullRequestId: draftDiscussion.pullRequestId,
				commitOID: draftDiscussion.commitOID,
				event: 'COMMENT',
				comments: [
					{
						path: draftDiscussion.path,
						position: draftDiscussion.position,
						body: contents,
					}
				]
			};

			const data = await this.mutateGraphQL(`mutation CreateLineComment($input: AddPullRequestReviewInput!) {
					addPullRequestReview(input: $input) {
						pullRequestReview {
							...PullRequestReviewFields
						}
					}
				}
				${commentFieldsFragment}
				${pullRequestReviewFieldsFragment}
				`, { input });
			if (!data.addPullRequestReview) {
				throw new Error('addPullRequestReview missing from CreateLineComment response');
			}
			const prReview = data.addPullRequestReview.pullRequestReview;
			const comments = prReview.comments.nodes || [];
			const comment = toComment(comments[0]);

			const discussion: Discussion = {
				comments: [comment],
			};
			this.state = discussion;
			this.updateHeader();
			this.postMessage({
				type: 'submitCommentSuccess',
				discussion
			});
		} catch (e) {
			vscode.window.showErrorMessage(e.message);
			this.postMessage(<SubmitCommentErrorMessage>{ type: 'submitCommentError', message: e.message });
		}
	}

	private async mutateGraphQL(query: string, variables: { [name: string]: any }): Promise<GitHubGQL.IMutation> {
		const nameMatch = /mutation\s+([^({\s]+)/.exec(query);
		const name = nameMatch && nameMatch[1];
		const response = await mutateGraphQL(query, variables);
		if (response.errors && response.errors.length > 0) {
			for (const error of response.errors) {
				this.outputChannel.appendLine(error.message);
			}
			throw new Error(response.errors[0].message);
		}
		if (!response.data) {
			throw new Error(`mutation response was empty: ${name}`);
		}
		return response.data;
	}

	public dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this.disposables = [];
		this.viewZone.dispose();
	}
}

function toComment(comment: GitHubGQL.IPullRequestReviewComment): DiscussionComment {
	const login = comment.author && comment.author.login || localize('unknownAuthorName', "unknown");
	return {
		id: comment.id,
		contents: comment.body,
		createdAt: comment.createdAt,
		author: {
			login
		}
	};
}

function isDraftDiscussion(object: any): object is DraftDiscussion {
	return object && object.isDraftDiscussion;
}

/**
 * Blame information for a single line.
 */
interface GitBlameLine {
	/**
	 * The commit the line blames to.
	 */
	commitId: string;

	/**
	 * The line number at the blamed commit.
	 */
	originalLine: string;

	/**
	 * The filename at the blamed commit.
	 * This will be different than the current name of the file
	 * if the file was renamed.
	 */
	filename: string;
}

/**
 * Parses the procelain output for git blame on a single line.
 */
function parseGitBlameLinePorcelain(stdout: string): GitBlameLine {
	const lines = stdout.split(/\r?\n/);
	const [commitId, originalLine] = lines[0].split(' ', 2);

	const data = new Map<string, string>();
	for (const line of lines.slice(1)) {
		if (line[0] === '\t') {
			break;
		}
		const [key, value] = line.split(/ (.*)/, 2);
		if (key) {
			data.set(key, value);
		}
	}
	const filename = data.get('filename');
	if (!filename) {
		throw new Error('git blame porcelain did not contain filename');
	}
	return { commitId, originalLine, filename };
}

/**
 * Returns the lines in diff that are associated with the file,
 * or undefined if the file is not in the diff.
 */
function diffLinesForFile(diff: string, file: string): string[] | undefined {
	const lines = diff.split(/\r?\n/);
	let startIdx = -1;
	const header = /^diff --git a\/(.+) b\/(.+)$/;
	for (const [idx, line] of lines.entries()) {
		const match = header.exec(line);
		if (!match) {
			continue;
		}
		if (startIdx >= 0) {
			// This is the end of the diff for the requested file.
			return lines.slice(startIdx, idx);
		}
		if (match[1] === file || match[2] === file) {
			// This is the beginning of the diff for the requested file.
			startIdx = idx;
		}
	}
	// Handle the case where the desired file diff was the last one.
	if (startIdx >= 0) {
		return lines.slice(startIdx, lines.length);
	}
	return undefined;
}

/**
 * Returns the position in the diff (as defined by GitHub) for the given line number.
 * If the line number is not in the diff, it returns undefined.
 */
function positionInDiff(diffLines: string[], line: number): number | undefined {
	let header = true;

	// The current line number (1-indexed) on the "right" hand side of the diff.
	let afterLine = 0;

	// The current position in the diff, as defined by GitHub.
	// https://developer.github.com/v3/pulls/comments/#create-a-comment
	let position = 0;
	for (const diffLine of diffLines) {
		if (diffLine.startsWith('@@')) {
			const afterHunkRegex = /\+([0-9]+)(?:,([0-9]+))?/;
			const afterHunk = afterHunkRegex.exec(diffLine);
			if (!afterHunk) {
				throw new Error(`invalid hunk ${diffLine}`);
			}
			const start = parseInt(afterHunk[1]);
			const count = afterHunk[2] ? parseInt(afterHunk[2]) : 1;

			// Update afterLine and position for the next iteration.
			afterLine = count > 0 ? start : start + 1;
			position++;
			header = false;
			continue;
		}
		if (header) {
			// Skip past everything until the first hunk.
			continue;
		}
		if (afterLine === line) {
			// Found it.
			return position;
		}
		if (afterLine > line) {
			// Line doesn't exist in the diff.
			return undefined;
		}

		// Update position and afterLine for next iteration.
		position++;
		switch (diffLine[0]) {
			case '+':
				afterLine += 1;
				break;
			case '-':
				break;
			case ' ':
				afterLine += 1;
				break;
			case '\\':
				// "\ No newline at end of file."
				break;
			default:
				const err: any = new Error(`invalid diff line: ${diffLine}`);
				err.diff = diffLines.join('\n');
				throw err;
		}
	}
	return undefined;
}