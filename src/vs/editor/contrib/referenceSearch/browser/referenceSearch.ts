/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import URI from 'vs/base/common/uri';
import { PPromise, TPromise } from 'vs/base/common/winjs.base';
import { IEditorService } from 'vs/platform/editor/common/editor';
import { optional } from 'vs/platform/instantiation/common/instantiation';
import { CommandsRegistry, ICommandHandler } from 'vs/platform/commands/common/commands';
import { IContextKeyService, ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction, CommonEditorRegistry, commonEditorContribution } from 'vs/editor/common/editorCommonExtensions';
import { LanguageIdentifier, Location, ReferenceProviderRegistry, WorkspaceReferenceProviderRegistry, IReferenceInformation, ISymbolDescriptor, ReferenceContext } from 'vs/editor/common/modes';
import { IPeekViewService, PeekContext, getOuterEditor } from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import { ReferencesController, RequestOptions, ctxReferenceSearchVisible } from './referencesController';
import { ReferencesModel } from './referencesModel';
import { asWinJsPromise } from 'vs/base/common/async';
import { onUnexpectedExternalError } from 'vs/base/common/errors';

import ModeContextKeys = editorCommon.ModeContextKeys;
import EditorContextKeys = editorCommon.EditorContextKeys;

const defaultReferenceSearchOptions: RequestOptions = {
	getMetaTitle(model) {
		return model.references.length > 1 && nls.localize('meta.titleReference', " – {0} references", model.references.length);
	}
};

@commonEditorContribution
export class ReferenceController implements editorCommon.IEditorContribution {

	private static ID = 'editor.contrib.referenceController';

	constructor(
		editor: editorCommon.ICommonCodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@optional(IPeekViewService) peekViewService: IPeekViewService
	) {
		if (peekViewService) {
			PeekContext.inPeekEditor.bindTo(contextKeyService);
		}
	}

	public dispose(): void {
	}

	public getId(): string {
		return ReferenceController.ID;
	}
}

@editorAction
export class ReferenceAction extends EditorAction {

	constructor() {
		super({
			id: 'editor.action.referenceSearch.trigger',
			label: nls.localize('references.action.label', "Find All References"),
			alias: 'Find All References',
			precondition: ContextKeyExpr.and(
				ModeContextKeys.hasReferenceProvider,
				PeekContext.notInPeekEditor,
				ModeContextKeys.isInEmbeddedEditor.toNegated()),
			kbOpts: {
				kbExpr: EditorContextKeys.TextFocus,
				primary: KeyMod.Shift | KeyCode.F12
			},
			menuOpts: {
				group: 'navigation',
				order: 1.5
			}
		});
	}

	public run(accessor: ServicesAccessor, editor: editorCommon.ICommonCodeEditor): void {
		let controller = ReferencesController.get(editor);
		if (!controller) {
			return;
		}
		let range = editor.getSelection();
		let model = editor.getModel();

		let provideReferencesPromise: TPromise<void>;
		const references = new PPromise<ReferencesModel, Location[]>((complete, error, progress) => {
			provideReferencesPromise = provideReferences(model, range.getStartPosition(), progress).then(references => complete(new ReferencesModel(references)), error);
		}, () => {
			provideReferencesPromise.cancel();
		});
		controller.toggleWidget(range, references, defaultReferenceSearchOptions);
	}
}

let findReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: editorCommon.IPosition) => {

	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri');
	}
	if (!position) {
		throw new Error('illegal argument, position');
	}

	return accessor.get(IEditorService).openEditor({ resource }).then(editor => {

		let control = <editorCommon.ICommonCodeEditor>editor.getControl();
		if (!control || typeof control.getEditorType !== 'function') {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		let provideReferencesPromise: TPromise<void>;
		const references = new PPromise<ReferencesModel, Location[]>((complete, error, progress) => {
			provideReferencesPromise = provideReferences(control.getModel(), Position.lift(position), progress).then(references => complete(new ReferencesModel(references)), error);
		}, () => {
			provideReferencesPromise.cancel();
		});
		let range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
		return TPromise.as(controller.toggleWidget(range, references, defaultReferenceSearchOptions));
	});
};

