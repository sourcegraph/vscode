/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { toResource } from 'vs/workbench/common/editor';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { telemetryURIDescriptor } from 'vs/platform/telemetry/common/telemetryUtils';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

export class EditorViewTelemetryHandler implements IWorkbenchContribution {

	public _serviceBrand: any;

	private disposables: IDisposable[] = [];

	constructor(
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		this.editorGroupService.onEditorsChanged(this.onEditorsChanged, this, this.disposables);
	}

	private onEditorsChanged(): void {
		const activeEditor = this.editorService.getActiveEditor();
		const activeResource = activeEditor ? toResource(activeEditor.input, { supportSideBySide: true, filter: 'file' }) : void 0;

		let params: any = {
			page_title: 'ViewOther'
		};

		if (activeResource) {
			const uriDescriptor = telemetryURIDescriptor(activeResource);
			params = {
				page_title: 'ViewFile',
				language: uriDescriptor.ext.slice(1)
			};
		}

		this.telemetryService.publicLog('ViewFile', params);
	}

	public dispose(): void {
		this.disposables = dispose(this.disposables);
	}

	public getId(): string {
		return 'vs.editor.editorViewTelemetryHandler';
	}
}