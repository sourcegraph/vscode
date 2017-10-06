/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Action } from 'vs/base/common/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { localize } from 'vs/nls';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { IMessageService, Severity } from 'vs/platform/message/common/message';
import { IProgressService2, ProgressLocation } from 'vs/platform/progress/common/progress';
import * as paths from 'vs/base/node/paths';
import * as path from 'path';
import * as pfs from 'vs/base/node/pfs';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWindowService } from 'vs/platform/windows/common/windows';
import * as platform from 'vs/base/common/platform';
import * as os from 'os';
import { nfcall } from 'vs/base/common/async';
import * as cp from 'child_process';

/**
 * This action will migrate user preferences and extensions from other
 * installations of Visual Studio Code or Sourcegraph.
 */
export class VSCodeMigrateAction extends Action {

	public static ID = 'workbench.action.vscodeMigrate';
	public static LABEL = localize('migrateLabel', "Migrate Extensions and User Settings from Visual Studio Code");

	constructor(
		id: string,
		label: string,
		@IQuickOpenService private quickOpenService: IQuickOpenService,
		@IMessageService private messageService: IMessageService,
		@IProgressService2 private progressService: IProgressService2,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IWindowService private windowService: IWindowService,
	) {
		super(id, label);
	}

	public run(): TPromise<void> {
		return TPromise.wrap(this.doRun());
	}

	private async doRun(): Promise<void> {
		if (platform.isWindows) {
			this.messageService.show(Severity.Error, localize('migrateWin32', "Migration is not supported on windows."));
			return;
		}

		const userDataDir = await this.quickOpenService.pick(TPromise.wrap(this.detectUserDirs()));
		if (!userDataDir) {
			return;
		}

		const confirmed = this.messageService.confirm({
			message: localize('migrateConfirm', "This action will overwrite existing settings. Are you sure you want to migrate?"),
		});
		if (!confirmed) {
			return;
		}

		const migratePromise = this.migrate(userDataDir.label);
		this.progressService.withProgress({
			location: ProgressLocation.Window,
			title: localize('migrateProgressTitle', "Migrating settings"),
		}, () => TPromise.wrap(migratePromise));
		await migratePromise;
	}

	private async detectUserDirs(): Promise<IPickOpenEntry[]> {
		const appDataPath = paths.getAppDataPath(process.platform);
		const entries = await Promise.all(Object.keys(dataFolders).map(async name => {
			const userDataDir = path.resolve(path.join(appDataPath, name));
			if (userDataDir === this.environmentService.userDataPath) {
				return null;
			}

			const exists = await pfs.exists(userDataDir);
			if (!exists) {
				return null;
			}
			return {
				label: name,
				description: userDataDir,
			};
		}));
		return entries.filter(e => !!e);
	}

	private async migrate(applicationName: string): Promise<void> {
		const source = this.getPaths(applicationName);
		const userDir = path.join(this.environmentService.userDataPath, 'User');
		const extensionDir = path.join(this.environmentService.extensionsPath);
		await Promise.all([
			this.migrateDir(source.userDir, userDir),
			this.migrateDir(source.extensionDir, extensionDir),
		]);
		await this.windowService.reloadWindow();
	}

	private getPaths(applicationName: string): { userDir: string; extensionDir: string } {
		const appDataPath = paths.getAppDataPath(process.platform);
		return {
			userDir: path.resolve(path.join(appDataPath, applicationName, 'User')),
			extensionDir: path.join(os.homedir(), dataFolders[applicationName], 'extensions'),
		};
	}

	private async migrateDir(source: string, target: string): Promise<void> {
		if (source === target) {
			return;
		}

		const [sourceExists, targetExists] = await Promise.all([
			pfs.exists(source),
			pfs.exists(target),
		]);
		if (!sourceExists) {
			return;
		}

		// We want to avoid the editor interacting with half copied state, so
		// do an "atomic" copy. We don't use FileService or extfs.copy since
		// they don't ignore source files disappearing during the copy, which
		// is common when copying extension state from a running instance.
		const migrateName = String(Date.now());
		const targetTmp = `${target}.${migrateName}.migrate`;
		await nfcall(cp.execFile, 'cp', ['-r', source, targetTmp]);
		if (targetExists) {
			await pfs.rename(target, `${target}.${migrateName}.bak`);
		}
		await pfs.rename(targetTmp, target);
	}
}

const dataFolders = {
	'Code': '.vscode',
	'Code - Insiders': '.vscode-insiders',
	'code-oss-dev': '.vscode-oss-dev',
	'Sourcegraph - Insiders': '.sourcegraph-insiders',
	'src-oss-dev': '.sourcegraph-oss-dev',
};
