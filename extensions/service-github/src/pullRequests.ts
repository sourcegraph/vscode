/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';

/**
 * Prompts the user to select one of the pull requests.
 */
export async function pickPullRequest(pullRequests: GitHubGQL.IPullRequest[]): Promise<GitHubGQL.IPullRequest | undefined> {
	if (pullRequests.length === 0) {
		return undefined;
	}
	if (pullRequests.length === 1) {
		return pullRequests[0];
	}
	const choice = await vscode.window.showQuickPick(pullRequests
		.filter(pullRequest => !!pullRequest.headRef) // The head repo can be deleted for a PR
		.map(pullRequest => ({
			label: `$(git-pull-request) ${pullRequest.title}`,
			description: `#${pullRequest.number}`,
			detail: `${pullRequest.headRef && pullRequest.headRef.name} — @${pullRequest.author && pullRequest.author.login}`,
			pullRequest,
		}))
	);
	return choice && choice.pullRequest;
}