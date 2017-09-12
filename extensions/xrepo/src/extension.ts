/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { mkdirp } from './util';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('xrepo.goToSource', goToSourceFile));
	context.subscriptions.push(vscode.commands.registerCommand('xrepo.initializeWorkspaceFolder', initializeWorkspaceFolderCmd));
	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(onWorkspaceFolderAdded));
}

async function goToSourceFile(): Promise<any> {
	vscode.window.showWarningMessage('Go to Source File is unsupported for this type of file');
	vscode.commands.executeCommand('_telemetry.publicLog', 'stub:goToSource');
}

const initializeWorkspaceFolderGroup = 'init';

async function onWorkspaceFolderAdded(e: vscode.WorkspaceFoldersChangeEvent) {
	// timeout appears necessary to wait for config to load. See https://github.com/Microsoft/vscode/issues/34254.
	setTimeout(() => e.added.forEach(added => initializeWorkspaceFolder(added)), 0);
}

function getTasksFilePath(workspaceFolder: vscode.WorkspaceFolder): string {
	return path.join(workspaceFolder.uri.fsPath, '.vscode', 'tasks.json');
}

async function initializeWorkspaceFolderCmd(workspaceFolder?: vscode.WorkspaceFolder) {
	if (!workspaceFolder) {
		if (!vscode.window.activeTextEditor) {
			return;
		}
		workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
	}
	await initializeWorkspaceFolder(workspaceFolder!);
}

/**
 * initializeWorkspaceFolder ensures that the development environment in @param workspaceFolder is initialized. Returns true
 * if and only if initialization process was actually run.
 */
async function initializeWorkspaceFolder(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
	const tasks = getInitializeWorkspaceFolderTasks(workspaceFolder);
	if (tasks.length === 0) {
		await promptUserToAddInitializeWorkspaceFolderTask(workspaceFolder);
		return false;
	}

	vscode.window.showInformationMessage(localize('initializingWorkspaceFolderMessage.', "Initializing workspace folder environment."));
	try {
		await Promise.all(tasks.map(t => runTask(workspaceFolder, t)));
		vscode.window.showInformationMessage(localize('finishedInitializingWorkspaceFolderMessage.', "Finished initializing workspace folder environment."));
	} catch (err) {
		vscode.window.showErrorMessage(localize('failedToInitializeWorkspaceFolderError', "Failed to initialize workspace folder environment: ") + err);
	}
	return true;
}

async function promptUserToAddInitializeWorkspaceFolderTask(workspaceFolder: vscode.WorkspaceFolder) {
	const choice = await vscode.window.showWarningMessage(localize('noInitializeWorkspaceFolderTaskWarning', "No workspace folder initialization task was found."), localize('add', "Add"));
	if (choice === localize('add', "Add")) {
		const tasksPath = getTasksFilePath(workspaceFolder);
		if (!await new Promise<boolean>(resolve => fs.exists(tasksPath, exists => resolve(exists)))) {
			await mkdirp(path.dirname(tasksPath));
			const newFileUri = vscode.Uri.parse('untitled://' + tasksPath.replace(new RegExp(path.sep, 'g'), '/'));
			const doc = await vscode.workspace.openTextDocument(newFileUri);
			const editor = await vscode.window.showTextDocument(doc);
			const edited = editor.edit(editBuilder => {
				editBuilder.insert(new vscode.Position(0, 0), tasksSnippet);
			});
			if (edited) {
				editor.selection = taskSnippetSelection;
			}
		} else {
			const doc = await vscode.workspace.openTextDocument(tasksPath);
			await vscode.window.showTextDocument(doc);
		}
	}
}

/**
 * runTask runs the dev initialization task in the given @param workspaceFolder.
 *
 * Note: we are not using the runTask command, because that appears only to support one workspace root currently.
 * See https://github.com/Microsoft/vscode/issues/29454 for details.
 */
function runTask(workspaceFolder: vscode.WorkspaceFolder, task: BaseTaskConfig): Promise<void> {
	return task.type === 'shell' ?
		new Promise((resolve, reject) => cp.exec(task.command, { cwd: workspaceFolder.uri.fsPath }, (err) => err ? reject(err) : resolve())) :
		new Promise((resolve, reject) => cp.execFile(task.command, task.args, { cwd: workspaceFolder.uri.fsPath }, (err) => err ? reject(err) : resolve()));
}

function getInitializeWorkspaceFolderTasks(workspaceFolder: vscode.WorkspaceFolder): BaseTaskConfig[] {
	const config = vscode.workspace.getConfiguration('tasks', workspaceFolder.uri);
	if (!config.has('tasks')) {
		return [];
	}
	const tasks = config.get('tasks') as Array<TaskConfig>;
	return tasks.filter(t => t.group === initializeWorkspaceFolderGroup).map(t => toEffectiveTaskConfig(t));
}

/**
 * Converts the raw task config to an effective task config by squashing OS-specific fields.
 */
function toEffectiveTaskConfig(raw: TaskConfig): BaseTaskConfig {
	const platformMap: { [key: string]: string } = { darwin: 'osx', linux: 'linux', win32: 'windows' };
	const platformKey = platformMap[process.platform];
	return { ...raw, ...(raw as any)[platformKey] };
}

interface TaskConfig extends BaseTaskConfig {
	osx: BaseTaskConfig;
	linux: BaseTaskConfig;
	windows: BaseTaskConfig;
}

interface BaseTaskConfig {
	type: string;
	command: string;
	args: string[];
	taskName: string;
	group: string;
	options: CommandOptions;
	creates?: string;
}

export interface CommandOptions {
	/**
	* The current working directory of the executed program or shell.
	* If omitted VSCode's current workspace root is used.
	*/
	cwd?: string;

	/**
	* The additional environment of the executed program or shell. If omitted
	* the parent process' environment is used.
	*/
	env?: any;
}

/**
 * Default suggested value of tasks.json if it does not yet exist
 */
const tasksSnippet = `{
	"version": "2.0.0",
	"tasks": [
		{
			"type": "shell",
			"taskName": "Initialize dev environment",
			"group": "init",
			"command": "[[Enter initialization command here]]"
		}
	]
}`;

const taskSnippetSelection = new vscode.Selection(
	new vscode.Position(7, 15),
	new vscode.Position(7, 52),
);
