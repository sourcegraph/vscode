/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

// This file runs in an Electron webview that is isolated from the extension.
declare function postMessageToExtension(message: string): void;
declare function onMessageFromExtension(callback: (message: string, origin: string) => void): void;
declare function requestLayout(height: number): void;

/**
 * The ability to import interfaces here depends on the global exports variable being defined
 * at runtime before this script executes. This is done in the bootstrap html.
 * TODO(nick): This comment should be removed if/when we do proper packaging.
 */
import { Discussion, DiscussionComment, SubmitCommentMessage, MessageFromExtension, MessageFromWebView } from './interfaces';


function postTypedMessageToExtension(message: MessageFromWebView) {
	postMessageToExtension(JSON.stringify(message));
}

// When our width changes, our content reflows and the height of our content may change.
// If so, we want to resize this zone view to fit our content (so there's no scrolling or
// extraneous empty space).
let lastContentHeight: number = -1;
window.parent.addEventListener('resize', resizeToFit);

function resizeToFit(): void {
	const contentHeight = document.firstElementChild && document.firstElementChild.scrollHeight || 0;
	if (contentHeight !== lastContentHeight) {
		lastContentHeight = contentHeight;
		requestLayout(contentHeight);
	}
}

/**
 * The discussion currently rendered by the webview.
 */
let discussion: Discussion | undefined;

const container = createDiv('discussion');
document.body.appendChild(container);

const commentsContainer = createDiv('comments');
container.appendChild(commentsContainer);

const form = document.createElement('form');
container.appendChild(form);

const textArea = document.createElement('textarea');
form.appendChild(textArea);
textArea.focus();
textArea.setSelectionRange(0, 0);
textArea.addEventListener('input', resizeTextArea);
function resizeTextArea() {
	textArea.style.height = '90px'; /* reset to minimum height */
	textArea.style.height = textArea.scrollHeight + 'px';
	resizeToFit();
}
resizeTextArea();

const submitArea = createDiv('submit');
form.appendChild(submitArea);

const hint = createDiv('hint');
submitArea.appendChild(hint);

// TODO(nick): handle discard click
// const discard = document.createElement('button');
// discard.innerHTML = 'Discard';
// discard.className = 'secondary';
// submitArea.appendChild(discard);

const submit = document.createElement('input');
submit.type = 'submit';
submit.value = 'Comment';
submitArea.appendChild(submit);

form.addEventListener('submit', event => {
	event.preventDefault();
	if (submit.disabled) {
		// Prevent duplicate submits.
		return;
	}
	submit.disabled = true;
	postTypedMessageToExtension(<SubmitCommentMessage>{
		type: 'submitComment',
		body: textArea.value,
	});
});

onMessageFromExtension(json => {
	const message = JSON.parse(json) as MessageFromExtension;
	switch (message.type) {
		case 'renderDiscussion':
			discussion = message.discussion;
			render();
			break;
		case 'submitCommentSuccess':
			discussion = message.discussion;
			textArea.value = '';
			submit.disabled = false;
			render();
			break;
		case 'submitCommentError':
			submit.disabled = false;
			break;
	}
});

function render() {
	while (commentsContainer.firstChild) {
		commentsContainer.removeChild(commentsContainer.firstChild);
	}
	const comments = discussion && discussion.comments || [];
	for (const comment of comments) {
		commentsContainer.appendChild(createCommentElement(comment));

		const border = createDiv('border');
		commentsContainer.appendChild(border);
	}
	textArea.placeholder = discussion ? 'Reply...' : 'Leave a comment...';
	resizeToFit();
}

function createCommentElement(comment: DiscussionComment): HTMLElement {
	const commentElement = createDiv('comment');

	const header = createDiv('header');
	commentElement.appendChild(header);

	const author = createDiv('author');
	author.appendChild(document.createTextNode(comment.author.login));
	header.appendChild(author);

	// TODO(nick): format as time ago string using date-fns (e.g. "1 day ago").
	const timeAgo = createDiv('timeAgo');
	timeAgo.appendChild(document.createTextNode(comment.createdAt.toString()));
	header.appendChild(timeAgo);

	const contents = createDiv('contents');
	// TODO(nick): render markdown
	contents.appendChild(document.createTextNode(comment.contents));
	commentElement.appendChild(contents);

	return commentElement;
}

function createDiv(className: string): HTMLDivElement {
	const div = document.createElement('div');
	div.className = className;
	return div;
}