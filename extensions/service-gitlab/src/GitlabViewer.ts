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
 * requests. Loosely based on the Viewer class in the github extension.
 */
export class Gitlab {
	private tokenUsedForCache: string;
	private hostUsedForCache: string;

	private repoRequest: Thenable<vscode.CatalogFolder[]> | null;
	private userInfoRequest: Promise<UserInformation | null> | null;

	constructor() {
		// Pre-emptively fetch user related information
		setTimeout(async () => {
			this.validateConfig();

			this.repositories();
		}, 2000);
	}

	/**
	 * Returns the user information of the currently logged in user. It is best-effort, so if the
	 * network request fails or there is no logged in user null is returned.
	 */
	public async user(): Promise<UserInformation | null> {
		try {
			if (!this.validateConfig()) {
				return null;
			}

			if (!this.cacheStillValid()) {
				this.clearCache();
			}

			if (this.userInfoRequest) {
				return this.userInfoRequest;
			}

			const userInformation = this.doGitlabRequest(this.getHost(), this.getToken(), '/user');

			this.userInfoRequest = userInformation;

			this.tokenUsedForCache = this.getToken();
			this.hostUsedForCache = this.getHost();

			return userInformation;
		} catch (error) {
			console.log(error);
			this.userInfoRequest = null;

			return null;
		}

	}

	/**
	 * Retrieves a specific repository from the GitLab instance.
	 * 
	 * @param name name of the repository
	 * @param owner owner of the repository
	 */
	public async repository(owner: string, name: string): Promise<vscode.CatalogFolder> {
		if (!this.validateConfig()) {
			throw new Error(localize("invalidConfig", "Invalid configuration values set for GitLab."));
		}

		const encodedName = encodeURIComponent(`${owner}/${name}`);
		const url = `/projects/${encodedName}`;

		const repo = await this.doGitlabRequest(this.getHost(), this.getToken(), url);

		return this.toCatalogFolder(repo);
	}

	/**
	 * Search the GitLab projects of the user using the given string. Like the other functions this
	 * is best-effort. When an error ocurres a empty array is returned. 
	 * 
	 * @param query 
	 */
	public async search(query: string): Promise<vscode.CatalogFolder[]> {
		try {
			const validState = this.validateConfig();
			if (!validState) {
				return [];
			}

			const user = await this.user();

			if (!user) {
				return [];
			}

			const encodedQuery = encodeURIComponent(query);
			const url = `/users/${user.id}/projects?search=${encodedQuery}&order_by=last_activity_at`;

			const searchResult = await this.doGitlabRequest(this.getHost(), this.getToken(), url);

			return searchResult.map((repository: any) => this.toCatalogFolder(repository));
		}
		catch (error) {
			console.log(error);

			return [];
		}
	}

	/**
	 * Retrieve Gitlab Repositories for the current user.
	 *  
	 * Like the github one this one is best-effort, so rejections should never happen. Uses
	 * internal cache for efficiency.
	 */
	public async repositories(): Promise<vscode.CatalogFolder[]> {
		try {
			const validState = this.validateConfig();
			if (!validState) {
				return [];
			}

			if (!this.cacheStillValid()) {
				this.clearCache();
			}

			if (this.repoRequest) {
				return this.repoRequest;
			}

			const user = await this.user();

			if (!user) {
				return [];
			}

			const url = `/users/${user.id}/projects`;

			const data = await this.doGitlabRequest(this.getHost(), this.getToken(), url);

			const repositories = data.map((repo: any) => this.toCatalogFolder(repo));

			this.repoRequest = Promise.resolve(repositories);
			this.tokenUsedForCache = this.getToken();
			this.hostUsedForCache = this.getHost();

			return repositories;

		} catch (error) {
			console.error(error);
			this.repoRequest = null;
			return [];
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
		const authority = vscode.Uri.parse(this.getHost()).authority;

		return vscode.Uri.parse(`git+${protocol}://${userAuthority}${authority}/${data.owner}/${data.name}.git`);
	}

	/**
	 * Convert owner and name to a VSCode resource URL.
	 * 
	 * @param owner 
	 * @param name 
	 */
	public nameAndOwnerToResource(owner: string, name: string): vscode.Uri {
		const authority = vscode.Uri.parse(this.getHost()).authority;

		return vscode.Uri.parse(`gitlab://${authority}/repository/${owner}/${name}`);
	}

	/**
	 * This function will validate the configuration. It will make sure the host and token are valid values. 
	 * 
	 * Will thrown an error when the host is not in a valid URL format.
	 */
	private validateConfig(): boolean {
		const token = this.getToken();
		const host = this.getHost();

		if (!token) {
			return false;
		}

		if (!host) {
			return false;
		}

		if (!host.includes('http')) {
			return false;
		}

		// Check if the url contains a trailing slash
		if (host.substr(-1) === '/') {
			throw new Error(localize('trailingSlashPresent', "GitLab host contains a trailing slash."));
		}

		// If the url is not in a valid format this will throw an exception.
		vscode.Uri.parse(host);

		return true;
	}

	private getToken(): string {
		return vscode.workspace.getConfiguration('gitlab').get<string>('token') || '';
	}

	private getHost(): string {
		return vscode.workspace.getConfiguration('gitlab').get<string>('host') || '';
	}

	private clearCache() {
		this.repoRequest = null;
		this.userInfoRequest = null;
	}

	private cacheStillValid(): boolean {
		return this.getToken() === this.tokenUsedForCache && this.getHost() === this.hostUsedForCache;
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
		const authority = vscode.Uri.parse(this.getHost()).authority;

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