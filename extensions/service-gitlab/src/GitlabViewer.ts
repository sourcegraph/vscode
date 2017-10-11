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
			this.clearCache();
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
	public async repository(owner: string, name: string): Promise<vscode.CatalogFolder> {
		const encodedName = encodeURIComponent(`${owner}/${name}`);
		const url = `/projects/${encodedName}`;

		const repo = await this.doGitlabRequest(this.host, this.token, url);

		return this.toCatalogFolder(repo);
	}

	/**
	 * Search the GitLab projects of the user using the given string. Like the other functions this
	 * is best-effort. When an error ocurres a empty array is returned. 
	 * 
	 * @param query 
	 */
	public async search(query: string): Promise<vscode.CatalogFolder[]> {
		if (!this.validState()) {
			return Promise.resolve([]);
		}

		const encodedQuery = encodeURIComponent(query);
		const url = `/users/${this.userid}/projects?search=${encodedQuery}&order_by=last_activity_at`;

		try {
			const searchResult = await this.doGitlabRequest(this.host, this.token, url);

			return searchResult.map(this.toCatalogFolder);
		}
		catch (error) {
			console.log(error);

			return Promise.resolve([]);
		}
	}

	/**
	 * Retrieve Gitlab Repositories for the current user.
	 *  
	 * Like the github one this one is best-effort, so rejections should never happen. Uses
	 * internal cache for efficiency.
	 */
	public async repositories(): Promise<vscode.CatalogFolder[]> {
		if (!this.validState()) {
			this.clearCache();
			return Promise.resolve([]);
		}

		if (this.repoRequest) {
			return this.repoRequest;
		}

		const url = `/users/${this.userid}/projects`;

		try {
			const data = await this.doGitlabRequest(this.host, this.token, url);

			const repositories = data.map((repo: any) => this.toCatalogFolder(repo));

			this.repoRequest = Promise.resolve(repositories);

			return repositories;

		} catch (error) {
			console.error(error);
			this.repoRequest = null;
			return Promise.resolve([]);
		}
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

		// User can be undefinied in some cases, the url will also work without username.
		//
		// This can happen when the username request to GitLab fails and the request is not cached. The 
		// two main reasons why the request can fail are network issues (gitlab down) or an 
		// authentication failure. Authentication is unlikely here since the only way to reach this 
		// to actually retrieve a list of repositories for this user (authentication needed)

		const userAuthority = user ? `${user}@` : '';
		let authority = vscode.Uri.parse(this.host).authority;

		return vscode.Uri.parse(`git+${protocol}://${userAuthority}${authority}/${data.owner}/${data.name}.git`);
	}

	public nameAndOwnerToResource(owner: string, name: string): vscode.Uri {
		let authority = vscode.Uri.parse(this.host).authority;

		return vscode.Uri.parse(`gitlab://${authority}/repository/${owner}/${name}`);
	}

	/**
	 * Returns true if you can do a request or use a cached request. This will return false when information
	 * is missing or when information from the config does not match the information in this instance.
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

		if (this.token && token !== this.token) {
			return false;
		}

		if (this.host && host !== this.host) {
			return false;
		}

		if (this.userid && userid !== this.userid) {
			return false;
		}

		this.token = token;
		this.host = host;
		this.userid = userid;

		return true;
	}

	private clearCache() {
		this.repoRequest = null;
		this.userInfoRequest = null;
	}

	private async doGitlabRequest(host: string, token: string, endpoint: string): Promise<any> {
		const response = await fetch(`${host}/api/v4${endpoint}`, {
			method: 'GET',
			headers: { 'PRIVATE-TOKEN': token }
		});

		if (response.status < 200 || response.status > 299) {
			const err: { error: { message: string } } = await response.json();

			if (err && err.error) {
				return this.createError(err.error.message);
			}

			return this.createError(response.statusText);
		}

		return response.json();
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