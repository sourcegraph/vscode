/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as errors from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { EditorModel } from 'vs/workbench/common/editor';
import { TPromise } from 'vs/base/common/winjs.base';
import { IRemoteService, requestGraphQL } from 'vs/platform/remote/node/remote';
import { ILineMatch } from 'vs/platform/search/common/search';
import { findContainingFolder } from 'vs/platform/folder/common/folderContainment';

/**
 * A code search query.
 * If a field is not provided, then the value from the user's most recent search will be used.
 */
export interface CodeSearchQuery {
	readonly pattern: string;
	readonly workspaces?: WorkspaceRevision[];
	readonly isWordMatch?: boolean;
	readonly isRegExp?: boolean;
	readonly isCaseSensitive?: boolean;
	readonly includePattern?: string;
	readonly excludePattern?: string;
}

/**
 * Specifies a workspace and (optional) revision to search.
 */
export interface WorkspaceRevision {
	/**
	 * The root URI of the workspace to search.
	 */
	workspace: URI;

	/**
	 * The revision of the workspace to search. If not set, the server will use the
	 * corresponding repository's default branch. To make this search deterministic, this
	 * field's value should be the resolved commit ID, not a mutable revspec (such as a
	 * branch).
	 */
	revision?: string;
}

export interface LineMatch extends ILineMatch {
	limitHit: boolean;
}

export interface FileMatch {
	readonly resource: string;
	readonly lineMatches: LineMatch[];
	readonly limitHit: boolean;
}

/**
 * The code search response from our GraphQL endpoint.
 */
export interface CodeSearchResponse {
	readonly results: FileMatch[];

	/** True if we found more than the requested limit of FileMatches */
	readonly limitHit: boolean;

	/** List of repositories that could not be searched since they are cloning. */
	readonly cloning: string[];

	/** List of repositories that do not exist. */
	readonly missing: string[];
}

/**
 * A model for a code search response.
 * It is an EditorModel for historical reasons, and doesn't need to be this way any more.
 * See documentation for EditorModel.
 */
export class CodeSearchModel extends EditorModel {

	private _response: CodeSearchResponse | undefined;

	constructor(
		private query: CodeSearchQuery,
		private fileMatchLimit: number,
		@IRemoteService private remoteService: IRemoteService,
	) {
		super();
	}

	public isResolved(): boolean {
		return !!this.response;
	}

	public get response(): CodeSearchResponse | undefined {
		return this._response;
	}

	public load(): TPromise<CodeSearchModel> {
		if (this.query.pattern.length === 0 || this.query.workspaces.length === 0) {
			this._response = {
				limitHit: false,
				results: [],
				missing: [],
				cloning: [],
			};
			return TPromise.wrap(this);
		}
		return requestGraphQL<any>(this.remoteService, `query SearchText(
				$pattern: String!,
				$fileMatchLimit: Int!,
				$isRegExp: Boolean!,
				$isWordMatch: Boolean!,
				$repositories: [RepositoryRevision!]!,
				$isCaseSensitive: Boolean!,
				$includePattern: String!,
				$excludePattern: String!,
			) {
				root {
					searchRepos(
						repositories: $repositories,
						query: {
							pattern: $pattern,
							isRegExp: $isRegExp,
							fileMatchLimit: $fileMatchLimit,
							isWordMatch: $isWordMatch,
							isCaseSensitive: $isCaseSensitive,
							includePattern: $includePattern,
							excludePattern: $excludePattern,
					}) {
						limitHit
						cloning
						missing
						results {
							resource
							limitHit
							lineMatches {
								preview
								lineNumber
								offsetAndLengths
							}
						}
					}
				}
			}`, {
				...this.query,
				repositories: toRepositoryRevisions(this.query.workspaces),
				fileMatchLimit: this.fileMatchLimit,
			}).then(resp => {
				this._response = resp.searchRepos;
				return this;
			});
	}
}

type RepositoryRevision = {
	repo: string;
	rev?: string;
};

function toRepositoryRevisions(workspaces: WorkspaceRevision[]): RepositoryRevision[] {
	const repos: RepositoryRevision[] = [];
	workspaces.forEach(({ workspace, revision }) => {
		try {
			const folder = findContainingFolder(workspace);
			if (folder) {
				repos.push({ repo: folder.authority + folder.path, rev: revision });
			}
		} catch (err) {
			errors.onUnexpectedError(errors.illegalArgument(workspace.toString()));
		}
	});
	return repos;
}
