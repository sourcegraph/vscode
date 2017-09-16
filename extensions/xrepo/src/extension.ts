/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as nls from 'vscode-nls';
import * as go from './go';
import * as python from './python';
import * as typescript from './typescript';

const localize = nls.loadMessageBundle();

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('xrepo.goToSource', goToSourceFile));
	context.subscriptions.push(vscode.commands.registerCommand('xrepo.initializeWorkspaceFolder', initializeWorkspaceFolderCmd));
	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(onWorkspaceFolderAdded));
}

async function goToSourceFile(): Promise<any> {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const lang = editor.document.languageId;
	let sourceFileLocations: vscode.Location[];
	switch (lang) {
		case 'go':
			sourceFileLocations = await go.getSourceLocation(editor.document.uri, editor.selection);
			break;
		case 'python':
			sourceFileLocations = await python.getSourceLocation(editor.document.uri, editor.selection);
			break;
		case 'typescript':
			sourceFileLocations = await typescript.getSourceLocation(editor.document.uri, editor.selection);
			break;
		default:
			vscode.window.showWarningMessage('Go to Source File is unsupported for this type of file');
			vscode.commands.executeCommand('_telemetry.publicLog', 'stub:goToSource');
			return;
	}
	if (!sourceFileLocations || sourceFileLocations.length === 0) {
		vscode.window.showWarningMessage(localize('sourceFileNotFoundInWorkspace', "Source file was not found in workspace."));
		return;
	}
	// Just jump to first choice for now (later we can add an API to display the same picker as for jump-to-definition
	const dstLoc = sourceFileLocations[0];
	if (dstLoc.uri.toString() !== editor.document.uri.toString() || !dstLoc.range.isEqual(editor.selection)) {
		const dstEditor = await vscode.window.showTextDocument(dstLoc.uri);
		dstEditor.selection = new vscode.Selection(dstLoc.range.start, dstLoc.range.end);
		dstEditor.revealRange(dstLoc.range, vscode.TextEditorRevealType.InCenter);
	}
}

const initializeWorkspaceFolderGroup = 'init';

async function onWorkspaceFolderAdded(e: vscode.WorkspaceFoldersChangeEvent) {
	// timeout appears necessary to wait for config to load. See https://github.com/Microsoft/vscode/issues/34254.
	setTimeout(() => e.added.forEach(added => initializeWorkspaceFolder(added)), 0);
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
