/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as cp from 'child_process';
import * as path from 'path';
import { denodeify, nfcall } from '../util';
import * as rimraf from 'rimraf';
import { FolderWalker } from '../globalRepositories';
import { Model } from '../model';

const gitCommitEnv = {
	...process.env,
	GIT_AUTHOR_NAME: 'author',
	GIT_AUTHOR_EMAIL: 'author@example.com',
	GIT_AUTHOR_DATE: 'Thu, 07 Apr 2005 22:13:13 +0200',
	GIT_COMMITTER_NAME: 'committer',
	GIT_COMMITTER_EMAIL: 'committer@example.com',
	GIT_COMMITTER_DATE: 'Thu, 07 Apr 2005 22:13:14 +0200',
};

/**
 * Execute git (in PATH) with the given arguments and options, wrapping child_process.execFile.
 *
 * @param args Command-line arguments (not including the 'git' program name)
 * @param options Exec options
 */
function execGit(args: string[], options?: cp.ExecFileOptions): Promise<string> {
	return new Promise((c, e) => cp.execFile('git', args, options, (err: any, stdout: string | Buffer, stderr: string | Buffer) => {
		if (stderr) { e(`exec failed with stderr: git ${args.join(' ')}:\n${stderr.toString()}\n${err}`); }
		else if (err) { e(err); }
		else { c(stdout.toString()); }
	}));
}

/**
 * Creates a Git bare origin repository in ${parentDir}/origin/${name} and clones it
 * to ${parentDir}/clone/${cloneName} for each element of cloneNames.
 */
async function createTestRepository(parentDir: string, name: string, cloneNames: string[] = [name]): Promise<string[]> {
	const originDir = path.join(parentDir, name);
	await nfcall(fs.mkdir, originDir);
	await execGit(['init', '--bare'], { cwd: originDir });

	const cloneDirsParent = path.join(parentDir, 'clone');
	await nfcall(fs.mkdir, cloneDirsParent);
	const cloneDirs = cloneNames.map(name => path.join(cloneDirsParent, name));

	// Even if there are 0 cloneNames, we need to initialize the contents of the origin
	// repo, and the easiest way to do so is to clone it, commit to the clone, and push
	// back to it.
	const initContentsDir = cloneDirs.length > 0 ? cloneDirs[0] :
		await nfcall<string>(fs.mkdtemp, path.join(cloneDirsParent, 'tmp-'));

	try {
		await execGit(['clone', '--quiet', originDir, initContentsDir]);
	} catch (err) {
		if (!(typeof err === 'string' && err.includes('cloned an empty repository'))) {
			throw err;
		}
	}
	await nfcall(fs.writeFile, path.join(initContentsDir, `${name}.txt`), name, 'utf8');
	await execGit(['add', `${name}.txt`], { cwd: initContentsDir });
	await execGit(['commit', '-a', '-m', name], { env: gitCommitEnv, cwd: initContentsDir });
	await nfcall(cp.execFile, 'git', ['push', 'origin'], { cwd: initContentsDir });

	await Promise.all(cloneDirs.slice(1).map(cloneDir =>
		execGit(['clone', '--quiet', originDir, cloneDir])
	));

	// We needed to clone a directory to initialize the contents of the origin repo, but
	// we don't want to keep it.
	if (cloneNames.length === 0) {
		await nfcall(rimraf, initContentsDir);
	}

	return [originDir, ...cloneDirs];
}

/**
 * Returns the directory where a Git repository with the given remote URL would be
 * cloned automatically (using the "folders.path" naming scheme).
 */
function tmpCloneDir(tmpDir: string, remote: string): string {
	return path.join(tmpDir, remote.toLowerCase());
}

function assertWorkspaceFolders(expected: (string | vscode.Uri)[]): void {
	// Omit the first root that is always present (testWorkspace).
	const actual = vscode.workspace.workspaceFolders!.map(f => f.uri.fsPath).filter(p => path.basename(p) !== 'testWorkspace');
	expected = expected.map(f => typeof f === 'string' ? f : f.fsPath);
	assert.deepEqual(actual, expected);
}

/**
 * Asserts that the visible Git SCM repositories in the current window match the expected.
 * This is for checking that, e.g., windows don't show entries in their SCM viewlet for
 * repositories that are only open in other windows.
 *
 * @param expected The expected Git SCM repositories, excluding the editor's own repository.
 */
function assertVisibleGitSCMRepositories(expected: (string | vscode.Uri)[]): void {
	const { model } = vscode.extensions.getExtension<{ model: Model }>('vscode.git')!.exports;
	const actual = model.repositories.map(r => r.root)
		.filter(p => p !== path.join(__dirname, '..', '..', '..', '..')); // exclude the editor repository (underneath which the test may be running)
	expected = expected.map(f => typeof f === 'string' ? f : f.fsPath);
	assert.deepEqual(actual, expected);
}

/**
 * Asserts that the repository is at the expected branch.
 *
 * @param repoDir The Git repository directory.
 * @param expected The expected branch name.
 * @param message An optional message to show if the assertion fails.
 */
async function assertCurrentBranch(repoDir: string, expected: string, message?: string): Promise<void> {
	await gitRefresh(repoDir);

	const { model } = vscode.extensions.getExtension<{ model: Model }>('vscode.git')!.exports;
	const repo = model.getRepository(repoDir);
	if (!repo) {
		throw new Error(`repository not found: ${repoDir}`);
	}
	const actual = repo.HEAD ? repo.HEAD.name : 'no HEAD';
	assert.equal(actual, expected, message);
}

