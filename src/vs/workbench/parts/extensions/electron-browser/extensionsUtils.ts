/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as arrays from 'vs/base/common/arrays';
import { localize } from 'vs/nls';
import Event, { chain, anyEvent, debounceEvent } from 'vs/base/common/event';
import { onUnexpectedError, canceled } from 'vs/base/common/errors';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManagementService, ILocalExtension, IExtensionEnablementService, IExtensionTipsService, LocalExtensionType, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { ILifecycleService } from 'vs/platform/lifecycle/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IMessageService, Severity, IChoiceService } from 'vs/platform/message/common/message';
import { Action } from 'vs/base/common/actions';
import { BetterMergeDisabledNowKey, BetterMergeId, getIdAndVersionFromLocalExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
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
		/* __GDPR__FRAGMENT__
			"KeyMapsData" : {
				"newKeymap" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
				"oldKeymaps": { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
			}
		*/
		const telemetryData: { [key: string]: any; } = {
			newKeymap: newKeymap.identifier,
			oldKeymaps: oldKeymaps.map(k => k.identifier)
		};

		/* __GDPR__
			"disableOtherKeymapsConfirmation" : {
				"${include}": [
					"${KeyMapsData}"
				]
			}
		*/
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
				/* __GDPR__
					"disableOtherKeymaps" : {
						"confirmed" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
						"${include}": [
							"${KeyMapsData}"
						]
					}
				*/
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
	return debounceEvent<string, string[]>(anyEvent(
		chain(anyEvent(extensionService.onDidInstallExtension, extensionService.onDidUninstallExtension))
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
				/* __GDPR__
					"betterMergeDisabled" : {}
				*/
				telemetryService.publicLog('betterMergeDisabled');
				messageService.show(Severity.Info, {
					message: localize('betterMergeDisabled', "The Better Merge extension is now built-in, the installed extension was disabled and can be uninstalled."),
					actions: [
						new Action('uninstall', localize('uninstall', "Uninstall"), null, true, () => {
							/* __GDPR__
								"betterMergeUninstall" : {
									"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
							telemetryService.publicLog('betterMergeUninstall', {
								outcome: 'uninstall',
							});
							return extensionManagementService.getInstalled(LocalExtensionType.User).then(extensions => {
								return Promise.all(extensions.filter(e => stripVersion(e.id) === BetterMergeId)
									.map(e => extensionManagementService.uninstall(e, true)));
							});
						}),
						new Action('later', localize('later', "Later"), null, true, () => {
							/* __GDPR__
								"betterMergeUninstall" : {
									"outcome" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
								}
							*/
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
 * Previously we disabled the published tslint extension and supplied our fork that supported multi-root.
 * Now that the published tslint extension supports multi-root, we do not need our fork anymore. Un-disable
 * the published extension and remove our fork.
 */
export class EnablePublishedTSLintExtension implements IWorkbenchContribution {

	private static EXTENSION_ID = 'eg2.tslint';
	private static FORK_EXTENSION_ID = 'sqs.tslint-tmp-multiroot-compat';

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
				extensionEnablementService.setEnablement(EnablePublishedTSLintExtension.EXTENSION_ID, true);
				extensionEnablementService.setEnablement(EnablePublishedTSLintExtension.FORK_EXTENSION_ID, false);

				const installedForkExtension = extensions.filter(e => stripVersion(e.id) === EnablePublishedTSLintExtension.FORK_EXTENSION_ID)[0];

				if (!installedForkExtension) {
					return;
				}

				if (installedForkExtension) {
					messageService.show(Severity.Info, {
						message: localize('enablePublishedTSLintExtension', "The TSLint extension needs to be upgraded."),
						actions: [
							new Action('upgrade', localize('upgrade', "Upgrade to multiroot-aware TSLint (recommended)"), null, true, () => {
								return this.extensionManagementService.uninstall(installedForkExtension, true).then(() => this.askToReload());
							}),
							new Action('later', localize('later', "Later"), null, true, () => {
								return TPromise.as(true);
							})
						]
					});
				}
			});
	}

	getId(): string {
		return 'vs.extensions.enablePublishedTSLintExtension';
	}

	private askToReload(): void {
		this.messageService.show(Severity.Info, {
			message: localize('reloadAfterInstall', "Reload to activate the multiroot-aware TSLint extension."),
			actions: [
				new Action('reload', localize('reload', "Reload"), null, true, () => {
					return this.windowService.reloadWindow();
				}),
			],
		});
	}
}
