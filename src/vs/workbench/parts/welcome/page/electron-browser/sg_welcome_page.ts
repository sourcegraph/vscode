/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { escape } from 'vs/base/common/strings';
import { localize } from 'vs/nls';

export function used() {
}

export default () => `
<div class="welcomePageContainer">
	<div class="welcomePage">
		<div class="header">
			<div class="head-logo"></div>
			<div class="section start commands">
				<ul class="no-margin">
					<li>
						<button data-href="command:workbench.action.addRootFolder">
							<div class="folder-icon"></div>
							<span class="detail button-label">${escape(localize('welcomePage.openFolder', "Add folder to workspace..."))}</span>
						</button>
					</li>
					<li>
						<button data-href="command:workbench.action.openRepo">
							<div class="repo-icon"></div>
							<span class="detail button-label">${escape(localize('welcomePage.cloneGitRepository', "Open remote repository..."))}
						</button>
					</li>
				</ul>
			</div>
		</div>
		<div class="space-around row">
			<div class="section action">
				<div class="container">
					<div class="code-comments-container">
						<div class="padding-around">
							<div class="action-header">CODE DISCUSSIONS</div>
							<input class="comment-search-input" id="comment-input-element" placeholder="Search and filter..."/>
						</div>
						<div id="comment-loader" class="loader-icon"></div>
						<ul id="comment-list" class="comment-list-container no-margin">
						</ul>
					</div>
					<div class="sign-in-container">
						<div class="padding-around">
							<div class="action-header">Connect your profile</div>
							<div class="action-subheader">Sign in or sign up to Sourcegraph and create or join an organization to share configs with other developers: lists of active repositories, connections to code hosts, organization-wide tasks/scripts, and auto-installed extensions.</div>
							<div class="padding-vertical">
								<button class="signup" data-href="command:remote.auth.signInAction">
									<div class="signup-icon"></div>
									<span class="detail signup button-label">${escape(localize('welcomePage.signInOrSignUp', "Sign in or sign up to Sourcegraph..."))}</span>
								</button>
							</div>
							<div class="padding-vertical"/>
							<div class="padding-vertical">
								<button class="solid" data-href="command:remote.auth.signInAction">
									<div class="help-icon"></div>
									<span class="detail button-label">${escape(localize('welcomePage.signinHelp', "Existing users who signed in via GitHub: please sign up for a Sourcegraph account."))}</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
	</div>
</div>
`;