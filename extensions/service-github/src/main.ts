/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import { requestGraphQL } from './util';

const GITHUB_SCHEME = 'github';

export function activate(context: vscode.ExtensionContext): void {
	context.subscriptions.push(vscode.workspace.registerResourceResolutionProvider(GITHUB_SCHEME, {
		resolveResource(resource: vscode.Uri): Thenable<vscode.Uri> {
			return requestGraphQL(`
query($id: ID!) {
	node(id: $id) {
		... on Repository {
			nameWithOwner
		}
	}
}`,
				{ id: resource.path },
			).then(({ node }) => {
				return vscode.Uri.parse(`git+exp://github.com/${node.nameWithOwner}.git`);
			});
		},
	}));

	context.subscriptions.push(vscode.workspace.registerFolderSearchProvider('github', {
		search(query: string): Thenable<vscode.FolderResult[]> {
			let request: Thenable<any>;
			if (query) {
				request = requestGraphQL(`
query($query: String!) {
	search(type: REPOSITORY, query: $query, first: 30) {
		nodes {
			... on Repository {
				id
				name
				nameWithOwner
				isPrivate
				isFork
				isMirror
			}
		}
	}
}`,
					{ query }).then((data: any) => data.search.nodes);
			} else {
				request = requestGraphQL(`
query {
	viewer {
		repositories(first: 30) {
			nodes {
				id
				name
				nameWithOwner
				isPrivate
				isFork
				isMirror
			}
		}
	}
}`,
					{}).then((data: any) => data.viewer.repositories.nodes);
			}

			return request.then(repos => {
				return repos.map((repo: any) => ({
					// These URIs are resolved by the resource resolver we register above.
					resource: new vscode.Uri().with({ scheme: GITHUB_SCHEME, path: repo.id }),

					path: 'github.com/' + repo.nameWithOwner,
					name: repo.name,
					icon: iconForRepo(repo),
				}));
			});
		},
	}));
}

function iconForRepo(repo: { isPrivate: boolean, isFork: boolean, isMirror: boolean }): string {
	if (repo.isPrivate) {
		return 'lock';
	}
	if (repo.isFork) {
		return 'repo-forked';
	}
	if (repo.isMirror) {
		return 'mirror';
	}
	return 'repo';
}