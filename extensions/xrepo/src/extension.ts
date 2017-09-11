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

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('xrepo.goToSource', goToSourceFile));
	vscode.workspace.onDidChangeWorkspaceFolders(onWorkspaceFolderAdded);
}

async function goToSourceFile(): Promise<any> {
	vscode.window.showWarningMessage('Go to Source File is unsupported for this type of file');
	vscode.commands.executeCommand('_telemetry.publicLog', 'stub:goToSource');
}

const initializeDevEnvironmentTaskId = 'initializeDevEnvironment';

async function onWorkspaceFolderAdded(e: vscode.WorkspaceFoldersChangeEvent) {
	setTimeout(async () => { // timeout appears necessary to wait for config to load
		for (const added of e.added) {
			await ensureDevEnvironmentInitialized(added);
		}
	}, 0);
}

async function ensureDevEnvironmentInitialized(workspaceFolder: vscode.WorkspaceFolder) {
	const task = getDevEnvironmentInitializedTask(workspaceFolder);
	if (!task) {
		const choice = await vscode.window.showWarningMessage(nls.localize('KEY-No initializeDevEnvironment task was found.', "No initializeDevEnvironment task was found."), nls.localize('KEY-Add', "Add"));
		if (choice === nls.localize('KEY-Add', "Add")) {
			const tasksPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'tasks.json');
			if (!fs.existsSync(tasksPath)) {
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
		return;
	}

	if (!task.creates) {
		const run = await vscode.window.showWarningMessage(nls.localize('KEY-Found initializeDevEnvironment task. Run it?', "Found initializeDevEnvironment task. Run it?"), nls.localize('KEY-Run', "Run"));
		if (run !== nls.localize('KEY-Run', "Run")) {
			return;
		}
	} else {
		const creates = path.join(workspaceFolder.uri.fsPath, task.creates);
		if (fs.existsSync(creates)) {
			return;
		}
	}

	// Note: we are not using the runTask command, because that appears to support only one workspace root currently.
	vscode.window.showInformationMessage(nls.localize('KEY-Initializing dev environment.', "Initializing dev environment."));
	const promise = task.type === 'shell' ?
		new Promise((resolve, reject) => cp.exec(task.command, { cwd: workspaceFolder.uri.fsPath }, (err, stdout, stderr) => err ? reject(err) : resolve())) :
		new Promise((resolve, reject) => cp.execFile(task.command, task.args, { cwd: workspaceFolder.uri.fsPath }, (err, stdout, stderr) => err ? reject(err) : resolve()));
	return promise.then(() => {
		vscode.window.showInformationMessage(nls.localize('KEY-Finished initializing dev environment.', "Finished initializing dev environment."));
	}, (err) => {
		vscode.window.showErrorMessage(nls.localize('KEY-Failed to initialize dev environment: ', "Failed to initialize dev environment: ") + err);
	});
}

function getDevEnvironmentInitializedTask(workspaceFolder: vscode.WorkspaceFolder): TaskConfig | null {
	const config = vscode.workspace.getConfiguration('tasks', workspaceFolder.uri);
	if (!config.has('tasks')) {
		return null;
	}
	const tasks = config.get('tasks') as Array<TaskConfig>;
	for (const task of tasks) {
		if (task.identifier === initializeDevEnvironmentTaskId) {
			return task;
		}
	}
	return null;
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
	identifier: string;
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
			"identifier": "initializeDevEnvironment",
			"command": "[enter initialization command here]",
			"creates": "[enter initialization output directory, if applicable]"
		}
	]
}`;

const taskSnippetSelection = new vscode.Selection(
	new vscode.Position(7, 15),
	new vscode.Position(7, 50),
);
