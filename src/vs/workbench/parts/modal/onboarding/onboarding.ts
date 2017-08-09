/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!vs/workbench/parts/modal/media/modal';
import 'vs/css!./media/onboarding';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { $, Builder } from 'vs/base/browser/builder';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Modal } from 'vs/workbench/parts/modal/modal';
import { ModalPart } from 'vs/workbench/parts/modal/modalPart';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';

/**
 * OnboardingModal is the modal rendered after a user fills out the
 * AfterSignupModal — it takes the user on a tour of basic functionality, including:
 *
 * 1) Hover, right-click, find-refs
 * 2) Cross-repo search
 * 3) Quickopen
 */
export class OnboardingModal extends Modal {
	private $scrollRight;
	private $scrollLeft;
	private $content;
	private currentSlide;

	constructor(
		parent: ModalPart,
		@ITelemetryService protected telemetryService: ITelemetryService,
		@IKeybindingService private keybindingService: IKeybindingService
	) {
		super(parent, telemetryService, false);
	}

	public shouldShow(): boolean {
		return true;
	}

	/**
	 * Creates the modal
	 */
	protected createContents(container: Builder): TPromise<void> {
		container.addClass('onboarding-modal');
		const $wrapper = $('div').addClass('wrapper').appendTo(container);

		this.$content = $('div').addClass('contents').appendTo($wrapper);
		this.currentSlide = 0;

		// Left scroll initially not displayed
		this.$scrollLeft = $('div').addClass('scroll-action scroll-action-left').style({ 'display': 'none' }).on('click', () => this.handleScroll(-1)).innerHtml('&larr;').appendTo($wrapper);
		this.$scrollRight = $('div').addClass('scroll-action scroll-action-right').on('click', () => this.handleScroll(1)).innerHtml('&rarr;').appendTo($wrapper);

		// Slide 1
		const $slide1 = $('div').addClass('slide slide1').appendTo(this.$content);
		$('div').addClass('slide-image slide-image-1').appendTo($slide1);
		$('div').addClass('slide-message')
			.append($('div').addClass('modal-title').text(localize('sg.onboardingModal.quickopenTitle', "Access every repository you use")))
			.append($('div').innerHtml(localize('sg.onboardingModal.quickopenBody', "Instantly jump to any open source GitHub.com repository with a quick search, or add your local private workspaces.")))
			.appendTo($slide1);

		// Slide 2
		const $slide2 = $('div').addClass('slide slide2').appendTo(this.$content);
		$('div').addClass('slide-image slide-image-2').appendTo($slide2);
		$('div').addClass('slide-message')
			.append($('div').addClass('modal-title').text(localize('sg.onboardingModal.searchTitle', "Search everywhere")))
			.append($('div').text(localize('sg.onboardingModal.searchBody', "Run an instant regexp-powered search across all of your repositories at once, and finally find that hidden error message.")))
			.appendTo($slide2);

		// Slide 3
		const $slide3 = $('div').addClass('slide slide3').appendTo(this.$content);
		$('div').addClass('slide-image slide-image-3').appendTo($slide3);
		$('div').addClass('slide-message')
			.append($('div').addClass('modal-title').text(localize('sg.onboardingModal.findRefsTitle', "Hover on code, get usage examples")))
			.append($('div').text(localize('sg.onboardingModal.findRefsBody', "When viewing code, hover to get more information, then click to see local and cross-repository references.")))
			.appendTo($slide3);

		// Slide 4
		const $slide4 = $('div').addClass('slide slide4').appendTo(this.$content);
		$('div').addClass('modal-title')
			.text(localize('sg.onboardingModal.yourTurnTitle', "Now it's your turn"))
			.appendTo($slide4);

		const $slide4message = $('div').addClass('slide-message').appendTo($slide4);
		$('div').addClass('slide-message-title')
			.text(localize('sg.onboardingModal.yourTurnBodyHeader', "Jump into Sourcegraph and start exploring code like a pro!"))
			.appendTo($slide4message);
		$('div')
			.text(localize('sg.onboardingModal.yourTurnFeedback', "Questions or feedback? Click the smiley in the bottom-right corner to tell us what you think."))
			.appendTo($slide4message);
		$('a').addClass('modal-button')
			.innerHtml(localize('sg.onboardingModal.yourTurnBodyButton', "Start using Sourcegraph") + '&nbsp;&nbsp;&rarr;')
			.on('click', () => {
				this.parent.popModal();
				this.telemetryService.publicLog('OnboardingModalCompleted');
			})
			.appendTo($slide4message);

		return TPromise.as(void 0);
	}

	private handleScroll(delta: number): void {
		const numSlides = 4;
		this.currentSlide = Math.min(numSlides - 1, Math.max(0, this.currentSlide + delta));

		if (this.currentSlide === 0) {
			this.$scrollLeft.style({ 'display': 'none' });
		} else if (this.currentSlide === numSlides - 1) {
			this.$scrollRight.style({ 'display': 'none' });
		} else {
			this.$scrollLeft.style({ 'display': '' });
			this.$scrollRight.style({ 'display': '' });
		}

		this.$content.style({
			marginLeft: ((this.currentSlide * 600) * -1) + 'px'
		});

		this.telemetryService.publicLog('OnboardingModalSlideViewed', { currentSlide: this.currentSlide });
	}

}