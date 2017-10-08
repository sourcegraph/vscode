/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';

const GITLAB_SCHEME = 'gitlab';

// Gets Gitlab information associated for the current user. Uses a cache to prevent multiple
// requests. Based on the github viewer.
export class GitlabViewer {
	private token: string;
	private host: string;
	private userid: number;

	private repoRequest: Thenable<vscode.CatalogFolder[]> | null;
	private usernameRequest: Thenable<string | null> | null;
	private userIdRequest: Thenable<number | null>;

	// Returns the username of the currently logged in user. It is best-effort, so if the
	// network request fails or there is no logged in user null is returned.
	public username(): Thenable<string | null> {
		if (!this.validState()) {
			return Promise.resolve(null);
		}

		if (this.usernameRequest !== null) {
			return this.usernameRequest;
		}

		const request = this.doGitlabRequest(this.host, this.token, '/user')

			.then<string | null>((data: any) => {
				return data.viewer.login;
			}, (reason) => {
				// try again, but don't fail other requests if this fails
				console.error(reason);
				this.usernameRequest = null;
				return null;
			});

		this.usernameRequest = request;
		return request;
	}

	// Returns the userid of the currently logged in user. It is best-effort, so if the
	// network request fails or there is no logged in user null is returned.
	public userId(): Thenable<number | null> {
		if (!this.validState()) {
			return Promise.resolve(null);
		}

		if (this.usernameRequest !== null) {
			return this.userIdRequest;
		}

		const request = this.doGitlabRequest(this.host, this.token, '/user')
			.then<number | null>((data: any) => {
				return parseInt(data.viewer.id, 10);
			}, (reason) => {
				// try again, but don't fail other requests if this fails
				console.error(reason);
				this.usernameRequest = null;
				return null;
			});

		this.userIdRequest = request;
		return request;
	}

	// Retrieve Gitlab Repositories for the current user.
	// 
	// Like the github this one is best-effort, so rejections should never happen. Uses
	// internal cache for efficiency.
	public repositories(): Thenable<vscode.CatalogFolder[]> {
		if (!this.validState()) {
			return Promise.resolve([]);
		}

		if (this.repoRequest !== null) {
			return this.repoRequest;
		}

		const url = `/users/${this.userid}/projects`;

		const request = this.doGitlabRequest(this.host, this.token, url)
			.then<vscode.CatalogFolder[]>((data: any[]) => {
				return data.map(this.toCatalogFolder);
			},
			(reason) => {
				console.error(reason);
				this.usernameRequest = null;
				return null;
			});

		return request;
	}

	// Returns true if you can do a request or use a cached request.
	private validState(): boolean {
		const token = vscode.workspace.getConfiguration('gitlab').get<string>('token');
		const host = vscode.workspace.getConfiguration('gitlab').get<string>('host');
		const userid = vscode.workspace.getConfiguration('gitlab').get<number>('userid');

		if (!token) {
			return false;
		}

		if (!host) {
			return false;
		}

		if (!userid) {
			return false;
		}

		if (token !== this.token) {
			this.repoRequest = null;
			this.usernameRequest = null;
		}

		if (host !== this.host) {
			this.repoRequest = null;
			this.usernameRequest = null;
		}

		if (userid !== this.userid) {
			this.repoRequest = null;
			this.usernameRequest = null;
		}

		this.token = token;
		this.host = host;
		this.userid = userid;

		return true;
	}

	private doGitlabRequest<T>(host: string, token: string, endpoint: string): Thenable<T> {
		return fetch(`${host}/api/v4${endpoint}?private_toke=${token}`, {
			method: 'GET'
		})
			.then(response => {
				if (response.status < 200 || response.status > 299) {
					return response.json().then(
						// TODO: Put in error message
						(error: { message: string }) => { }
					);
				}

				return response.json();
			});
	}

	private toCatalogFolder(repository: any): vscode.CatalogFolder {
		return {
			resource: vscode.Uri.parse('').with({ scheme: GITLAB_SCHEME, authority: this.host, path: `/repository/${repository.path_with_namespace}` }),
			displayPath: repository.repository.path_with_namespace,
			displayName: repository.name,
			genericIconClass: this.iconForRepo(repository),
			cloneUrl: vscode.Uri.parse('').with({ scheme: 'https', authority: this.host, path: `/${repository.path_with_namespace}.git` }),
			isPrivate: repository.visibility === 'private',
			starsCount: repository.star_count,
			forksCount: repository.forks_count,
			description: repository.description,
			createdAt: new Date(Date.parse(repository.created_at)),
			updatedAt: repository.last_activity_at ? new Date(Date.parse(repository.last_activity_at)) : undefined,
		};
	}

	private iconForRepo(repo: { visibility: string }) {
		if (repo.visibility === 'private') {
			return 'lock';
		}
		return 'repo';
	}
}