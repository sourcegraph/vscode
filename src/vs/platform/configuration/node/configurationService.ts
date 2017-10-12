/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { ConfigWatcher } from 'vs/base/node/config';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationRegistry, Extensions } from 'vs/platform/configuration/common/configurationRegistry';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ConfigurationSource, IConfigurationService, IConfigurationServiceEvent, IConfigurationValue, IConfigurationKeys, ConfigurationModel, IConfigurationOverrides, Configuration, IConfigurationValues, IConfigurationData } from 'vs/platform/configuration/common/configuration';
import { CustomConfigurationModel, DefaultConfigurationModel } from 'vs/platform/configuration/common/model';
import Event, { Emitter } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { onUnexpectedError } from 'vs/base/common/errors';

export class ConfigurationService<T> extends Disposable implements IConfigurationService, IDisposable {

	_serviceBrand: any;

	private _configuration: Configuration<T>;
	private organizationConfigModelWatcher: ConfigWatcher<ConfigurationModel<T>>;
	private userConfigModelWatcher: ConfigWatcher<ConfigurationModel<T>>;

	private _onDidUpdateConfiguration: Emitter<IConfigurationServiceEvent> = this._register(new Emitter<IConfigurationServiceEvent>());
	public readonly onDidUpdateConfiguration: Event<IConfigurationServiceEvent> = this._onDidUpdateConfiguration.event;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService
	) {
		super();

		this.organizationConfigModelWatcher = new ConfigWatcher(environmentService.appOrganizationSettingsPath, {
			changeBufferDelay: 300, onError: error => onUnexpectedError(error), defaultConfig: new CustomConfigurationModel<T>(null, environmentService.appOrganizationSettingsPath), parse: (content: string, parseErrors: any[]) => {
				const organizationConfigModel = new CustomConfigurationModel<T>(content, environmentService.appOrganizationSettingsPath);
				parseErrors = [...organizationConfigModel.errors];
				return organizationConfigModel;
			}
		});
		this._register(this.organizationConfigModelWatcher);

		this.userConfigModelWatcher = new ConfigWatcher(environmentService.appSettingsPath, {
			changeBufferDelay: 300, onError: error => onUnexpectedError(error), defaultConfig: new CustomConfigurationModel<T>(null, environmentService.appSettingsPath), parse: (content: string, parseErrors: any[]) => {
				const userConfigModel = new CustomConfigurationModel<T>(content, environmentService.appSettingsPath);
				parseErrors = [...userConfigModel.errors];
				return userConfigModel;
			}
		});
		this._register(this.userConfigModelWatcher);

		// Listeners
		this._register(this.organizationConfigModelWatcher.onDidUpdateConfiguration(() => this.onConfigurationChange(ConfigurationSource.Organization)));
		this._register(this.userConfigModelWatcher.onDidUpdateConfiguration(() => this.onConfigurationChange(ConfigurationSource.User)));
		this._register(Registry.as<IConfigurationRegistry>(Extensions.Configuration).onDidRegisterConfiguration(() => this.onConfigurationChange(ConfigurationSource.Default)));
	}

	public configuration(): Configuration<any> {
		return this._configuration || (this._configuration = this.consolidateConfigurations());
	}

	private onConfigurationChange(source: ConfigurationSource): void {
		this.reset(); // reset our caches

		const cache = this.configuration();

		let sourceConfig: any;
		switch (source) {
			case ConfigurationSource.Default:
				sourceConfig = cache.defaults.contents;
				break;
			case ConfigurationSource.User:
				sourceConfig = cache.user.contents;
				break;
			case ConfigurationSource.Organization:
				sourceConfig = cache.organization.contents;
				break;
			default:
				throw new Error(`Unhandled Configuration Source: ${ConfigurationSource[source]}`);
		}

		this._onDidUpdateConfiguration.fire({
			source,
			sourceConfig
		});
	}

	public reloadConfiguration<C>(section?: string): TPromise<C> {
		return new TPromise<C>(c => {
			this.organizationConfigModelWatcher.reload(() => {
				this.userConfigModelWatcher.reload(() => {
					this.reset(); // reset our caches
					c(this.getConfiguration<C>(section));
				});
			});
		});
	}

	public getConfiguration<C>(section?: string, options?: IConfigurationOverrides): C {
		return this.configuration().getValue<C>(section, options);
	}

	public lookup<C>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<C> {
		return this.configuration().lookup<C>(key, overrides);
	}

	public keys(overrides?: IConfigurationOverrides): IConfigurationKeys {
		return this.configuration().keys(overrides);
	}

	public values<V>(): IConfigurationValues {
		return this._configuration.values();
	}

	public getConfigurationData<T2>(): IConfigurationData<T2> {
		return this.configuration().toData();
	}

	private reset(): void {
		this._configuration = this.consolidateConfigurations();
	}

	private consolidateConfigurations(): Configuration<T> {
		const defaults = new DefaultConfigurationModel<T>();
		const organization = this.organizationConfigModelWatcher.getConfig();
		const user = this.userConfigModelWatcher.getConfig();
		return new Configuration(defaults, organization, user);
	}
}