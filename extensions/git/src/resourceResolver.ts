/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as os from 'os';
import * as path from 'path';
import { workspace, Uri, Disposable } from 'vscode';
import { Git } from './git';
import { mkdirp } from './util';
import { Model } from './model';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class GitResourceResolver {

	private static SCHEMES = [
		'git',
		'git+https',
		'git+ssh',
		'git+http',
	];

	private disposables: Disposable[] = [];

	constructor(
		private git: Git,
		private model: Model,
	) {
		for (const scheme of GitResourceResolver.SCHEMES) {
			this.disposables.push(workspace.registerResourceResolutionProvider(scheme, this));
		}
	}

	public async resolveResource(resource: Uri): Promise<Uri> {
		// For 'git' scheme, avoid conflict with the TextDocumentContentProvider's git: URIs by only resolving URIs
		// with a host (authority). The TextDocumentContentProvider does not construct or handle these.
		if (!resource.authority) {
			return resource;
		}

		// `git clone` doesn't actually understand the 'git+' prefix on the URI scheme.
		if (resource.scheme.startsWith('git+')) {
			resource = resource.with({ scheme: resource.scheme.replace(/^git\+/, '') });
		}

		// See if a repository with this clone URL already exists. This is best-effort and is based on string
		// equality between our unresolved resource URI and the repositories' remote URLs.
		for (const repository of this.model.repositories) {
			for (const remote of repository.remotes) {
				if (remote.url.toLowerCase() === resource.toString()) {
					return Uri.file(repository.root);
				}
			}
		}

		// Repository doesn't exist (or we don't know about it), so clone it to a temporary location.
		const folderPath = this.getFolderPath(resource);
		await mkdirp(path.dirname(folderPath));
		try {
			await this.git.exec(path.dirname(folderPath), ['clone', resource.toString(), folderPath]);
			return Uri.file(folderPath);
		} catch (err) {
			// The repository directory exists on disk, so try reusing it.
			await this.model.tryOpenRepository(folderPath);
			const repository = this.model.getRepository(folderPath);
			if (!repository) {
				return Promise.reject(localize('notAGitRepository', "Directory is not a valid Git repository: {0}", folderPath));
			}
			return Uri.file(repository.root);
		}
	}

	private getFolderPath(cloneUrl: Uri): string {
		const host = cloneUrl.authority && cloneUrl.authority.includes('@') ? cloneUrl.authority.slice(cloneUrl.authority.indexOf('@') + 1) : cloneUrl.authority; // remove userinfo from URI
		const folderRelativePath = path.join(host, cloneUrl.path.replace(/\.git$/, ''));
		const homePath = os.homedir();
		const separator = path.sep;

		const pathTemplate = workspace.getConfiguration('folders').get<string>('path')!;
		return replaceVariables(pathTemplate, { folderRelativePath, homePath, separator });
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
	}
}

function replaceVariables(value: string, vars: { [name: string]: string }): string {
	const regexp = /\$\{(.*?)\}/g;
	return value.replace(regexp, (match: string, name: string) => {
		let newValue = vars[name];
		if (typeof newValue === 'string') {
			return newValue;
		}
		return match;
	});
}