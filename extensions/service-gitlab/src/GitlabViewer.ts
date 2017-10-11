/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import 'isomorphic-fetch';

const localize = nls.loadMessageBundle();

export const GITLAB_SCHEME = 'gitlab';

/**
 * Gets Gitlab information associated for the current user. Uses a cache to prevent multiple
 * requests. Based on the github viewer.
 */
export class Gitlab {
	private token: string;
	private host: string;
	private userid: number | undefined;

	private repoRequest: Thenable<vscode.CatalogFolder[]> | null;

	private userInfoRequest: Promise<UserInformation | null> | null;
	private usernameRequest: Thenable<string | null> | null;

	constructor() {
		// Pre-emptively fetch user related information
		setTimeout(() => {
			this.repositories();
		}, 2000);
	}

	/**
	 * Returns the user information of the currently logged in user. It is best-effort, so if the
	 * network request fails or there is no logged in user null is returned.
	 */
	public async user(): Promise<UserInformation | null> {
		if (!this.validState()) {
			return Promise.resolve(null);
		}

		if (this.userInfoRequest) {
			return this.userInfoRequest;
		}

		try {
			const userInformation = this.doGitlabRequest(this.host, this.token, '/user');

			this.userInfoRequest = userInformation;

			return userInformation;
		} catch (error) {
			console.log(error);
			this.userInfoRequest = null;

			return Promise.resolve(null);
		}

	}

	/**
	 * Retrieves a specific repository from the GitLab instance.
	 * 
	 * @param name name of the repository
	 * @param owner owner of the repository
	 */
	public repository(owner: string, name: string): Thenable<vscode.CatalogFolder> {
		const encodedName = encodeURIComponent(`${owner}/${name}`);
		const url = `/projects/${encodedName}`;

		return this.doGitlabRequest(this.host, this.token, url)
			.then(this.toCatalogFolder);
	}

	public search(query: string): Thenable<vscode.CatalogFolder[]> {
		if (!this.validState()) {
			return Promise.resolve([]);
		}

		const encodedQuery = encodeURIComponent(query);
		const url = `/users/${this.userid}/projects?search=${encodedQuery}&order_by=last_activity_at`;

		return this.doGitlabRequest(this.host, this.token, url)
			.then((data: any[]) => data.map(this.toCatalogFolder));
	}

	/**
	 * Retrieve Gitlab Repositories for the current user.
	 *  
	 * Like the github one this one is best-effort, so rejections should never happen. Uses
	 * internal cache for efficiency.
	 */
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
				const repositories = data.map(repo => this.toCatalogFolder(repo));

				this.repoRequest = Promise.resolve(repositories);

				return repositories;
			})
			.catch((reason) => {
				console.error(reason);
				this.repoRequest = null;
				return null;
			});

		return request;
	}

	/**
	 * Returns a URI that can be used to clone the git repository. 
	 * 
	 * Note: this will include "git+" in the scheme.
	 * 
	 * @param resource 
	 */
	public async createCloneUrl(resource: vscode.Uri): Promise<vscode.Uri> {
		const data = this.resourceToNameAndOwner(resource);
		const protocol = vscode.workspace.getConfiguration('gitlab').get<string>('cloneProtocol');
		let user: string | null = null;

		if (protocol === 'ssh') {
			user = 'git';
		} else {
			const userinfo = await this.user();

			if (!userinfo) {
				user = null;
			} else {
				user = userinfo.username;
			}
		}
		const userAuthority = user ? `${user}@` : '';

		return vscode.Uri.parse(`git+${protocol}://${userAuthority}gitlab.com/${data.owner}/${data.name}.git`);
	}

	/**
	 * Returns true if you can do a request or use a cached request.
	 */
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

	private doGitlabRequest(host: string, token: string, endpoint: string): Promise<any> {

		return fetch(`${host}/api/v4${endpoint}`, {
			method: 'GET',
			headers: { 'PRIVATE-TOKEN': token }
		})
			.then(response => {
				if (response.status < 200 || response.status > 299) {
					return response.json().then(
						(err: { error: { message: string } }) => this.createError(err && err.error ? err.error.message : response.statusText),
						err => this.createError(err),
					);
				}

				return response.json();
			});
	}

	private toCatalogFolder(repository: any): vscode.CatalogFolder {
		let authority = vscode.Uri.parse(this.host).authority;

		return {
			resource: vscode.Uri.parse('').with({ scheme: GITLAB_SCHEME, authority: authority, path: `/repository/${repository.path_with_namespace}` }),
			displayPath: repository.path_with_namespace,
			displayName: repository.name,
			genericIconClass: this.iconForRepo(repository),
			cloneUrl: vscode.Uri.parse('').with({ scheme: 'https', authority: authority, path: `/${repository.path_with_namespace}.git` }),
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

	/**
	 * Get the owner and name of from resource path. Resource path is in the form:
	 * 
	 * gitlab://www.gitlab.com/repository/owner/name 
	 * 
	 * Above example will return owner / name. This form is used as resource in a VS code catalog folder.
	 * 
	 * @param resourcePath resouce of CatalogFolder
	 */
	private resourceToNameAndOwner(resourcePath: vscode.Uri): { owner: string, name: string } {
		const parts = resourcePath.path.replace(/^\/repository\//, '').split('/');
		return { owner: parts[0], name: parts[1] };
	}

	private createError(error: string): Thenable<string> {
		return Promise.reject(new Error(localize('apiError', "Error from GitLab: {0}", error)));
	}
}

export interface UserInformation {
	id: number;
	name: string;
	username: string;
}