/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { EditorInput, ITextEditorModel } from 'vs/workbench/common/editor';
import URI from 'vs/base/common/uri';
import { IReference } from 'vs/base/common/lifecycle';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITextModelResolverService } from 'vs/editor/common/services/resolverService';
import { ResourceEditorModel } from 'vs/workbench/common/editor/resourceEditorModel';

/**
 * A read-only text editor input whos contents are made of the provided resource that points to an existing
 * code editor model.
 */
export class ResourceEditorInput extends EditorInput {

	static ID: string = 'workbench.editors.resourceEditorInput';

	private modelReference: TPromise<IReference<ResourceEditorModel>>;
	private resource: URI;
	private name: string;
	private description: string;

	constructor(
		name: string,
		description: string,
		resource: URI,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService
	) {
		super();

		this.name = name;
		this.description = description;
		this.resource = resource;
	}

	public getResource(): URI {
		return this.resource;
	}

	public getTypeId(): string {
		return ResourceEditorInput.ID;
	}

	public getName(): string {
		return this.name;
	}

	public setName(name: string): void {
		if (this.name !== name) {
			this.name = name;
			this._onDidChangeLabel.fire();
		}
	}

	public getDescription(): string {
		return this.description;
	}

	public setDescription(description: string): void {
		if (this.description !== description) {
			this.description = description;
			this._onDidChangeLabel.fire();
		}
	}

	public getTelemetryDescriptor(): { [key: string]: any; } {
		const descriptor = super.getTelemetryDescriptor();
		descriptor['resource'] = telemetryURIDescriptor(this.resource);

		return descriptor;
	}

	public resolve(refresh?: boolean): TPromise<ITextEditorModel> {
		if (!this.modelReference) {
			this.modelReference = this.textModelResolverService.createModelReference(this.resource);
		}

		return this.modelReference.then(ref => {
			const model = ref.object;
			return model;
		});
	}

	public matches(otherInput: any): boolean {
		if (super.matches(otherInput) === true) {
			return true;
		}

		if (otherInput instanceof ResourceEditorInput) {
			let otherResourceEditorInput = <ResourceEditorInput>otherInput;

			// Compare by properties
			return otherResourceEditorInput.resource.toString() === this.resource.toString();
		}

		return false;
	}

	public dispose(): void {
		if (this.modelReference) {
			this.modelReference.done(ref => ref.dispose());
			this.modelReference = null;
		}

		super.dispose();
	}
}
