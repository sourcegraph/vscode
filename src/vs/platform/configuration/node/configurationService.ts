/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService, IConfigurationChangeEvent, IConfigurationOverrides, ConfigurationTarget, compare, isConfigurationOverrides, IConfigurationData } from 'vs/platform/configuration/common/configuration';
import { DefaultConfigurationModel, Configuration, ConfigurationChangeEvent } from 'vs/platform/configuration/common/configurationModels';
import Event, { Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';
import { equals } from 'vs/base/common/objects';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { UserConfiguration, OrganizationConfiguration } from 'vs/platform/configuration/node/configuration';

export class ConfigurationService extends Disposable implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private _configuration: Configuration;
	private userConfiguration: UserConfiguration;
	private organizationConfiguration: OrganizationConfiguration;

	private _onDidChangeConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this.userConfiguration = this._register(new UserConfiguration(environmentService.appSettingsPath));
		this.organizationConfiguration = this._register(new OrganizationConfiguration(environmentService.appOrganizationSettingsPath));

		this.reset();

		// Listeners
		this._register(this.userConfiguration.onDidChangeConfiguration(() => this.onDidChangeUserConfiguration()));
		this._register(this.organizationConfiguration.onDidChangeConfiguration(() => this.onDidChangeUserConfiguration()));
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(configurationProperties => this.onDidRegisterConfiguration(configurationProperties)));
	}

	get configuration(): Configuration {
		return this._configuration;
	}

	getConfigurationData(): IConfigurationData {
		return this.configuration.toData();
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: any, arg2?: any): any {
		const section = typeof arg1 === 'string' ? arg1 : void 0;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
		return this.configuration.getValue(section, overrides, null);
	}

	updateValue(key: string, value: any): TPromise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides): TPromise<void>;
	updateValue(key: string, value: any, target: ConfigurationTarget): TPromise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides, target: ConfigurationTarget): TPromise<void>;
	updateValue(key: string, value: any, arg3?: any, arg4?: any): TPromise<void> {
		return TPromise.wrapError(new Error('not supported'));
	}

	inspect<T>(key: string): {
		default: T,
		organization: T,
		user: T,
		workspace: T,
		workspaceFolder: T
		value: T
	} {
		return this.configuration.lookup<T>(key, {}, null);
	}

	keys(): {
		default: string[];
		organization: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return this.configuration.keys(null);
	}

	reloadConfiguration(folder?: IWorkspaceFolder): TPromise<void> {
		return folder ? TPromise.as(null) :
			this.organizationConfiguration.reload()
				.then(() => this.userConfiguration.reload())
				.then(() => this.onDidChangeUserConfiguration());
	}

	private onDidChangeUserConfiguration(): void {
		let changedKeysOrg = [];
		const orgDiff = compare(this._configuration.organization, this.organizationConfiguration.configurationModel);
		changedKeysOrg = [...orgDiff.added, ...orgDiff.updated, ...orgDiff.removed];

		let changedKeys = [];
		const { added, updated, removed } = compare(this._configuration.user, this.userConfiguration.configurationModel);
		changedKeys = [...added, ...updated, ...removed];

		if (changedKeysOrg || changedKeys) {
			const oldConfiguartion = this._configuration;
			this.reset();

			changedKeys = changedKeys.filter(key => !equals(oldConfiguartion.lookup(key, {}, null).user, this._configuration.lookup(key, {}, null).user));
			if (changedKeys.length) {
				this.trigger(changedKeys, ConfigurationTarget.USER);
			}
			changedKeysOrg = changedKeysOrg.filter(key => !equals(oldConfiguartion.lookup(key, {}, null).organization, this._configuration.lookup(key, {}, null).organization));
			if (changedKeysOrg.length) {
				this.trigger(changedKeysOrg, ConfigurationTarget.ORGANIZATION);
			}
		}
	}

	private onDidRegisterConfiguration(keys: string[]): void {
		this.reset(); // reset our caches
		this.trigger(keys, ConfigurationTarget.DEFAULT);
	}

	private reset(): void {
		const defaults = new DefaultConfigurationModel();
		const organization = this.organizationConfiguration.configurationModel;
		const user = this.userConfiguration.configurationModel;
		this._configuration = new Configuration(defaults, organization, user);
	}

	private trigger(keys: string[], source: ConfigurationTarget): void {
		this._onDidChangeConfiguration.fire(new ConfigurationChangeEvent().change(keys).telemetryData(source, this.getTargetConfiguration(source)));
	}

	private getTargetConfiguration(target: ConfigurationTarget): any {
		switch (target) {
			case ConfigurationTarget.DEFAULT:
				return this._configuration.defaults.contents;
			case ConfigurationTarget.ORGANIZATION:
				return this._configuration.organization.contents;
			case ConfigurationTarget.USER:
				return this._configuration.user.contents;
		}
		return {};
	}
}