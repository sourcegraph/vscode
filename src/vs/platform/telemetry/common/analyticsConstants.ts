/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export enum WindowLevel {
	Main = 'main',
	Workbench = 'workbench',
	SharedProcess = 'sharedProcess'
};

export interface EventMapEntry {
	/**
	 * The high-level category that the event belongs to
	 */
	eventCategory: EventCategory;

	/**
	 * The actual user action that triggered the event
	 */
	eventAction: EventAction;

	/**
	 * The specific product feature that the event is connected to, such as the extension name, the UI element, etc.
	 */
	eventFeature?: EventFeature;

	/**
	 * Indicates whether this event should be sent to Sourcegraph's external tracking services
	 */
	shouldLog?: boolean;

	/**
	 * Indicates whether this event should only be logged at the top level of VSCode, not from iframes.
	 * These events are typically those that would originate at the top level, and then cascade downwards,
	 * 	such as events driven by URL changes, events driven by 3rd party services (like Intercom), etc.
	 */
	topLevelOnly?: boolean;
};

export enum EventCategory {
	/**
	 * Pageview events
	 * Note these are handled specially by the Sourcegraph event logger, and should not be assigned to
	 * new events without review
	 */
	View = 'View',
	/**
	 * Action executed events
	 * Note these are handled specially by the Sourcegraph event logger, and should not be assigned to
	 * new events without review
	 */
	ActionExecuted = 'ActionExecuted',

	/**
	 * Events on cross-site navigation elements
	 */
	Nav = 'Nav',
	/**
	 * Events on static/specific HTML pages
	 */
	Pages = 'Pages',
	/**
	 * Events on user profile/settings/org pages
	 */
	Settings = 'Settings',

	/**
	 * Events related to the authentication process
	 */
	Auth = 'Auth',

	/**
	 * Events related to Sourcegraph organizations
	 */
	Orgs = 'Orgs',

	/**
	 * Events related to code comments.
	 */
	CodeComments = 'CodeComments',

	/**
	 * Events related to the workspace.
	 */
	Workspace = 'Workspace',

	/**
	 * Events related to the post-auth signup flow
	 */
	Onboarding = 'Onboarding',
	/**
	 * Events related to marketing, re-engagement or re-targeting, or growth initiatives
	 */
	Marketing = 'Marketing',
	/**
	 * Events related to sales or online billing
	 */
	Billing = 'Billing',

	/**
	 * Events related to user state
	 */
	UserState = 'UserState',

	/**
	 * Launcher events
	 */
	Launcher = 'Launcher',
	/**
	 * Events on repository pages
	 */
	Repository = 'Repository',
	/**
	 * Events in VSCode's core editor experience
	 */
	Editor = 'Editor',
	/**
	 * Events in VSCode's editor sidebar
	 */
	EditorSidebar = 'Editor.Sidebar',
	/**
	 * Events in (or related to) VSCode's extensions
	 */
	Extension = 'Extension',
	/**
	 * Events related to any form of search (quick opens, in-repo search, global search, etc)
	 */
	Search = 'Search',
	/**
	 * Events related to any form of sharing (links, invitations, etc)
	 */
	Sharing = 'Sharing',
	/**
	 * Events related to providing feedback
	 */
	Feedback = 'Feedback',

	/**
	 * Events related to VSCode internals
	 */
	VSCodeInternal = 'VSCodeInternal',
	/**
	 * Events related to VSCode keybindings
	 */
	Keys = 'Keys',
	/**
	 * Events related to VSCode performance timing/tracking
	 */
	Performance = 'Performance',

	/**
	 * Events from external applications or pages
	 */
	External = 'External',
	/**
	 * Other/misc
	 */
	Unknown = 'Unknown',
};


export enum EventAction {
	/**
	 * Select a result, choice, etc
	 */
	Select = 'Select',
	/**
	 * Click on a button, link, etc
	 */
	Click = 'Click',
	/**
	 * Hover over something
	 */
	Hover = 'Hover',
	/**
	 * Toggle an on/off switch
	 */
	Toggle = 'Toggle',

