/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
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
		<div>
			<div class="title">
				<div class="head-logo"></div>
				<div class="nav">
					<ul>
						<li><a href="https://about.sourcegraph.com/about">About</a></li>
						<li><a href="https://about.sourcegraph.com/product">Product</a></li>
						<li><a href="https://about.sourcegraph.com/blog">Blog</a></li>
						<li><a href="https://about.sourcegraph.com/pricing">Pricing</a></li>
						<li><a href="https://about.sourcegraph.com/jobs">Careers</a></li>
					</ul>
					<ul class="login">
						<li><a class="sg-inactive">Sign in</a></li>
						<li><a class="sg-inactive">Sign up</a></li>
					</ul>
				</div>
			</div>
			<div class="row">
				<div class="splash first">
					<div class="section start commands">
						<ul>
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
					<div class="section recent commands">
						<h2 class="caption">${escape(localize('welcomePage.recent', "Recent workspaces and folders"))}</h2>

						<ul class="list">
							<!-- Filled programmatically -->
							<li class="moreRecent"><a href="command:workbench.action.openRecent">${escape(localize('welcomePage.moreRecent', "More..."))}</a><span class="path detail if_shortcut" data-command="workbench.action.openRecent">(<span class="shortcut" data-command="workbench.action.openRecent"></span>)</span></li>
						</ul>
						<ul class="none detail">
							<li>
								<button>
									<div class="icon-container">
										<div class="btn-icon list-icon"></div>
									</div>
									<div class="button-label">
										<h3 class="caption">${escape(localize('welcomePage.noRecentFolders', "Nothing recent"))}</h3>
										<span class="detail">${escape(localize('welcomePage.openToGetStarted', "Open a local folder or remote repository to get started"))}</span>
									</div>
								</button>
							</li>
						</ul>
					</div>
					<div class="section public-workspaces">
						<h2>Public workspaces</h2>
						<p class="detail">Try Sourcegraph on these popular open-source projects</p>
						<ul class="public-workspace-list">
						</ul>
					</div>
				</div>
				<div class="splash last">
					<div class="section workspaces commands">
						<h2>Team workspaces</h2>
						<ul>
							<li>
								<button class="sg-inactive">
									<div class="icon-container">
										<div class="btn-icon friends-icon"></div>
									</div>
									<div class="button-label">
										<h3 class="caption">${escape(localize('welcomePage.SignedOut', "Signed out"))}</h3>
										<span class="detail">${escape(localize('welcomePage.SignInWorkspaces', "Sign in to Sourcegraph to see all of your team's shared workspaces"))}</span>
									</div>
								</button>
							</li>
						</ul>
					</div>
					<div class="section comments commands">
						<h2>Recent team comments</h2>
						<ul>
							<li>
								<button class="sg-inactive">
									<div class="icon-container">
										<div class="btn-icon friends-icon"></div>
									</div>
									<div class="button-label">
										<h3 class="caption">${escape(localize('welcomePage.SignedOut', "Signed out"))}</h3>
										<span class="detail">${escape(localize('welcomePage.SignInComments', "Sign in to Sourcegraph to see your team's recent comments"))}</span>
									</div>
								</button>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</div>
		<div class="row footer">
			<div><p class="showOnStartup"><input type="checkbox" id="showOnStartup"> <label class="caption" for="showOnStartup">${escape(localize('welcomePage.showOnStartup', "Show welcome page on startup"))}</label></p></div>
			<div class="commands customize">
				<ul>
					<li class="showInteractivePlayground">
						<button data-href="command:sg.modal.showOnboardingModal">
							<h3 class="caption">${escape(localize('welcomePage.interactivePlayground', "Learn how to use Sourcegraph"))}</h3>
							<span class="detail">${escape(localize('welcomePage.interactivePlaygroundDescription', "Try essential editor features out in a short walkthrough"))}</span>
						</button>
					</li>
					<li class="showLanguageExtensions">
						<button role="group" data-href="command:workbench.extensions.action.showLanguageExtensions">
							<h3 class="caption">${escape(localize('welcomePage.installExtensionPacks', "Tools and languages"))}</h3>
							<span class="detail">${escape(localize('welcomePage.installExtensionPacksDescription', "Install support for {0} and {1}"))
		.replace('{0}', `<span class="extensionPackList"></span>`)
		.replace('{1}', `<a href="command:workbench.extensions.action.showLanguageExtensions">${escape(localize('welcomePage.moreExtensions', "more"))}</a>`)}
							</span>
						</button>
					</li>
					<li class="showRecommendedKeymapExtensions">
						<button role="group" data-href="command:workbench.extensions.action.showRecommendedKeymapExtensions">
							<h3 class="caption">${escape(localize('welcomePage.installKeymapDescription', "Install keyboard shortcuts"))}</h3>
							<span class="detail">${escape(localize('welcomePage.installKeymapExtension', "Install the keyboard shortcuts of {0} and {1}"))
		.replace('{0}', `<span class="keymapList"></span>`)
		.replace('{1}', `<a href="command:workbench.extensions.action.showRecommendedKeymapExtensions">${escape(localize('welcomePage.others', "others"))}</a>`)}
							</span>
						</button>
					</li>
					<li class="selectTheme">
						<button data-href="command:workbench.action.selectTheme">
							<h3 class="caption">${escape(localize('welcomePage.colorTheme', "Color theme"))}</h3>
							<span class="detail">${escape(localize('welcomePage.colorThemeDescription', "Make the editor and your code look the way you love"))}</span>
						</button>
					</li>
					<li class="showInteractivePlayground">
						<button data-href="https://about.sourcegraph.com/integrations/browser">
							<h3 class="caption">${escape(localize('welcomePage.getBrowserExtension', "Get Sourcegraph on GitHub"))}</h3>
							<span class="detail">${escape(localize('welcomePage.getBrowserExtensionDescription', "Browse GitHub with code intelligence and code search"))}</span>
						</button>
					</li>
				</ul>
			</div>
		</div>
	</div>
</div>
`;