async function gitRefresh(repoDir: string): Promise<void> {
	await vscode.commands.executeCommand('git.refresh', repoDir);
}

suite('Tests Git remote repository resolver', async () => {
	let tmpDir: string;
	setup(async () => {
		tmpDir = await nfcall<string>(fs.mkdtemp, path.join(os.tmpdir(), 'vscode-git-test-'));
		await vscode.workspace.getConfiguration('folders')
			.update('path', tmpDir + '${separator}${folderRelativePath}' /* intentionally uninterpolated */, vscode.ConfigurationTarget.Global);
		await vscode.workspace.getConfiguration('git')
			.update('repositoryScanDirectory', tmpDir, vscode.ConfigurationTarget.Global);
	});
	teardown(async () => {
		// Remove all roots except for the first (testWorkspace).
		const foldersToRemove = vscode.workspace.workspaceFolders!.slice(1);
		await vscode.commands.executeCommand('_workbench.removeRoots', foldersToRemove.map(f => f.uri));

		await nfcall(rimraf, tmpDir);
	});

	test('when remote has no known clones, clone it and add it to current window', async () => {
		const [repoOrigin] = await createTestRepository(tmpDir, 'repo', []);
		await vscode.commands.executeCommand('git.openRemoteRepository', repoOrigin);

		assertWorkspaceFolders([tmpCloneDir(tmpDir, repoOrigin)]);
	});

	test('when remote has a clone in the current window, do nothing', async () => {
		const [repoOrigin, repoClone] = await createTestRepository(tmpDir, 'repo', ['repo']);
		await vscode.commands.executeCommand('_workbench.addRoots', [vscode.Uri.file(repoClone)]);
		assertWorkspaceFolders([repoClone]);

		await gitRefresh(repoClone);

		await vscode.commands.executeCommand('git.openRemoteRepository', repoOrigin);
		assertWorkspaceFolders([repoClone]);
	});

	suite('when remote has a different-rev clone in the current window', () => {
		test('present the user with the choice to checkout the rev in the current window', async () => {
			const [repoOrigin, repoClone] = await createTestRepository(tmpDir, 'repo', ['repo']);

			// Create and checkout a different branch (mybranch).
			const branch = 'mybranch';
			await execGit(['checkout', '--quiet', '-b', branch], { cwd: repoClone });
			await vscode.commands.executeCommand('_workbench.addRoots', [vscode.Uri.file(repoClone)]);
			assertWorkspaceFolders([repoClone]);
			await assertCurrentBranch(repoClone, 'mybranch');

			// Open the repository at the master (!= mybranch) branch.
			//
			// Triggers quickopen to select repo that must be selected from before promise resolves.
			const openedRepo = vscode.commands.executeCommand('git.openRemoteRepository', repoOrigin + '?master');
			await sleep(1500); // wait for quickopen to show
			await vscode.commands.executeCommand('workbench.action.focusQuickOpen');
			await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem'); // accept 1st choice
			await openedRepo;
			assertVisibleGitSCMRepositories([repoClone]);
			assertWorkspaceFolders([repoClone]);
			await assertCurrentBranch(repoClone, 'master');
		});
	});

	if (FolderWalker.available()) {
		test('when remote has a clone on disk (but not opened), add it to window and do not reclone', async () => {
			const [repoOrigin, repoClone] = await createTestRepository(tmpDir, 'repo', ['repo']);
			assertWorkspaceFolders([]);

			// Ensure scanning has completed.
			const { model } = vscode.extensions.getExtension<{ model: Model }>('vscode.git')!.exports;
			await model.scanRepositoryDirectory();

			await vscode.commands.executeCommand('git.openRemoteRepository', repoOrigin);
			assertWorkspaceFolders([repoClone]); // NOT [tmpCloneDir(tmpDir, repoOrigin))]
		});

		test('when remote has multiple clones on disk (but not opened), ask the user which to use', async () => {
			const [repoOrigin, repoClone1, repoClone2] = await createTestRepository(tmpDir, 'repo', ['repo1', 'repo2']);
			assertWorkspaceFolders([]);

			// Ensure scanning has completed.
			const { model } = vscode.extensions.getExtension<{ model: Model }>('vscode.git')!.exports;
			await model.scanRepositoryDirectory();

			// Triggers quickopen to select repo that must be selected from before promise resolves.
			const openedRepo = vscode.commands.executeCommand('git.openRemoteRepository', repoOrigin);
			await sleep(1500); // wait for quickopen to show
			await vscode.commands.executeCommand('workbench.action.focusQuickOpen');
			await vscode.commands.executeCommand('workbench.action.quickOpenNavigateNext'); // select 2nd choice
			await vscode.commands.executeCommand('workbench.action.acceptSelectedQuickOpenItem'); // accept 2nd choice
			await openedRepo;
			assertVisibleGitSCMRepositories([repoClone2]);
			assertWorkspaceFolders([repoClone2]); // NOT [tmpCloneDir(tmpDir, repoOrigin))]
		});
	}
});

function sleep(msec: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, msec));
}

// Only execute tests in the first window. Subsequent windows opened with vscode.openFolder
// also try to run this test suite.
vscode.window.getWindows().then(windows => {
	if (windows.length === 1) {
		run();
	}
});