let showReferencesCommand: ICommandHandler = (accessor: ServicesAccessor, resource: URI, position: editorCommon.IPosition, references: Location[]) => {
	if (!(resource instanceof URI)) {
		throw new Error('illegal argument, uri expected');
	}

	return accessor.get(IEditorService).openEditor({ resource: resource }).then(editor => {

		let control = <editorCommon.ICommonCodeEditor>editor.getControl();
		if (!control || typeof control.getEditorType !== 'function') {
			return undefined;
		}

		let controller = ReferencesController.get(control);
		if (!controller) {
			return undefined;
		}

		return TPromise.as(controller.toggleWidget(
			new Range(position.lineNumber, position.column, position.lineNumber, position.column),
			TPromise.as(new ReferencesModel(references)),
			defaultReferenceSearchOptions)).then(() => true);
	});
};



// register commands

CommandsRegistry.registerCommand('editor.action.findReferences', findReferencesCommand);

CommandsRegistry.registerCommand('editor.action.showReferences', {
	handler: showReferencesCommand,
	description: {
		description: 'Show references at a position in a file',
		args: [
			{ name: 'uri', description: 'The text document in which to show references', constraint: URI },
			{ name: 'position', description: 'The position at which to show', constraint: Position.isIPosition },
			{ name: 'locations', description: 'An array of locations.', constraint: Array },
		]
	}
});

function closeActiveReferenceSearch(accessor, args) {
	var outerEditor = getOuterEditor(accessor, args);
	if (!outerEditor) {
		return;
	}

	let controller = ReferencesController.get(outerEditor);
	if (!controller) {
		return;
	}

	controller.closeWidget();
}

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReferenceSearch',
	weight: CommonEditorRegistry.commandWeight(50),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(ctxReferenceSearchVisible, ContextKeyExpr.not('config.editor.stablePeek')),
	handler: closeActiveReferenceSearch
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'closeReferenceSearchEditor',
	weight: CommonEditorRegistry.commandWeight(-101),
	primary: KeyCode.Escape,
	secondary: [KeyMod.Shift | KeyCode.Escape],
	when: ContextKeyExpr.and(PeekContext.inPeekEditor, ContextKeyExpr.not('config.editor.stablePeek')),
	handler: closeActiveReferenceSearch
});


export function provideReferences(model: editorCommon.IReadOnlyModel, position: Position, progress: (locations: Location[]) => void, context?: ReferenceContext): TPromise<Location[]> {

	// collect references from all providers
	const promises = ReferenceProviderRegistry.ordered(model).map(provider => {
		return asWinJsPromise((token) => {
			const ctx = context || { includeDeclaration: true };
			return provider.provideReferences(model, position, ctx, token, progress);
		}).then(result => {
			if (Array.isArray(result)) {
				return <Location[]>result;
			}
			return undefined;
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(references => {
		let result: Location[] = [];
		for (const refs of references) {
			if (refs) {
				for (const ref of refs) {
					result.push(ref);
				}
			}
		}
		return result;
	});
}

CommonEditorRegistry.registerDefaultLanguageCommand('_executeReferenceProvider', provideReferences);

export function provideWorkspaceReferences(language: LanguageIdentifier, workspace: URI, query: ISymbolDescriptor, hints: { [hint: string]: any }, progress: (references: IReferenceInformation[]) => void): TPromise<IReferenceInformation[]> {

	const model = {
		isTooLargeForHavingARichMode() {
			return false;
		},
		getModeId() {
			return language.language;
		},
		getLanguageIdentifier(): LanguageIdentifier {
			return language;
		},
		uri: workspace
	};

	// collect references from all providers
	const promises = WorkspaceReferenceProviderRegistry.ordered(model as any).map(provider => {
		return asWinJsPromise(token => {
			return provider.provideWorkspaceReferences(workspace, query, hints, token, progress);
		}).then(result => {
			if (Array.isArray(result)) {
				return <IReferenceInformation[]>result;
			}
			return undefined;
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(references => {
		const result: IReferenceInformation[] = [];
		for (const refs of references) {
			if (refs) {
				for (const ref of refs) {
					result.push(ref);
				}
			}
		}
		return result;
	});
}
