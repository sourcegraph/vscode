/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as arrays from 'vs/base/common/arrays';
import { localize } from 'vs/nls';
import Event, { chain, any, debounceEvent } from 'vs/base/common/event';
import { onUnexpectedError, canceled } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManagementService, ILocalExtension, IExtensionEnablementService, IExtensionTipsService, LocalExtensionType, IExtensionGalleryService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IMessageService, Severity, IChoiceService } from 'vs/platform/message/common/message';
import { Action } from 'vs/base/common/actions';
import { BetterMergeDisabledNowKey, BetterMergeId, getIdAndVersionFromLocalExtensionId, getGloballyDisabledExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IPager } from 'vs/base/common/paging';
import { VIEWLET_ID as EXTENSIONS_VIEWLET_ID, IExtensionsViewlet } from 'vs/workbench/parts/extensions/common/extensions';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { IWindowService } from 'vs/platform/windows/common/windows';

export interface IExtensionStatus {
	identifier: string;
	local: ILocalExtension;
	globallyEnabled: boolean;
}

export class KeymapExtensions implements IWorkbenchContribution {

	private disposables: IDisposable[] = [];

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IExtensionEnablementService private extensionEnablementService: IExtensionEnablementService,
		@IExtensionTipsService private tipsService: IExtensionTipsService,
		@IChoiceService private choiceService: IChoiceService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		this.disposables.push(
			lifecycleService.onShutdown(() => this.dispose()),
			instantiationService.invokeFunction(onExtensionChanged)((ids => {
				TPromise.join(ids.map(id => this.checkForOtherKeymaps(id)))
					.then(null, onUnexpectedError);
			}))
		);
	}

	getId(): string {
		return 'vs.extensions.keymapExtensions';
	}

	private checkForOtherKeymaps(extensionId: string): TPromise<void> {
		return this.instantiationService.invokeFunction(getInstalledExtensions).then(extensions => {
			const keymaps = extensions.filter(extension => isKeymapExtension(this.tipsService, extension));
			const extension = arrays.first(keymaps, extension => extension.identifier === extensionId);
			if (extension && extension.globallyEnabled) {
				const otherKeymaps = keymaps.filter(extension => extension.identifier !== extensionId && extension.globallyEnabled);
				if (otherKeymaps.length) {
					return this.promptForDisablingOtherKeymaps(extension, otherKeymaps);
				}
			}
			return undefined;
		});
	}

	private promptForDisablingOtherKeymaps(newKeymap: IExtensionStatus, oldKeymaps: IExtensionStatus[]): TPromise<void> {
		const telemetryData: { [key: string]: any; } = {
			newKeymap: newKeymap.identifier,
			oldKeymaps: oldKeymaps.map(k => k.identifier)
		};
		this.telemetryService.publicLog('disableOtherKeymapsConfirmation', telemetryData);
		const message = localize('disableOtherKeymapsConfirmation', "Disable other keymaps ({0}) to avoid conflicts between keybindings?", oldKeymaps.map(k => `'${k.local.manifest.displayName}'`).join(', '));
		const options = [
			localize('yes', "Yes"),
			localize('no', "No")
		];
		return this.choiceService.choose(Severity.Info, message, options, 1, false)
			.then(value => {
				const confirmed = value === 0;
				telemetryData['confirmed'] = confirmed;
				this.telemetryService.publicLog('disableOtherKeymaps', telemetryData);
				if (confirmed) {
					return TPromise.join(oldKeymaps.map(keymap => {
						return this.extensionEnablementService.setEnablement(keymap.identifier, false);
					}));
				}
				return undefined;
			}, error => TPromise.wrapError(canceled()))
			.then(() => { /* drop resolved value */ });
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

export function onExtensionChanged(accessor: ServicesAccessor): Event<string[]> {
	const extensionService = accessor.get(IExtensionManagementService);
	const extensionEnablementService = accessor.get(IExtensionEnablementService);
	return debounceEvent<string, string[]>(any(
		chain(any(extensionService.onDidInstallExtension, extensionService.onDidUninstallExtension))
			.map(e => stripVersion(e.id))
			.event,
		extensionEnablementService.onEnablementChanged
	), (list, id) => {
		if (!list) {
			return [id];
		} else if (list.indexOf(id) === -1) {
			list.push(id);
		}
		return list;
	});
}

export function getInstalledExtensions(accessor: ServicesAccessor): TPromise<IExtensionStatus[]> {
	const extensionService = accessor.get(IExtensionManagementService);
	const extensionEnablementService = accessor.get(IExtensionEnablementService);
	return extensionService.getInstalled().then(extensions => {
		const globallyDisabled = extensionEnablementService.getGloballyDisabledExtensions();
		return extensions.map(extension => {
			const identifier = stripVersion(extension.id);
			return {
				identifier,
				local: extension,
				globallyEnabled: globallyDisabled.indexOf(identifier) === -1
			};
		});
	});
}

export function isKeymapExtension(tipsService: IExtensionTipsService, extension: IExtensionStatus): boolean {
	const cats = extension.local.manifest.categories;
	return cats && cats.indexOf('Keymaps') !== -1 || tipsService.getKeymapRecommendations().indexOf(extension.identifier) !== -1;
}

function stripVersion(id: string): string {
	return getIdAndVersionFromLocalExtensionId(id).id;
}

export class BetterMergeDisabled implements IWorkbenchContribution {

	constructor(
		@IStorageService storageService: IStorageService,
		@IMessageService messageService: IMessageService,
		@IExtensionService extensionService: IExtensionService,
		@IExtensionManagementService extensionManagementService: IExtensionManagementService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		extensionService.onReady().then(() => {
			if (storageService.getBoolean(BetterMergeDisabledNowKey, StorageScope.GLOBAL, false)) {
				storageService.remove(BetterMergeDisabledNowKey, StorageScope.GLOBAL);
				telemetryService.publicLog('betterMergeDisabled');
				messageService.show(Severity.Info, {
					message: localize('betterMergeDisabled', "The Better Merge extension is now built-in, the installed extension was disabled and can be uninstalled."),
					actions: [
						new Action('uninstall', localize('uninstall', "Uninstall"), null, true, () => {
							telemetryService.publicLog('betterMergeUninstall', {
								outcome: 'uninstall',
							});
							return extensionManagementService.getInstalled(LocalExtensionType.User).then(extensions => {
								return Promise.all(extensions.filter(e => stripVersion(e.id) === BetterMergeId)
									.map(e => extensionManagementService.uninstall(e, true)));
							});
						}),
						new Action('later', localize('later', "Later"), null, true, () => {
							telemetryService.publicLog('betterMergeUninstall', {
								outcome: 'later',
							});
							return TPromise.as(true);
						})
					]
				});
			}
		});
	}

	getId(): string {
		return 'vs.extensions.betterMergeDisabled';
	}
}

/**
 * The "official" TSLint extension, https://marketplace.visualstudio.com/items?itemName=eg2.tslint,
 * does not support multiroot workspaces. The necessary changes for multiroot support have been
 * committed to its repository (https://github.com/Microsoft/vscode-tslint) but haven't yet been
 * published. The multiroot-compatible version has been published to sqs.tslint-tmp-multiroot-compat
 * on the VS Code Marketplace. This contribution recommends users to install that extension if they
 * have the eg2.tslint extension installed.
 */
export class TSLintAlternateRequired implements IWorkbenchContribution {

	private static INCOMPATIBLE_EXTENSION_ID = 'eg2.tslint';
	private static COMPATIBLE_EXTENSION_ID = 'sqs.tslint-tmp-multiroot-compat';

	constructor(
		@IStorageService storageService: IStorageService,
		@IMessageService private messageService: IMessageService,
		@IExtensionService extensionService: IExtensionService,
		@IExtensionEnablementService extensionEnablementService: IExtensionEnablementService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IViewletService private viewletService: IViewletService,
		@IWindowService private windowService: IWindowService,
	) {
		extensionService.onReady()
			.then(() => extensionManagementService.getInstalled(LocalExtensionType.User))
			.then(extensions => {
				// Disable eg2.tslint extensions.
				const disabledExtensionIds = getGloballyDisabledExtensions(extensionEnablementService, storageService, extensions);
				extensions.filter(e => stripVersion(e.id) === TSLintAlternateRequired.INCOMPATIBLE_EXTENSION_ID)
					.filter(e => disabledExtensionIds.indexOf(e.id) === -1)
					.map(e => extensionEnablementService.setEnablement(stripVersion(e.id), false));

				const isIncompatInstalled = extensions.some(e => stripVersion(e.id) === TSLintAlternateRequired.INCOMPATIBLE_EXTENSION_ID);
				const isCompatInstalled = extensions.some(e => stripVersion(e.id) === TSLintAlternateRequired.COMPATIBLE_EXTENSION_ID);

				if (!isIncompatInstalled) {
					return;
				}

				if (!isCompatInstalled) {
					telemetryService.publicLog('tslintAlternateRequired');
					messageService.show(Severity.Info, {
						message: localize('tslintAlternateRequired', "The installed TSLint extension does not yet support multi-root workspaces."),
						actions: [
							new Action('install', localize('install', "Install multiroot-aware TSLint (recommended)"), null, true, () => {
								telemetryService.publicLog('tslintAlternateInstall', {
									outcome: 'install',
								});
								return this.installAlternateExtension();
							}),
							new Action('later', localize('later', "Later"), null, true, () => {
								telemetryService.publicLog('tslintAlternateInstall', {
									outcome: 'later',
								});
								return TPromise.as(true);
							})
						]
					});
				}
			});
	}

	getId(): string {
		return 'vs.extensions.tslintAlternateRequired';
	}

	private installAlternateExtension(): TPromise<void> {
		return this.extensionGalleryService.query({ names: [TSLintAlternateRequired.COMPATIBLE_EXTENSION_ID] })
			.then<IPager<IGalleryExtension>>(null, err => {
				if (err.responseText) {
					try {
						const response = JSON.parse(err.responseText);
						return TPromise.wrapError(response.message);
					} catch (e) {
						// noop
					}
				}

				return TPromise.wrapError(err);
			})
			.then(result => {
				const [extension] = result.firstPage;
				if (!extension) {
					return TPromise.wrapError(new Error(localize('notFound', `Extension '{0}' not found.`, TSLintAlternateRequired.COMPATIBLE_EXTENSION_ID)));
				}
				return this.extensionManagementService.installFromGallery(extension, false).then(() => {
					this.viewletService.openViewlet(EXTENSIONS_VIEWLET_ID, true)
						.then(viewlet => viewlet as IExtensionsViewlet)
						.done(viewlet => {
							viewlet.search('name:tslint');
							viewlet.focus();

							this.messageService.show(Severity.Info, {
								message: localize('reloadAfterInstall', "Reload to activate the multiroot-aware TSLint extension."),
								actions: [
									new Action('reload', localize('reload', "Reload"), null, true, () => {
										return this.windowService.reloadWindow();
									}),
								],
							});
						});
				});
			});
	}
}
