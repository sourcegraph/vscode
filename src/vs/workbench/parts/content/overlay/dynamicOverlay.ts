/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { $, Builder } from 'vs/base/browser/builder';
import { Parts, IPartService } from 'vs/workbench/services/part/common/partService';
import { RawContextKey, IContextKey, IContextKeyService } from 'vs/platform/contextkey/common/contextkey';

const OVERLAY_VISIBLE = new RawContextKey<boolean>('dynamicOverlayVisible', false);

export class DynamicOverlay {
	private _overlayVisible: IContextKey<boolean>;
	private _overlay: Builder;

	constructor(
		@IPartService private partService: IPartService,
		@IContextKeyService private _contextKeyService: IContextKeyService,
	) {
		this._overlayVisible = OVERLAY_VISIBLE.bindTo(this._contextKeyService);
	}

	/**
	 * Creates a customizable component to be rendered anywhere inside of the editor.
	 * @param  {Builder} content A full builder object to be appended to the Overlay.
	 * @param  {any} overlayStyles? Custom styling for the Overlay component otherwise default styles are used.
	 * @param  {HTMLElement} parentContainer? The container to be wrapped around to provid a way for the element to manipulate it and add more child elements. Default value EDITOR_PART container.
	 * @returns void
	 */
	public create(content: Builder, overlayStyles?: any, parentContainer?: HTMLElement): void {
		const container = parentContainer ? parentContainer : this.partService.getContainer(Parts.EDITOR_PART);

		this._overlay = $(container.parentElement)
			.div({ 'class': 'dynamic-view-overlay' })
			.style(overlayStyles ? overlayStyles : this.getDefaultOverlayStyles())
			.display('none');

		$(this._overlay).append(content);
	}


	/**
	 * Default overlay styles to be used.
	 * @returns any
	 */
	public getDefaultOverlayStyles(): any {
		const offset = this.partService.getTitleBarOffset();
		return { position: 'relative', height: `calc(100% - ${offset}px)`, width: '100%', zIndex: '1999', backgroundColor: 'white' };
	}

	/**
	 * Sets the overlyVisible state to true and updates the overlay display value
	 * @param  {string} display? CSS display value to be used when the overlay is shown. Default is block.
	 */
	public show(display?: string): void {
		if (!this._overlay) {
			console.error('Create must be called before calling show() dynamicOverlay');
			return;
		}
		if (this._overlay.style('display') === 'none') {
			this._overlay.display(display || 'block');
			this._overlayVisible.set(true);
		}
	}

	/**
	 * Sets the overlayVisible state to false and updates the overlay's display value to 'none'.
	 * @returns void
	 */
	public hide(): void {
		if (this._overlay && this._overlay.style('display') !== 'none') {
			this._overlay.display('none');
			this._overlayVisible.reset();
		}
	}

	/**
	 * Removes the current HTML element and all its children from its parent and unbinds
	 * all listeners and properties set to the data slots.
	 * @returns void
	 */
	public destroy(): void {
		this.hide();
		this._overlay.destroy();
	}
}
