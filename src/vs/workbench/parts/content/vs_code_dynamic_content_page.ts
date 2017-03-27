/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

export let content: string;

export function setContent(content: string) {
	this.content = content;
}

export function used() {
}

export default () => `
<div class="welcomePageContainer">
	<div class="welcomePage">
	${content}
	</div>
</div>
`;