	/**
	 * Initiate an action, such as a search
	 */
	Initiate = 'Initiate',
	/**
	 * Open a window, modal, etc
	 */
	Open = 'Open',
	/**
	 * Close a window, modal, etc
	 */
	Close = 'Close',

	/**
	 * Submit a form
	 */
	Submit = 'Submit',
	/**
	 * Receive a successful response
	 */
	Success = 'Success',
	/**
	 * Receive an error response
	 */
	Error = 'Error',

	SignUp = 'SignUp',
	SignIn = 'SignIn',
	SignOut = 'SignOut',

	/**
	 *  Get redirected from one page or location to another
	 */
	Redirect = 'Redirect',

	/**
	 * An event that occurs in the background, with no user input
	 */
	Passive = 'Passive',
	Unknown = 'Unknown',
};

export enum EventFeature {
	SidebarFileTree = 'Viewlet.FileTree',
	SidebarSearch = 'Viewlet.Search',
	SidebarExtensions = 'Viewlet.Extensions',
	RiftReferences = 'Rift.References',
	QuickOpen = 'QuickOpen',
	Editor = 'Editor',
	EditorAutocomplete = 'Editor.Autocomplete',
	EditorSuggestions = 'Editor.Suggestions',
	ExtensionsAuthorship = 'Extensions.Authorship',
	InviteModal = 'InviteModal',
	OnboardingModal = 'OnboardingModal',
	PromptInstallModal = 'PromptInstallModal',
	Reminder = 'Reminder',
	SignInModal = 'SignInModal',
};

export const SOURCEGRAPH_EVENT_DEFAULT_MAP: EventMapEntry = { eventCategory: EventCategory.Unknown, eventAction: EventAction.Unknown };

/**
 * When an editorActionInvoked event is logged, Action ID's listed here will
 * be elevated and logged as first-class events. The original event will not be logged.
 */
export const SOURCEGRAPH_EAI_ACTION_IDS_TO_ELEVATE: { [id: string]: EventMapEntry } = {
	// Go to definition
	'editor.action.goToDeclaration': { eventCategory: EventCategory.Editor, eventAction: EventAction.Click },
	// Peek definition
	'editor.action.previewDeclaration': { eventCategory: EventCategory.Editor, eventAction: EventAction.Click },
	// Find all references
	'editor.action.referenceSearch.trigger': { eventCategory: EventCategory.Editor, eventAction: EventAction.Click },
};

/**
 * SOURCEGRAPH_EVENT_MAP is a map from the native VSCode eventName properties passed to the TelemetryService.publicLog method to
 * higher-level event categories, user actions, and, where relevant, product features
 */
