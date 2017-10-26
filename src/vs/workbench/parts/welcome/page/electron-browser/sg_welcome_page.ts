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
					<div class="recent-repositories-container">
						<div class="padding-around">
							<div class="action-header">ADD RECENT REPOSITORIES</div>
							<div id="recent-repos-spinner" class="loader-icon"></div>
							<div class="recent-repositories-list">
							</div>
						</div>
					</div>
					<div class="branch-list-container">
						<div id="code-review-heaader" class="padding-around">
							<div class="action-header inline-block">CODE FOR REVIEW</div>
							<div id="review-search-action" class="float-right search octicon octicon-search"></div>
						</div>
						<div id="review-branches-spinner" class="loader-icon"></div>
						<ul id="branch-list" class="branch-list no-margin">
						</ul>
						<div class="no-org-container">
							<div class="padding-around">
								<div id="org-help-action" class="padding-vertical">
									<button class="solid">
										<div class="help-icon"></div>
										<span class="detail button-label">${escape(localize('welcomePage.noOrgHelp', "Join or create an organization to start using code comments."))}</span>
									</button>
								</div>
							</div>
						</div>
					</div>
					<div class="add-code-host">
						<div class="padding-around">
							<div class="action-header">Connect your code hosts</div>
							<div class="action-subheader">A GitHub personal access token or Bitbucket app password is required to enable remote repository search.</div>
							<div class="padding-vertical">
								<button data-href="command:github.showCreateAccessTokenWalkthrough">
									<div class="gitHub-icon"></div>
									<span class="detail button-label">${escape(localize('welcomePage.addGitHubToken', "Add GitHub token..."))}</span>
								</button>
							</div>
							<div class="padding-vertical">
								<button data-href="command:bitbucket.showBitbucketAppPasswordWalkthrough">
									<div class="bitbucket-icon"></div>
									<span class="detail button-label">${escape(localize('welcomePage.addBitbuckAppPassword', "Add Bitbucket app password..."))}</span>
								</button>
							</div>
							<div class="padding-vertical">
								<button class="dashed">
									<div class="gitServer-icon"></div>
									<span class="detail button-label">${escape(localize('welcomePage.serverContact', "We support any Git-base server. Contact us for details."))}</span>
								</button>
							</div>
						</div>
					</div>
					</div>
					</div>
					<div class="section action">
						<div class="container">
							<div class="code-comments-container">
								<div class="padding-around">
									<div class="action-header inline-block">RECENT DISCUSSIONS</div>
									<div id="comments-search-action" class="float-right search octicon octicon-search"></div>
								</div>
								<div id="comment-loader" class="loader-icon"></div>
								<ul id="comment-list" class="comment-list-container no-margin">
								</ul>
								<div class="empty-comment-container">
									<div class="padding-around">
										<div class="padding-vertical">
											<button class="solid" data-href="command:workbench.action.inviteTeammate">
												<div class="help-icon"></div>
												<span class="detail button-label">${escape(localize('welcomePage.noCommentsHelp', "Looks like your organization doesn't have any comments. Get started by inviting more teammates."))}</span>
											</button>
										</div>
									</div>
								</div>
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
