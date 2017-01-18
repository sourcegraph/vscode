/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IProductConfiguration {
	nameShort: string;
	nameLong: string;
	applicationName: string;
	win32AppUserModelId: string;
	win32MutexName: string;
	darwinBundleIdentifier: string;
	urlProtocol: string;
	dataFolderName: string;
	downloadUrl: string;
	updateUrl?: string;
	quality?: string;
	commit: string;
	date: string;
	extensionsGallery: {
		serviceUrl: string;
		itemUrl: string;
	};
	extensionTips: { [id: string]: string; };
	extensionImportantTips: { [id: string]: { name: string; pattern: string; }; };
	extensionKeywords: { [extension: string]: string[]; };
	keymapExtensionTips: string[];
	crashReporter: Electron.CrashReporterStartOptions;
	welcomePage: string;
	enableTelemetry: boolean;
	aiConfig: {
		key: string;
		asimovKey: string;
	};
	sendASmile: {
		reportIssueUrl: string,
		requestFeatureUrl: string
	};
	documentationUrl: string;
	releaseNotesUrl: string;
	keyboardShortcutsUrlMac: string;
	keyboardShortcutsUrlLinux: string;
	keyboardShortcutsUrlWin: string;
	introductoryVideosUrl: string;
	twitterUrl: string;
	requestFeatureUrl: string;
	reportIssueUrl: string;
	licenseUrl: string;
	privacyStatementUrl: string;
	npsSurveyUrl: string;
	checksums: { [path: string]: string; };
	checksumFailMoreInfoUrl: string;
	extraNodeModules: string[];
}

const json = {
	'nameShort': 'Code - OSS',
	'nameLong': 'Code - OSS',
	'applicationName': 'code-oss',
	'dataFolderName': '.vscode-oss',
	'win32MutexName': 'vscodeoss',
	'licenseUrl': 'https://github.com/Microsoft/vscode/blob/master/LICENSE.txt',
	'win32DirName': 'Microsoft Code OSS',
	'win32NameVersion': 'Microsoft Code OSS',
	'win32RegValueName': 'CodeOSS',
	'win32AppId': '{{E34003BB-9E10-4501-8C11-BE3FAA83F23F}',
	'win32AppUserModelId': 'Microsoft.CodeOSS',
	'darwinBundleIdentifier': 'com.visualstudio.code.oss',
	'reportIssueUrl': 'https://github.com/Microsoft/vscode/issues/new',
	'urlProtocol': 'code-oss',
} as any;
const product = json as IProductConfiguration;

if (process.env['VSCODE_DEV']) {
	product.nameShort += ' Dev';
	product.nameLong += ' Dev';
	product.dataFolderName += '-dev';
}

export default product;