export const SOURCEGRAPH_EVENT_MAP: { [eventName: string]: EventMapEntry } = {
	// Generic events
	'editorActionInvoked': { eventCategory: EventCategory.ActionExecuted, eventAction: EventAction.Unknown },
	'workbenchActionExecuted': { eventCategory: EventCategory.ActionExecuted, eventAction: EventAction.Unknown },
	'launcherActionExecuted': { eventCategory: EventCategory.ActionExecuted, eventAction: EventAction.Unknown },

	// Errors
	'UnhandledError': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Error },

	// Hover
	'editor.contentHoverWidgetDisplayed': { eventCategory: EventCategory.Editor, eventAction: EventAction.Hover },

	// Launcher/startup events
	'optInStatus': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive },
	'workbenchEditorConfiguration': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive, shouldLog: false },
	'autoSave': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive, shouldLog: false },

	// Editor management
	'activatePlugin': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown, shouldLog: false },
	'workspaceLoad': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'editorOpened': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown, eventFeature: EventFeature.Editor, shouldLog: false },
	'editorClosed': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown, eventFeature: EventFeature.Editor, shouldLog: false },
	'workbenchSideEditorOpened': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown, eventFeature: EventFeature.Editor },
	'windowOpened': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown, shouldLog: false },

	// Sidebar
	'compositeOpen': { eventCategory: EventCategory.EditorSidebar, eventAction: EventAction.Unknown, shouldLog: false },
	'compositeShown': { eventCategory: EventCategory.EditorSidebar, eventAction: EventAction.Unknown, shouldLog: false },

	// Keys
	// not logging these now, but maybe in the future if we offer this?
	'keyboardLayout': { eventCategory: EventCategory.Keys, eventAction: EventAction.Unknown, shouldLog: false },
	'updateKeybindings': { eventCategory: EventCategory.Keys, eventAction: EventAction.Unknown, shouldLog: false },
	'customKeybindingsChanged': { eventCategory: EventCategory.Keys, eventAction: EventAction.Unknown, shouldLog: false },

	// Performance
	'startupTime': { eventCategory: EventCategory.Performance, eventAction: EventAction.Passive },
	'perf:invalidTimers': { eventCategory: EventCategory.Performance, eventAction: EventAction.Passive, shouldLog: false },
	'perf:jsFileSize': { eventCategory: EventCategory.Performance, eventAction: EventAction.Passive, shouldLog: false },

	// User state
	'UserIdleStart': { eventCategory: EventCategory.UserState, eventAction: EventAction.Passive, topLevelOnly: true },
	'UserIdleStop': { eventCategory: EventCategory.UserState, eventAction: EventAction.Passive, topLevelOnly: true },

	// Code comments
	'codeComments.replyToThread': { eventCategory: EventCategory.CodeComments, eventAction: EventAction.Submit },
	'codeComments.cancelCreateThread': { eventCategory: EventCategory.CodeComments, eventAction: EventAction.Close },
	'codeComments.openCreateThreadView': { eventCategory: EventCategory.CodeComments, eventAction: EventAction.Open },
	'codeComments.createThread': { eventCategory: EventCategory.CodeComments, eventAction: EventAction.Submit },
	'codeComments.openViewlet': { eventCategory: EventCategory.CodeComments, eventAction: EventAction.Open },
	'codeComments.viewThread': { eventCategory: EventCategory.CodeComments, eventAction: EventAction.Open },

	// Workspace Sharing
	'workspace.import': { eventCategory: EventCategory.Workspace, eventAction: EventAction.Open },
	'workspace.export': { eventCategory: EventCategory.Workspace, eventAction: EventAction.Submit },

	// In repo search
	'search.useIgnoreFiles.toggled': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarSearch },
	'search.useExcludeSettings.toggled': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarSearch },
	'replace.open.previewEditor': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarSearch },
	'replaceAll.action.selected': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarSearch },
	'replace.action.selected': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarSearch },
	'search.toggleQueryDetails': { eventCategory: EventCategory.Search, eventAction: EventAction.Toggle, eventFeature: EventFeature.SidebarSearch },
	'searchResultChosen': { eventCategory: EventCategory.Search, eventAction: EventAction.Select, eventFeature: EventFeature.SidebarSearch, shouldLog: false },
	'replaceAll.started': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarSearch }, // don't show?
	'searchResultsFirstRender': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarSearch, shouldLog: false }, // perf-related search events not interesting
	'searchResultsFinished': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarSearch, shouldLog: false }, // perf-related search events not interesting
	'searchResultsShown': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarSearch },
	'codeSearch.search': { eventCategory: EventCategory.Search, eventAction: EventAction.Initiate, eventFeature: EventFeature.SidebarSearch },
	'codeSearch.openResult': { eventCategory: EventCategory.Search, eventAction: EventAction.Select, eventFeature: EventFeature.SidebarSearch },

	// Quickopen
	'quickOpenWidgetShown': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.QuickOpen },
	'quickOpenWidgetItemAccepted': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.QuickOpen },
	'quickOpenWidgetCancelled': { eventCategory: EventCategory.Search, eventAction: EventAction.Unknown, eventFeature: EventFeature.QuickOpen },
	'openAnything': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown, shouldLog: false },

	// Config
	'updateConfiguration': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive },
	'updateConfigurationValues': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive },
	'shutdown': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive, shouldLog: false },
	'update:notAvailable': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive },
	'update:downloaded': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive },
	'registerSCMProvider': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive, shouldLog: false },
	'api.deprecated': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Passive },

	// Rift view
	'zoneWidgetShown': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },
	'findReferences': { eventCategory: EventCategory.Editor, eventAction: EventAction.Submit, eventFeature: EventFeature.RiftReferences, shouldLog: false },

	// Misc internal/passive/uninteresting
	'suggestSnippetInsert': { eventCategory: EventCategory.Editor, eventAction: EventAction.Passive, eventFeature: EventFeature.EditorAutocomplete },
	'suggestWidget': { eventCategory: EventCategory.Editor, eventAction: EventAction.Passive, eventFeature: EventFeature.EditorSuggestions },
	'suggestWidget:toggleDetails': { eventCategory: EventCategory.Editor, eventAction: EventAction.Passive, eventFeature: EventFeature.EditorSuggestions },
	'galleryService:query': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'galleryService:downloadVSIX': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'galleryService:requestError': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'galleryService:cdnFallback': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },

	'saveParticipantStats': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown, shouldLog: false },
	'workbenchEditorMaximized': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },

	'cachedDataInfo': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown, shouldLog: false },
	'nodeCachedData': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'debugConfigure': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'debug/addLaunchConfiguration': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'debugSessionStart': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'debugMisconfiguration': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'debugSessionStop': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'debugProtocolErrorResponse': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'emmetActionCompleted': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'emmetActionSucceeded': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },

	'extensionGallery:openExtension': { eventCategory: EventCategory.Extension, eventAction: EventAction.Unknown },
	'extensionRecommendations:open': { eventCategory: EventCategory.Extension, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarExtensions },
	'extensionWorkspaceRecommendations:open': { eventCategory: EventCategory.Extension, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarExtensions },
	'extensionKeymapRecommendations:open': { eventCategory: EventCategory.Extension, eventAction: EventAction.Unknown, eventFeature: EventFeature.SidebarExtensions },

	'disableOtherKeymapsConfirmation': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'disableOtherKeymaps': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },

	'extension:enable': { eventCategory: EventCategory.Extension, eventAction: EventAction.Unknown },
	'extension:disable': { eventCategory: EventCategory.Extension, eventAction: EventAction.Unknown },
	'extensionGallery:install': { eventCategory: EventCategory.Extension, eventAction: EventAction.Unknown },
	'extensionGallery:update': { eventCategory: EventCategory.Extension, eventAction: EventAction.Unknown },
	'extensionGallery:uninstall': { eventCategory: EventCategory.Extension, eventAction: EventAction.Unknown },
	'extensionsScanned': { eventCategory: EventCategory.Extension, eventAction: EventAction.Passive, shouldLog: false },
	'apiUsage': { eventCategory: EventCategory.Extension, eventAction: EventAction.Passive, shouldLog: false },

	'gitClone': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'previewHtml': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown, shouldLog: false },
	'problems.marker.opened': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },
	'problems.used': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },
	'problems.collapseAll.used': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },
	'problems.filter': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },

	'keybindings.filter': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },

	'defaultSettings.filter': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },
	'defaultSettingsActions.copySetting': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },
	'openKeybindings': { eventCategory: EventCategory.Editor, eventAction: EventAction.Unknown },

	'taskService': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },

	'workspace.settings.unsupported.review': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'workspace.settings.unsupported.documentation': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'workspace.settings.unsupported.ignore': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'workspace.settings.unsupported.warning': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },

	'installKeymap': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'installedKeymap': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'revealInDocument': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'openExternal': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'walkThroughSnippetInteraction': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'resolvingInput': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown, shouldLog: false },
	'disposingInput': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown, shouldLog: false },

	'workspce.tags': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown, shouldLog: false },
	'workspace.remotes': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'workspace.azure': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'workspace.hashedRemotes': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },

	'fileGet': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown, shouldLog: false },
	'filePUT': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown, shouldLog: false },
	'hotExit:triggered': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },

	'keybindings.editor.defineKeybinding': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'keybindings.editor.removeKeybinding': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'keybindings.editor.resetKeybinding': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },
	'keybindings.editor.copyKeybindingEntry': { eventCategory: EventCategory.VSCodeInternal, eventAction: EventAction.Unknown },

	// TODO(Dan): pare these down to what gets carried over
	// Sourcegraph specific events

	// Auth/user
	'SignupCompleted': { eventCategory: EventCategory.Auth, eventAction: EventAction.SignUp, topLevelOnly: true },
	'CompletedGitHubOAuth2Flow': { eventCategory: EventCategory.Auth, eventAction: EventAction.SignIn, topLevelOnly: true },
	'LogoutClicked': { eventCategory: EventCategory.Auth, eventAction: EventAction.SignOut, topLevelOnly: true },
	'RemoteSettingsOpened': { eventCategory: EventCategory.External, eventAction: EventAction.Click, topLevelOnly: true },
	'SignInModalInitiated': { eventCategory: EventCategory.Auth, eventAction: EventAction.Click, eventFeature: EventFeature.SignInModal },
	'CurrentUserSignedIn': { eventCategory: EventCategory.Auth, eventAction: EventAction.Submit },
	'CurrentUserSignedOut': { eventCategory: EventCategory.Auth, eventAction: EventAction.Submit },
	'CurrentUserChanged': { eventCategory: EventCategory.Auth, eventAction: EventAction.Submit },

	// Orgs
	'CurrentOrgChanged': { eventCategory: EventCategory.Orgs, eventAction: EventAction.Submit },

	// Redirects
	'EmailInviteClicked': { eventCategory: EventCategory.Marketing, eventAction: EventAction.Redirect, topLevelOnly: true },
	'RepoBadgeRedirected': { eventCategory: EventCategory.External, eventAction: EventAction.Redirect, topLevelOnly: true },
	'OpenAtCursor': { eventCategory: EventCategory.External, eventAction: EventAction.Redirect, topLevelOnly: true },
	'OpenWorkspace': { eventCategory: EventCategory.External, eventAction: EventAction.Redirect, topLevelOnly: true },
	'OpenFile': { eventCategory: EventCategory.External, eventAction: EventAction.Redirect, topLevelOnly: true },

	// Modals
	'OnboardingModalInitiated': { eventCategory: EventCategory.Onboarding, eventAction: EventAction.Initiate, eventFeature: EventFeature.OnboardingModal },
	'OnboardingModalSlideViewed': { eventCategory: EventCategory.Onboarding, eventAction: EventAction.Click, eventFeature: EventFeature.OnboardingModal },
	'OnboardingModalCompleted': { eventCategory: EventCategory.Onboarding, eventAction: EventAction.Close, eventFeature: EventFeature.OnboardingModal },

	'MessageRendered': { eventCategory: EventCategory.Editor, eventAction: EventAction.Error },

	// Marketing/reminders
	'BrowserExtReminderViewed': { eventCategory: EventCategory.Marketing, eventAction: EventAction.Passive, eventFeature: EventFeature.Reminder },
	'BrowserExtReminderSkipped': { eventCategory: EventCategory.Marketing, eventAction: EventAction.Passive, eventFeature: EventFeature.Reminder },
	'BrowserExtInstallClicked': { eventCategory: EventCategory.Marketing, eventAction: EventAction.Click, eventFeature: EventFeature.Reminder },
	'BrowserExtInstallFailed': { eventCategory: EventCategory.Marketing, eventAction: EventAction.Error, eventFeature: EventFeature.Reminder },
	'BrowserExtInstallSuccess': { eventCategory: EventCategory.Marketing, eventAction: EventAction.Success, eventFeature: EventFeature.Reminder },

	// View events, handled specially by the Sourcegraph event logger
	'ViewFile': { eventCategory: EventCategory.View, eventAction: EventAction.Unknown },
};
