/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import assert = require('assert');
import os = require('os');
import path = require('path');
import fs = require('fs');

import { Registry } from 'vs/platform/registry/common/platform';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { parseArgs } from 'vs/platform/environment/node/argv';
import { EnvironmentService } from 'vs/platform/environment/node/environmentService';
import extfs = require('vs/base/node/extfs');
import uuid = require('vs/base/common/uuid');
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from 'vs/platform/configuration/common/configurationRegistry';

class SettingsTestEnvironmentService extends EnvironmentService {

	constructor(args: ParsedArgs, _execPath: string, private customAppSettingsHome, private customOrganizationSettingsHome) {
		super(args, _execPath);
	}

	get appSettingsPath(): string { return this.customAppSettingsHome; }

	get appOrganizationSettingsPath(): string { return this.customOrganizationSettingsHome; }
}

suite('ConfigurationService - Node', () => {

	function testFiles(callback: (userPath: string, orgPath: string, cleanUp: (callback: () => void) => void) => void): void {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const userSettingsPath = path.join(newDir, 'config.json');
		const orgSettingsPath = path.join(newDir, 'orgConfig.json');

		extfs.mkdirp(newDir, 493, (error) => {
			callback(userSettingsPath, orgSettingsPath, (callback) => extfs.del(parentDir, os.tmpdir(), () => { }, callback));
		});
	}

	test('simple - user settings', (done: () => void) => {
		testFiles((userSettingsPath, orgSettingsPath, cleanUp) => {
			fs.writeFileSync(userSettingsPath, '{ "foo": "bar" }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

			const config = service.getConfiguration<{ foo: string }>();
			assert.ok(config);
			assert.equal(config.foo, 'bar');

			service.dispose();

			cleanUp(done);
		});
	});

	test('simple - org settings', (done: () => void) => {
		testFiles((userSettingsPath, orgSettingsPath, cleanUp) => {
			fs.writeFileSync(orgSettingsPath, '{ "foo": "bar" }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

			const config = service.getConfiguration<{ foo: string }>();
			assert.ok(config);
			assert.equal(config.foo, 'bar');

			service.dispose();

			cleanUp(done);
		});
	});

	test('user settings overrides org settings', (done: () => void) => {
		testFiles((userSettingsPath, orgSettingsPath, cleanUp) => {
			fs.writeFileSync(orgSettingsPath, '{ "foo": "old" }');
			fs.writeFileSync(userSettingsPath, '{ "foo": "new" }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

			const config = service.getConfiguration<{ foo: string }>();
			assert.ok(config);
			assert.equal(config.foo, 'new');

			service.dispose();

			cleanUp(done);
		});
	});

	test('config gets flattened', (done: () => void) => {
		testFiles((userSettingsPath, orgSettingsPath, cleanUp) => {
			fs.writeFileSync(userSettingsPath, '{ "testworkbench.editor.tabs": true }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

			const config = service.getConfiguration<{ testworkbench: { editor: { tabs: boolean } } }>();
			assert.ok(config);
			assert.ok(config.testworkbench);
			assert.ok(config.testworkbench.editor);
			assert.equal(config.testworkbench.editor.tabs, true);

			service.dispose();

			cleanUp(done);
		});
	});

	test('error case does not explode', (done: () => void) => {
		testFiles((userSettingsPath, orgSettingsPath, cleanUp) => {
			fs.writeFileSync(userSettingsPath, ',,,,');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

			const config = service.getConfiguration<{ foo: string }>();
			assert.ok(config);

			service.dispose();

			cleanUp(done);
		});
	});

	test('missing file does not explode', () => {
		const id = uuid.generateUuid();
		const parentDir = path.join(os.tmpdir(), 'vsctests', id);
		const newDir = path.join(parentDir, 'config', id);
		const userSettingsPath = path.join(newDir, 'config.json');
		const orgSettingsPath = path.join(newDir, 'orgConfig.json');

		const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

		const config = service.getConfiguration<{ foo: string }>();
		assert.ok(config);

		service.dispose();
	});

	test('reloadConfiguration', (done: () => void) => {
		testFiles((userSettingsPath, orgSettingsPath, cleanUp) => {
			fs.writeFileSync(userSettingsPath, '{ "foo": "bar" }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

			let config = service.getConfiguration<{ foo: string, eggs: string }>();
			assert.ok(config);
			assert.equal(config.foo, 'bar');
			assert.equal(config.eggs, void 0);

			fs.writeFileSync(userSettingsPath, '{ "foo": "changed" }');
			fs.writeFileSync(orgSettingsPath, ' { "eggs": "ham" }');

			// still outdated
			config = service.getConfiguration<{ foo: string, eggs: string }>();
			assert.ok(config);
			assert.equal(config.foo, 'bar');
			assert.equal(config.eggs, void 0);

			// force a reload to get latest
			service.reloadConfiguration().then(() => {
				config = service.getConfiguration<{ foo: string, eggs: string }>();
				assert.ok(config);
				assert.equal(config.foo, 'changed');
				assert.equal(config.eggs, 'ham');

				service.dispose();

				cleanUp(done);
			});
		});
	});

	test('model defaults', (done: () => void) => {
		interface ITestSetting {
			configuration: {
				service: {
					testSetting: string;
				}
			};
		}

		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'configuration.service.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});

		let serviceWithoutFile = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, '__fakeUserSettings', '__fakeOrgSettings'));
		let setting = serviceWithoutFile.getConfiguration<ITestSetting>();

		assert.ok(setting);
		assert.equal(setting.configuration.service.testSetting, 'isSet');

		testFiles((userSettingsPath, orgSettingsPath, cleanUp) => {
			fs.writeFileSync(userSettingsPath, '{ "testworkbench.editor.tabs": true }');

			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

			let setting = service.getConfiguration<ITestSetting>();

			assert.ok(setting);
			assert.equal(setting.configuration.service.testSetting, 'isSet');

			fs.writeFileSync(userSettingsPath, '{ "configuration.service.testSetting": "isChanged" }');

			service.reloadConfiguration().then(() => {
				let setting = service.getConfiguration<ITestSetting>();

				assert.ok(setting);
				assert.equal(setting.configuration.service.testSetting, 'isChanged');

				service.dispose();
				serviceWithoutFile.dispose();

				cleanUp(done);
			});
		});
	});

	test('lookup', (done: () => void) => {
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_test',
			'type': 'object',
			'properties': {
				'lookup.service.testSetting': {
					'type': 'string',
					'default': 'isSet'
				}
			}
		});

		testFiles((userSettingsPath, orgSettingsPath, cleanUp) => {
			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

			let res = service.inspect('something.missing');
			assert.strictEqual(res.value, void 0);
			assert.strictEqual(res.default, void 0);
			assert.strictEqual(res.organization, void 0);
			assert.strictEqual(res.user, void 0);

			res = service.inspect('lookup.service.testSetting');
			assert.strictEqual(res.default, 'isSet');
			assert.strictEqual(res.value, 'isSet');
			assert.strictEqual(res.organization, void 0);
			assert.strictEqual(res.user, void 0);

			fs.writeFileSync(userSettingsPath, '{ "lookup.service.testSetting": "bar" }');
			fs.writeFileSync(orgSettingsPath, '{ "lookup.service.testSetting": "baz" }');
			return service.reloadConfiguration().then(() => {
				res = service.inspect('lookup.service.testSetting');
				assert.strictEqual(res.default, 'isSet');
				assert.strictEqual(res.organization, 'baz');
				assert.strictEqual(res.user, 'bar');
				assert.strictEqual(res.value, 'bar');

				service.dispose();

				cleanUp(done);
			});
		});
	});

	test('lookup with null', (done: () => void) => {
		const configurationRegistry = <IConfigurationRegistry>Registry.as(ConfigurationExtensions.Configuration);
		configurationRegistry.registerConfiguration({
			'id': '_testNull',
			'type': 'object',
			'properties': {
				'lookup.service.testNullSetting': {
					'type': 'null',
				}
			}
		});

		testFiles((userSettingsPath, orgSettingsPath, cleanUp) => {
			const service = new ConfigurationService(new SettingsTestEnvironmentService(parseArgs(process.argv), process.execPath, userSettingsPath, orgSettingsPath));

			let res = service.inspect('lookup.service.testNullSetting');
			assert.strictEqual(res.default, null);
			assert.strictEqual(res.value, null);
			assert.strictEqual(res.organization, void 0);
			assert.strictEqual(res.user, void 0);

			fs.writeFileSync(userSettingsPath, '{ "lookup.service.testNullSetting": null }');

			return service.reloadConfiguration().then(() => {
				res = service.inspect('lookup.service.testNullSetting');
				assert.strictEqual(res.default, null);
				assert.strictEqual(res.value, null);
				assert.strictEqual(res.organization, void 0);
				assert.strictEqual(res.user, null);

				service.dispose();

				cleanUp(done);
			});
		});
	});
});
