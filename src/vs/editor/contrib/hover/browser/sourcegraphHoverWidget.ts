/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import { GoToDefinitionAction } from 'vs/editor/contrib/goToDeclaration/browser/goToDeclarationCommands';
import { ReferenceAction } from 'vs/editor/contrib/referenceSearch/browser/referenceSearch';
import { registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { ContentHoverWidget } from 'vs/editor/contrib/hover/browser/hoverWidgets';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { PeekContext } from 'vs/editor/contrib/zoneWidget/browser/peekViewWidget';
import { ContextKeyExpr, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { registerColor, foreground, editorHoverBackground, editorHoverBorder, lighten, darken, transparent } from 'vs/platform/theme/common/colorRegistry';

const minTooltipWidth = '400px';

const DEFINITION_CONTEXT_KEY_EXPR = ContextKeyExpr.and(EditorContextKeys.hasDefinitionProvider, EditorContextKeys.isInEmbeddedEditor.toNegated());
const REFERENCES_CONTEXT_KEY_EXPR = ContextKeyExpr.and(EditorContextKeys.hasReferenceProvider, PeekContext.notInPeekEditor, EditorContextKeys.isInEmbeddedEditor.toNegated());

export class SourcegraphHoverWidget extends ContentHoverWidget {

	private _actionBarNode: HTMLElement;
	private _contextKeyService: IContextKeyService;

	private j2dAction: HTMLAnchorElement;
	private referencesAction: HTMLAnchorElement;

	constructor(id: string, editor: editorBrowser.ICodeEditor, contextKeyService: IContextKeyService) {
		super(id, editor);

		this._containerDomNode.style.minWidth = minTooltipWidth;
		this._contextKeyService = contextKeyService;

		const actionBarNode = document.createElement('div');
		actionBarNode.className = 'hover-row action-bar';

		this.j2dAction = document.createElement('a');
		this.j2dAction.className = 'hoverButton';
		this.j2dAction.onclick = (e) => {
			this._editor.setPosition(this._showAtPosition);
			const action = new GoToDefinitionAction();
			this.hide();
			this._editor.invokeWithinContext(accessor => action.runEditorCommand(accessor, this._editor, {}));
		};
		this.j2dAction.appendChild(document.createTextNode(nls.localize('actions.goToDecl.label', "Go to Definition")));

		this.referencesAction = document.createElement('a');
		this.referencesAction.className = 'hoverButton';
		this.referencesAction.onclick = (e) => {
			this._editor.setPosition(this._showAtPosition);
			const action = new ReferenceAction();
			this.hide();
			this._editor.invokeWithinContext(accessor => action.runEditorCommand(accessor, this._editor, {}));
		};
		this.referencesAction.appendChild(document.createTextNode(nls.localize('references.action.label', "Find All References")));

		actionBarNode.appendChild(this.j2dAction);
		actionBarNode.appendChild(this.referencesAction);

		this._containerDomNode.appendChild(actionBarNode);
		this._actionBarNode = actionBarNode;
	}

	private updateJumpToDefinitionVisibility(): void {
		const visible = this._contextKeyService.contextMatchesRules(DEFINITION_CONTEXT_KEY_EXPR);
		this.j2dAction.style.display = visible ? '' : 'none';
	}

	private updateFindAllReferencesVisibility(): void {
		const visible = this._contextKeyService.contextMatchesRules(REFERENCES_CONTEXT_KEY_EXPR);
		this.referencesAction.style.display = visible ? '' : 'none';
	}

	protected updateContents(node: Node, showButtons?: boolean): void {
		this.updateJumpToDefinitionVisibility();
		this.updateFindAllReferencesVisibility();

		const wordAtPosition = this._editor.getModel().getWordAtPosition(this._showAtPosition);
		const isEmpty = !showButtons && (!wordAtPosition || !wordAtPosition.word);

		this._containerDomNode.style.minWidth = isEmpty ? '0px' : minTooltipWidth;
		this._actionBarNode.style.display = isEmpty ? 'none' : 'flex';
		super.updateContents(node);
	}
}

export const hoverButtonForeground = registerColor('hoverButtonForeground', { dark: foreground, light: darken(foreground, 0.2), hc: foreground }, nls.localize('hoverButtonForeground', "Hover button foreground color."));
export const hoverButtonBackground = registerColor('hoverButtonBackground', { dark: darken(editorHoverBackground, 0.15), light: lighten(editorHoverBackground, 0.1), hc: editorHoverBackground }, nls.localize('hoverButtonBackground', "Hover button background color."));
export const hoverButtonBorder = registerColor('hoverButtonBorder', { dark: transparent(editorHoverBorder, 0.5), light: transparent(editorHoverBorder, 0.5), hc: editorHoverBorder }, nls.localize('hoverButtonBorder', "Hover button border color."));
export const hoverButtonHoverBackground = registerColor('hoverButtonHoverBackground', { dark: lighten(editorHoverBackground, 0.15), light: darken(editorHoverBackground, 0.1), hc: editorHoverBackground }, nls.localize('hoverButtonHoverBackground', "Hover button background color when hovering."));

registerThemingParticipant((theme, collector) => {
	const foreground = theme.getColor(hoverButtonForeground, true);
	const background = theme.getColor(hoverButtonBackground, true);
	const border = theme.getColor(hoverButtonBorder, true);
	if (background && foreground) {
		collector.addRule(`
.monaco-shell .monaco-editor-hover > .hover-row > .hoverButton {
	color: ${foreground};
	background-color: ${background};
}
.monaco-shell .monaco-editor-hover > .hover-row > .hoverButton:not(:first-child) {
	border-left: solid 1px ${border};
}
.monaco-shell .monaco-editor-hover > .hover-row > .hoverButton .icon {
	background-color: ${foreground};
}
`);
	}

	const hoverBackground = theme.getColor(hoverButtonHoverBackground, true);
	if (hoverBackground) {
		collector.addRule(`
.monaco-shell .monaco-editor-hover > .hover-row > .hoverButton:hover,
.monaco-shell .monaco-editor-hover > .hover-row > .hoverButton:focus {
	background-color: ${hoverBackground};
}`);
	}
});
