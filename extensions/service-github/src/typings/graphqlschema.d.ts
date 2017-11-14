// tslint:disable
// graphql typescript definitions

declare namespace GitHubGQL {
  interface IGraphQLResponseRoot {
    data?: IQuery | IMutation;
    errors?: Array<IGraphQLResponseError>;
  }

  interface IGraphQLResponseError {
    message: string;            // Required for all errors
    locations?: Array<IGraphQLResponseErrorLocation>;
    [propName: string]: any;    // 7.2.2 says 'GraphQL servers may provide additional entries to error'
  }

  interface IGraphQLResponseErrorLocation {
    line: number;
    column: number;
  }

  /**
    description: The query root of GitHub's GraphQL interface.
  */
  interface IQuery {
    __typename: "Query";
    /**
    description: Look up a code of conduct by its key
  */
    codeOfConduct: ICodeOfConduct | null;
    /**
    description: Look up a code of conduct by its key
  */
    codesOfConduct: Array<ICodeOfConduct> | null;
    /**
    description: Look up an open source license by its key
  */
    license: ILicense | null;
    /**
    description: Return a list of known open source licenses
  */
    licenses: Array<ILicense>;
    /**
    description: Return information about the GitHub instance
  */
    meta: IGitHubMetadata;
    /**
    description: Fetches an object given its ID.
  */
    node: Node | null;
    /**
    description: Lookup nodes by a list of IDs.
  */
    nodes: Array<Node>;
    /**
    description: Lookup a organization by login.
  */
    organization: IOrganization | null;
    /**
    description: The client's rate limit information.
  */
    rateLimit: IRateLimit | null;
    /**
    description: Hack to workaround https://github.com/facebook/relay/issues/112 re-exposing the root query object
  */
    relay: IQuery;
    /**
    description: Lookup a given repository by the owner and repository name.
  */
    repository: IRepository | null;
    /**
    description: Lookup a repository owner (ie. either a User or an Organization) by login.
  */
    repositoryOwner: RepositoryOwner | null;
    /**
    description: Lookup resource by a URL.
  */
    resource: UniformResourceLocatable | null;
    /**
    description: Perform a search across resources.
  */
    search: ISearchResultItemConnection;
    /**
    description: Look up a topic by name.
  */
    topic: ITopic | null;
    /**
    description: Lookup a user by login.
  */
    user: IUser | null;
    /**
    description: The currently authenticated user.
  */
    viewer: IUser;
  }

  /**
    description: The Code of Conduct for a repository
  */
  interface ICodeOfConduct {
    __typename: "CodeOfConduct";
    /**
    description: The body of the CoC
  */
    body: string | null;
    /**
    description: The key for the CoC
  */
    key: string;
    /**
    description: The formal name of the CoC
  */
    name: string;
    /**
    description: The path to the CoC
  */
    url: any | null;
  }

  /**
    description: A respository's open source license
  */
  interface ILicense {
    __typename: "License";
    /**
    description: The full text of the license
  */
    body: string;
    /**
    description: The conditions set by the license
  */
    conditions: Array<ILicenseRule>;
    /**
    description: A human-readable description of the license
  */
    description: string | null;
    /**
    description: Whether the license should be featured
  */
    featured: boolean;
    /**
    description: Whether the license should be displayed in license pickers
  */
    hidden: boolean;
    id: string;
    /**
    description: Instructions on how to implement the license
  */
    implementation: string | null;
    /**
    description: The lowercased SPDX ID of the license
  */
    key: string;
    /**
    description: The limitations set by the license
  */
    limitations: Array<ILicenseRule>;
    /**
    description: The license full name specified by <https://spdx.org/licenses>
  */
    name: string;
    /**
    description: Customary short name if applicable (e.g, GPLv3)
  */
    nickname: string | null;
    /**
    description: The permissions set by the license
  */
    permissions: Array<ILicenseRule>;
    /**
    description: Short identifier specified by <https://spdx.org/licenses>
  */
    spdxId: string | null;
    /**
    description: URL to the license on <https://choosealicense.com>
  */
    url: any | null;
  }

  /**
    description: Describes a License's conditions, permissions, and limitations
  */
  interface ILicenseRule {
    __typename: "LicenseRule";
    /**
    description: A description of the rule
  */
    description: string;
    /**
    description: The machine-readable rule key
  */
    key: string;
    /**
    description: The human-readable rule label
  */
    label: string;
  }

  /**
    description: Represents information about the GitHub instance.
  */
  interface IGitHubMetadata {
    __typename: "GitHubMetadata";
    /**
    description: Returns a String that's a SHA of `github-services`
  */
    gitHubServicesSha: string;
    /**
    description: IP addresses that users connect to for git operations
  */
    gitIpAddresses: Array<string>;
    /**
    description: IP addresses that service hooks are sent from
  */
    hookIpAddresses: Array<string>;
    /**
    description: IP addresses that the importer connects from
  */
    importerIpAddresses: Array<string>;
    /**
    description: Whether or not users are verified
  */
    isPasswordAuthenticationVerifiable: boolean;
    /**
    description: IP addresses for GitHub Pages' A records
  */
    pagesIpAddresses: Array<string>;
  }

  /**
    description: An object with an ID.
  */
  type Node = IOrganization | IProject | IProjectColumn | IProjectCard | IIssue | IUser | IRepository | ICommitComment | IReaction | ICommit | IStatus | IStatusContext | ITree | IRef | IPullRequest | ILabel | IIssueComment | IPullRequestCommit | IMilestone | IReviewRequest | ITeam | IOrganizationInvitation | IPullRequestReview | IPullRequestReviewComment | ICommitCommentThread | IPullRequestReviewThread | IClosedEvent | IReopenedEvent | ISubscribedEvent | IUnsubscribedEvent | IMergedEvent | IReferencedEvent | ICrossReferencedEvent | IAssignedEvent | IUnassignedEvent | ILabeledEvent | IUnlabeledEvent | IMilestonedEvent | IDemilestonedEvent | IRenamedTitleEvent | ILockedEvent | IUnlockedEvent | IDeployedEvent | IDeployment | IDeploymentStatus | IHeadRefDeletedEvent | IHeadRefRestoredEvent | IHeadRefForcePushedEvent | IBaseRefForcePushedEvent | IReviewRequestedEvent | IReviewRequestRemovedEvent | IReviewDismissedEvent | ILanguage | IProtectedBranch | IPushAllowance | IReviewDismissalAllowance | IRelease | IReleaseAsset | IRepositoryTopic | ITopic | IGist | IGistComment | IOrganizationIdentityProvider | IExternalIdentity | IBlob | IBot | IBaseRefChangedEvent | IAddedToProjectEvent | ICommentDeletedEvent | IConvertedNoteToIssueEvent | IMentionedEvent | IMovedColumnsInProjectEvent | IRemovedFromProjectEvent | IRepositoryInvitation | ITag;

  /**
    description: An object with an ID.
  */
  interface INode {
    __typename: "Node";
    /**
    description: ID of the object.
  */
    id: string;
  }

  /**
    description: An account on GitHub, with one or more owners, that has repositories, members and teams.
  */
  interface IOrganization {
    __typename: "Organization";
    /**
    description: A URL pointing to the organization's public avatar.
  */
    avatarUrl: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The organization's public profile description.
  */
    description: string | null;
    /**
    description: The organization's public email.
  */
    email: string | null;
    id: string;
    /**
    description: The organization's public profile location.
  */
    location: string | null;
    /**
    description: The organization's login name.
  */
    login: string;
    /**
    description: A list of users who are members of this organization.
  */
    members: IUserConnection;
    /**
    description: The organization's public profile name.
  */
    name: string | null;
    /**
    description: The HTTP path creating a new team
  */
    newTeamResourcePath: any;
    /**
    description: The HTTP URL creating a new team
  */
    newTeamUrl: any;
    /**
    description: The billing email for the organization.
  */
    organizationBillingEmail: string | null;
    /**
    description: A list of repositories this user has pinned to their profile
  */
    pinnedRepositories: IRepositoryConnection;
    /**
    description: Find project by number.
  */
    project: IProject | null;
    /**
    description: A list of projects under the owner.
  */
    projects: IProjectConnection;
    /**
    description: The HTTP path listing organization's projects
  */
    projectsResourcePath: any;
    /**
    description: The HTTP URL listing organization's projects
  */
    projectsUrl: any;
    /**
    description: A list of repositories that the user owns.
  */
    repositories: IRepositoryConnection;
    /**
    description: Find Repository.
  */
    repository: IRepository | null;
    /**
    description: The HTTP path for this user
  */
    resourcePath: any;
    /**
    description: The Organization's SAML Identity Providers
  */
    samlIdentityProvider: IOrganizationIdentityProvider | null;
    /**
    description: Find an organization's team by its slug.
  */
    team: ITeam | null;
    /**
    description: A list of teams in this organization.
  */
    teams: ITeamConnection;
    /**
    description: The HTTP path listing organization's teams
  */
    teamsResourcePath: any;
    /**
    description: The HTTP URL listing organization's teams
  */
    teamsUrl: any;
    /**
    description: The HTTP URL for this user
  */
    url: any;
    /**
    description: Organization is adminable by the viewer.
  */
    viewerCanAdminister: boolean;
    /**
    description: Can the current viewer create new projects on this owner.
  */
    viewerCanCreateProjects: boolean;
    /**
    description: Viewer can create repositories on this organization
  */
    viewerCanCreateRepositories: boolean;
    /**
    description: Viewer can create teams on this organization.
  */
    viewerCanCreateTeams: boolean;
    /**
    description: Viewer is a member of this organization.
  */
    viewerIsAMember: boolean;
    /**
    description: The organization's public profile URL.
  */
    websiteUrl: any | null;
  }

  /**
    description: Represents an object which can take actions on GitHub. Typically a User or Bot.
  */
  type Actor = IOrganization | IUser | IBot;

  /**
    description: Represents an object which can take actions on GitHub. Typically a User or Bot.
  */
  interface IActor {
    __typename: "Actor";
    /**
    description: A URL pointing to the actor's public avatar.
  */
    avatarUrl: any;
    /**
    description: The username of the actor.
  */
    login: string;
    /**
    description: The HTTP path for this actor.
  */
    resourcePath: any;
    /**
    description: The HTTP URL for this actor.
  */
    url: any;
  }

  /**
    description: Represents an owner of a Project.
  */
  type ProjectOwner = IOrganization | IRepository;

  /**
    description: Represents an owner of a Project.
  */
  interface IProjectOwner {
    __typename: "ProjectOwner";
    id: string;
    /**
    description: Find project by number.
  */
    project: IProject | null;
    /**
    description: A list of projects under the owner.
  */
    projects: IProjectConnection;
    /**
    description: The HTTP path listing owners projects
  */
    projectsResourcePath: any;
    /**
    description: The HTTP URL listing owners projects
  */
    projectsUrl: any;
    /**
    description: Can the current viewer create new projects on this owner.
  */
    viewerCanCreateProjects: boolean;
  }

  /**
    description: Projects manage issues, pull requests and notes within a project owner.
  */
  interface IProject {
    __typename: "Project";
    /**
    description: The project's description body.
  */
    body: string | null;
    /**
    description: The projects description body rendered to HTML.
  */
    bodyHTML: any;
    /**
    description: `true` if the object is closed (definition of closed may depend on type)
  */
    closed: boolean;
    /**
    description: Identifities the date and time when the project was closed.
  */
    closedAt: any | null;
    /**
    description: List of columns in the project
  */
    columns: IProjectColumnConnection;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: The actor who originally created the project.
  */
    creator: Actor | null;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
    /**
    description: The project's name.
  */
    name: string;
    /**
    description: The project's number.
  */
    number: number;
    /**
    description: The project's owner. Currently limited to repositories and organizations.
  */
    owner: ProjectOwner;
    /**
    description: List of pending cards in this project
  */
    pendingCards: IProjectCardConnection;
    /**
    description: The HTTP path for this project
  */
    resourcePath: any;
    /**
    description: Whether the project is open or closed.
  */
    state: IProjectStateEnum;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this project
  */
    url: any;
    /**
    description: Check if the current viewer can update this object.
  */
    viewerCanUpdate: boolean;
  }

  /**
    description: An object that can be closed
  */
  type Closable = IProject | IIssue | IPullRequest;

  /**
    description: An object that can be closed
  */
  interface IClosable {
    __typename: "Closable";
    /**
    description: `true` if the object is closed (definition of closed may depend on type)
  */
    closed: boolean;
  }

  /**
    description: Entities that can be updated.
  */
  type Updatable = IProject | IIssue | ICommitComment | IPullRequest | IIssueComment | IPullRequestReview | IPullRequestReviewComment | IGistComment;

  /**
    description: Entities that can be updated.
  */
  interface IUpdatable {
    __typename: "Updatable";
    /**
    description: Check if the current viewer can update this object.
  */
    viewerCanUpdate: boolean;
  }

  /**
    description: The connection type for ProjectColumn.
  */
  interface IProjectColumnConnection {
    __typename: "ProjectColumnConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IProjectColumnEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IProjectColumn> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IProjectColumnEdge {
    __typename: "ProjectColumnEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IProjectColumn | null;
  }

  /**
    description: A column inside a project.
  */
  interface IProjectColumn {
    __typename: "ProjectColumn";
    /**
    description: List of cards in the column
  */
    cards: IProjectCardConnection;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
    /**
    description: The project column's name.
  */
    name: string;
    /**
    description: The project that contains this column.
  */
    project: IProject;
    /**
    description: The HTTP path for this project column
  */
    resourcePath: any;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this project column
  */
    url: any;
  }

  /**
    description: The connection type for ProjectCard.
  */
  interface IProjectCardConnection {
    __typename: "ProjectCardConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IProjectCardEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IProjectCard> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IProjectCardEdge {
    __typename: "ProjectCardEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IProjectCard | null;
  }

  /**
    description: A card in a project.
  */
  interface IProjectCard {
    __typename: "ProjectCard";
    /**
    description: The project column this card is associated under. A card may only belong to one
project column at a time. The column field will be null if the card is created
in a pending state and has yet to be associated with a column. Once cards are
associated with a column, they will not become pending in the future.

  */
    column: IProjectColumn | null;
    /**
    description: The card content item
  */
    content: ProjectCardItem | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: The actor who created this card
  */
    creator: Actor | null;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
    /**
    description: The card note
  */
    note: string | null;
    /**
    description: The project that contains this card.
  */
    project: IProject;
    /**
    description: The column that contains this card.
  */
    projectColumn: IProjectColumn;
    /**
    description: The HTTP path for this card
  */
    resourcePath: any;
    /**
    description: The state of ProjectCard
  */
    state: IProjectCardStateEnum | null;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this card
  */
    url: any;
  }

  /**
    description: Types that can be inside Project Cards.
  */
  type ProjectCardItem = IIssue | IPullRequest;



  /**
    description: An Issue is a place to discuss ideas, enhancements, tasks, and bugs for a project.
  */
  interface IIssue {
    __typename: "Issue";
    /**
    description: A list of Users assigned to this object.
  */
    assignees: IUserConnection;
    /**
    description: The actor who authored the comment.
  */
    author: Actor | null;
    /**
    description: Author's association with the subject of the comment.
  */
    authorAssociation: ICommentAuthorAssociationEnum;
    /**
    description: Identifies the body of the issue.
  */
    body: string;
    /**
    description: Identifies the body of the issue rendered to HTML.
  */
    bodyHTML: any;
    /**
    description: Identifies the body of the issue rendered to text.
  */
    bodyText: string;
    /**
    description: `true` if the object is closed (definition of closed may depend on type)
  */
    closed: boolean;
    /**
    description: A list of comments associated with the Issue.
  */
    comments: IIssueCommentConnection;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Check if this comment was created via an email reply.
  */
    createdViaEmail: boolean;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The actor who edited the comment.
  */
    editor: Actor | null;
    id: string;
    /**
    description: A list of labels associated with the object.
  */
    labels: ILabelConnection | null;
    /**
    description: The moment the editor made the last edit
  */
    lastEditedAt: any | null;
    /**
    description: `true` if the object is locked
  */
    locked: boolean;
    /**
    description: Identifies the milestone associated with the issue.
  */
    milestone: IMilestone | null;
    /**
    description: Identifies the issue number.
  */
    number: number;
    /**
    description: A list of Users that are participating in the Issue conversation.
  */
    participants: IUserConnection;
    /**
    description: List of project cards associated with this issue.
  */
    projectCards: IProjectCardConnection;
    /**
    description: Identifies when the comment was published at.
  */
    publishedAt: any | null;
    /**
    description: A list of reactions grouped by content left on the subject.
  */
    reactionGroups: Array<IReactionGroup>;
    /**
    description: A list of Reactions left on the Issue.
  */
    reactions: IReactionConnection;
    /**
    description: The repository associated with this node.
  */
    repository: IRepository;
    /**
    description: The HTTP path for this issue
  */
    resourcePath: any;
    /**
    description: Identifies the state of the issue.
  */
    state: IIssueStateEnum;
    /**
    description: A list of events, comments, commits, etc. associated with the issue.
  */
    timeline: IIssueTimelineConnection;
    /**
    description: Identifies the issue title.
  */
    title: string;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this issue
  */
    url: any;
    /**
    description: Can user react to this subject
  */
    viewerCanReact: boolean;
    /**
    description: Check if the viewer is able to change their subscription status for the repository.
  */
    viewerCanSubscribe: boolean;
    /**
    description: Check if the current viewer can update this object.
  */
    viewerCanUpdate: boolean;
    /**
    description: Reasons why the current viewer can not update this comment.
  */
    viewerCannotUpdateReasons: Array<ICommentCannotUpdateReasonEnum>;
    /**
    description: Did the viewer author this comment.
  */
    viewerDidAuthor: boolean;
    /**
    description: Identifies if the viewer is watching, not watching, or ignoring the repository.
  */
    viewerSubscription: ISubscriptionStateEnum;
  }

  /**
    description: An object that can have users assigned to it.
  */
  type Assignable = IIssue | IPullRequest;

  /**
    description: An object that can have users assigned to it.
  */
  interface IAssignable {
    __typename: "Assignable";
    /**
    description: A list of Users assigned to this object.
  */
    assignees: IUserConnection;
  }

  /**
    description: The connection type for User.
  */
  interface IUserConnection {
    __typename: "UserConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IUserEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IUser> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IUserEdge {
    __typename: "UserEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IUser | null;
  }

  /**
    description: A user is an individual's account on GitHub that owns repositories and can make new content.
  */
  interface IUser {
    __typename: "User";
    /**
    description: A URL pointing to the user's public avatar.
  */
    avatarUrl: any;
    /**
    description: The user's public profile bio.
  */
    bio: string | null;
    /**
    description: The user's public profile bio as HTML.
  */
    bioHTML: any;
    /**
    description: A list of commit comments made by this user.
  */
    commitComments: ICommitCommentConnection;
    /**
    description: The user's public profile company.
  */
    company: string | null;
    /**
    description: The user's public profile company as HTML.
  */
    companyHTML: any;
    /**
    description: A list of repositories that the user recently contributed to.
  */
    contributedRepositories: IRepositoryConnection;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The user's publicly visible profile email.
  */
    email: string;
    /**
    description: A list of users the given user is followed by.
  */
    followers: IFollowerConnection;
    /**
    description: A list of users the given user is following.
  */
    following: IFollowingConnection;
    /**
    description: Find gist by repo name.
  */
    gist: IGist | null;
    /**
    description: A list of gist comments made by this user.
  */
    gistComments: IGistCommentConnection;
    /**
    description: A list of the Gists the user has created.
  */
    gists: IGistConnection;
    id: string;
    /**
    description: Whether or not this user is a participant in the GitHub Security Bug Bounty.
  */
    isBountyHunter: boolean;
    /**
    description: Whether or not this user is a participant in the GitHub Campus Experts Program.
  */
    isCampusExpert: boolean;
    /**
    description: Whether or not this user is a GitHub Developer Program member.
  */
    isDeveloperProgramMember: boolean;
    /**
    description: Whether or not this user is a GitHub employee.
  */
    isEmployee: boolean;
    /**
    description: Whether or not the user has marked themselves as for hire.
  */
    isHireable: boolean;
    /**
    description: Whether or not this user is a site administrator.
  */
    isSiteAdmin: boolean;
    /**
    description: Whether or not this user is the viewing user.
  */
    isViewer: boolean;
    /**
    description: A list of issue comments made by this user.
  */
    issueComments: IIssueCommentConnection;
    /**
    description: A list of issues assocated with this user.
  */
    issues: IIssueConnection;
    /**
    description: The user's public profile location.
  */
    location: string | null;
    /**
    description: The username used to login.
  */
    login: string;
    /**
    description: The user's public profile name.
  */
    name: string | null;
    /**
    description: Find an organization by its login that the user belongs to.
  */
    organization: IOrganization | null;
    /**
    description: A list of organizations the user belongs to.
  */
    organizations: IOrganizationConnection;
    /**
    description: A list of repositories this user has pinned to their profile
  */
    pinnedRepositories: IRepositoryConnection;
    /**
    description: A list of pull requests assocated with this user.
  */
    pullRequests: IPullRequestConnection;
    /**
    description: A list of repositories that the user owns.
  */
    repositories: IRepositoryConnection;
    /**
    description: Find Repository.
  */
    repository: IRepository | null;
    /**
    description: The HTTP path for this user
  */
    resourcePath: any;
    /**
    description: Repositories the user has starred.
  */
    starredRepositories: IStarredRepositoryConnection;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this user
  */
    url: any;
    /**
    description: Whether or not the viewer is able to follow the user.
  */
    viewerCanFollow: boolean;
    /**
    description: Whether or not this user is followed by the viewer.
  */
    viewerIsFollowing: boolean;
    /**
    description: A list of repositories the given user is watching.
  */
    watching: IRepositoryConnection;
    /**
    description: A URL pointing to the user's public website/blog.
  */
    websiteUrl: any | null;
  }

  /**
    description: Represents an owner of a Repository.
  */
  type RepositoryOwner = IOrganization | IUser;

  /**
    description: Represents an owner of a Repository.
  */
  interface IRepositoryOwner {
    __typename: "RepositoryOwner";
    /**
    description: A URL pointing to the owner's public avatar.
  */
    avatarUrl: any;
    id: string;
    /**
    description: The username used to login.
  */
    login: string;
    /**
    description: A list of repositories this user has pinned to their profile
  */
    pinnedRepositories: IRepositoryConnection;
    /**
    description: A list of repositories that the user owns.
  */
    repositories: IRepositoryConnection;
    /**
    description: Find Repository.
  */
    repository: IRepository | null;
    /**
    description: The HTTP URL for the owner.
  */
    resourcePath: any;
    /**
    description: The HTTP URL for the owner.
  */
    url: any;
  }

  /**
    description: The privacy of a repository
  */
  type IRepositoryPrivacyEnum = 'PUBLIC' | 'PRIVATE';

  /**
    description: Ordering options for repository connections
  */
  interface IRepositoryOrder {
    /**
    description: The field to order repositories by.
  */
    field: IRepositoryOrderFieldEnum;
    /**
    description: The ordering direction.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which repository connections can be ordered.
  */
  type IRepositoryOrderFieldEnum = 'CREATED_AT' | 'UPDATED_AT' | 'PUSHED_AT' | 'NAME' | 'STARGAZERS';

  /**
    description: Possible directions in which to order a list of items when provided an `orderBy` argument.
  */
  type IOrderDirectionEnum = 'ASC' | 'DESC';

  /**
    description: The affiliation of a user to a repository
  */
  type IRepositoryAffiliationEnum = 'OWNER' | 'COLLABORATOR' | 'ORGANIZATION_MEMBER';

  /**
    description: A list of repositories owned by the subject.
  */
  interface IRepositoryConnection {
    __typename: "RepositoryConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IRepositoryEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IRepository> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
    /**
    description: The total size in kilobytes of all repositories in the connection.
  */
    totalDiskUsage: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IRepositoryEdge {
    __typename: "RepositoryEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IRepository | null;
  }

  /**
    description: A repository contains the content for a project.
  */
  interface IRepository {
    __typename: "Repository";
    /**
    description: A list of users that can be assigned to issues in this repository.
  */
    assignableUsers: IUserConnection;
    /**
    description: Returns the code of conduct for this repository
  */
    codeOfConduct: ICodeOfConduct | null;
    /**
    description: A list of collaborators associated with the repository.
  */
    collaborators: IRepositoryCollaboratorConnection | null;
    /**
    description: A list of commit comments associated with the repository.
  */
    commitComments: ICommitCommentConnection;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The Ref associated with the repository's default branch.
  */
    defaultBranchRef: IRef | null;
    /**
    description: Deployments associated with the repository
  */
    deployments: IDeploymentConnection;
    /**
    description: The description of the repository.
  */
    description: string | null;
    /**
    description: The description of the repository rendered to HTML.
  */
    descriptionHTML: any;
    /**
    description: The number of kilobytes this repository occupies on disk.
  */
    diskUsage: number | null;
    /**
    description: A list of forked repositories.
  */
    forks: IRepositoryConnection;
    /**
    description: Indicates if the repository has issues feature enabled.
  */
    hasIssuesEnabled: boolean;
    /**
    description: Indicates if the repository has wiki feature enabled.
  */
    hasWikiEnabled: boolean;
    /**
    description: The repository's URL.
  */
    homepageUrl: any | null;
    id: string;
    /**
    description: Indicates if the repository is unmaintained.
  */
    isArchived: boolean;
    /**
    description: Identifies if the repository is a fork.
  */
    isFork: boolean;
    /**
    description: Indicates if the repository has been locked or not.
  */
    isLocked: boolean;
    /**
    description: Identifies if the repository is a mirror.
  */
    isMirror: boolean;
    /**
    description: Identifies if the repository is private.
  */
    isPrivate: boolean;
    /**
    description: Returns a single issue from the current repository by number.
  */
    issue: IIssue | null;
    /**
    description: Returns a single issue-like object from the current repository by number.
  */
    issueOrPullRequest: IssueOrPullRequest | null;
    /**
    description: A list of issues that have been opened in the repository.
  */
    issues: IIssueConnection;
    /**
    description: Returns a single label by name
  */
    label: ILabel | null;
    /**
    description: A list of labels associated with the repository.
  */
    labels: ILabelConnection | null;
    /**
    description: A list containing a breakdown of the language composition of the repository.
  */
    languages: ILanguageConnection | null;
    /**
    description: The license associated with the repository
  */
    license: string | null;
    /**
    description: The license associated with the repository
  */
    licenseInfo: ILicense | null;
    /**
    description: The reason the repository has been locked.
  */
    lockReason: IRepositoryLockReasonEnum | null;
    /**
    description: A list of Users that can be mentioned in the context of the repository.
  */
    mentionableUsers: IUserConnection;
    /**
    description: Returns a single milestone from the current repository by number.
  */
    milestone: IMilestone | null;
    /**
    description: A list of milestones associated with the repository.
  */
    milestones: IMilestoneConnection | null;
    /**
    description: The repository's original mirror URL.
  */
    mirrorUrl: any | null;
    /**
    description: The name of the repository.
  */
    name: string;
    /**
    description: The repository's name with owner.
  */
    nameWithOwner: string;
    /**
    description: A Git object in the repository
  */
    object: GitObject | null;
    /**
    description: The User owner of the repository.
  */
    owner: RepositoryOwner;
    /**
    description: The repository parent, if this is a fork.
  */
    parent: IRepository | null;
    /**
    description: The primary language of the repository's code.
  */
    primaryLanguage: ILanguage | null;
    /**
    description: Find project by number.
  */
    project: IProject | null;
    /**
    description: A list of projects under the owner.
  */
    projects: IProjectConnection;
    /**
    description: The HTTP path listing repository's projects
  */
    projectsResourcePath: any;
    /**
    description: The HTTP URL listing repository's projects
  */
    projectsUrl: any;
    /**
    description: A list of protected branches that are on this repository.
  */
    protectedBranches: IProtectedBranchConnection;
    /**
    description: Returns a single pull request from the current repository by number.
  */
    pullRequest: IPullRequest | null;
    /**
    description: A list of pull requests that have been opened in the repository.
  */
    pullRequests: IPullRequestConnection;
    /**
    description: Identifies when the repository was last pushed to.
  */
    pushedAt: any | null;
    /**
    description: Fetch a given ref from the repository
  */
    ref: IRef | null;
    /**
    description: Fetch a list of refs from the repository
  */
    refs: IRefConnection | null;
    /**
    description: List of releases which are dependent on this repository.
  */
    releases: IReleaseConnection;
    /**
    description: A list of applied repository-topic associations for this repository.
  */
    repositoryTopics: IRepositoryTopicConnection;
    /**
    description: The HTTP path for this repository
  */
    resourcePath: any;
    /**
    description: A description of the repository, rendered to HTML without any links in it.
  */
    shortDescriptionHTML: any;
    /**
    description: A list of users who have starred this starrable.
  */
    stargazers: IStargazerConnection;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this repository
  */
    url: any;
    /**
    description: Indicates whether the viewer has admin permissions on this repository.
  */
    viewerCanAdminister: boolean;
    /**
    description: Can the current viewer create new projects on this owner.
  */
    viewerCanCreateProjects: boolean;
    /**
    description: Check if the viewer is able to change their subscription status for the repository.
  */
    viewerCanSubscribe: boolean;
    /**
    description: Indicates whether the viewer can update the topics of this repository.
  */
    viewerCanUpdateTopics: boolean;
    /**
    description: Returns a boolean indicating whether the viewing user has starred this starrable.
  */
    viewerHasStarred: boolean;
    /**
    description: Identifies if the viewer is watching, not watching, or ignoring the repository.
  */
    viewerSubscription: ISubscriptionStateEnum;
    /**
    description: A list of users watching the repository.
  */
    watchers: IUserConnection;
  }

  /**
    description: Entities that can be subscribed to for web and email notifications.
  */
  type Subscribable = IIssue | IRepository | ICommit | IPullRequest | ITeam;

  /**
    description: Entities that can be subscribed to for web and email notifications.
  */
  interface ISubscribable {
    __typename: "Subscribable";
    id: string;
    /**
    description: Check if the viewer is able to change their subscription status for the repository.
  */
    viewerCanSubscribe: boolean;
    /**
    description: Identifies if the viewer is watching, not watching, or ignoring the repository.
  */
    viewerSubscription: ISubscriptionStateEnum;
  }

  /**
    description: The possible states of a subscription.
  */
  type ISubscriptionStateEnum = 'UNSUBSCRIBED' | 'SUBSCRIBED' | 'IGNORED';

  /**
    description: Things that can be starred.
  */
  type Starrable = IRepository | IGist;

  /**
    description: Things that can be starred.
  */
  interface IStarrable {
    __typename: "Starrable";
    id: string;
    /**
    description: A list of users who have starred this starrable.
  */
    stargazers: IStargazerConnection;
    /**
    description: Returns a boolean indicating whether the viewing user has starred this starrable.
  */
    viewerHasStarred: boolean;
  }

  /**
    description: Ways in which star connections can be ordered.
  */
  interface IStarOrder {
    /**
    description: The field in which to order nodes by.
  */
    field: IStarOrderFieldEnum;
    /**
    description: The direction in which to order nodes.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which star connections can be ordered.
  */
  type IStarOrderFieldEnum = 'STARRED_AT';

  /**
    description: The connection type for User.
  */
  interface IStargazerConnection {
    __typename: "StargazerConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IStargazerEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IUser> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: Represents a user that's starred a repository.
  */
  interface IStargazerEdge {
    __typename: "StargazerEdge";
    cursor: string;
    node: IUser;
    /**
    description: Identifies when the item was starred.
  */
    starredAt: any;
  }

  /**
    description: Information about pagination in a connection.
  */
  interface IPageInfo {
    __typename: "PageInfo";
    /**
    description: When paginating forwards, the cursor to continue.
  */
    endCursor: string | null;
    /**
    description: When paginating forwards, are there more items?
  */
    hasNextPage: boolean;
    /**
    description: When paginating backwards, are there more items?
  */
    hasPreviousPage: boolean;
    /**
    description: When paginating backwards, the cursor to continue.
  */
    startCursor: string | null;
  }

  /**
    description: Represents a type that can be retrieved by a URL.
  */
  type UniformResourceLocatable = IOrganization | IIssue | IUser | IRepository | IPullRequest | IPullRequestCommit | IMilestone | IMergedEvent | ICrossReferencedEvent | IReviewDismissedEvent | IRelease | IRepositoryTopic | IBot;

  /**
    description: Represents a type that can be retrieved by a URL.
  */
  interface IUniformResourceLocatable {
    __typename: "UniformResourceLocatable";
    /**
    description: The HTML path to this resource.
  */
    resourcePath: any;
    /**
    description: The URL to this resource.
  */
    url: any;
  }

  /**
    description: A subset of repository info.
  */
  type RepositoryInfo = IRepository | IRepositoryInvitationRepository;

  /**
    description: A subset of repository info.
  */
  interface IRepositoryInfo {
    __typename: "RepositoryInfo";
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: The description of the repository.
  */
    description: string | null;
    /**
    description: The description of the repository rendered to HTML.
  */
    descriptionHTML: any;
    /**
    description: Indicates if the repository has issues feature enabled.
  */
    hasIssuesEnabled: boolean;
    /**
    description: Indicates if the repository has wiki feature enabled.
  */
    hasWikiEnabled: boolean;
    /**
    description: The repository's URL.
  */
    homepageUrl: any | null;
    /**
    description: Indicates if the repository is unmaintained.
  */
    isArchived: boolean;
    /**
    description: Identifies if the repository is a fork.
  */
    isFork: boolean;
    /**
    description: Indicates if the repository has been locked or not.
  */
    isLocked: boolean;
    /**
    description: Identifies if the repository is a mirror.
  */
    isMirror: boolean;
    /**
    description: Identifies if the repository is private.
  */
    isPrivate: boolean;
    /**
    description: The license associated with the repository
  */
    license: string | null;
    /**
    description: The license associated with the repository
  */
    licenseInfo: ILicense | null;
    /**
    description: The reason the repository has been locked.
  */
    lockReason: IRepositoryLockReasonEnum | null;
    /**
    description: The repository's original mirror URL.
  */
    mirrorUrl: any | null;
    /**
    description: The name of the repository.
  */
    name: string;
    /**
    description: The repository's name with owner.
  */
    nameWithOwner: string;
    /**
    description: The User owner of the repository.
  */
    owner: RepositoryOwner;
    /**
    description: Identifies when the repository was last pushed to.
  */
    pushedAt: any | null;
    /**
    description: The HTTP path for this repository
  */
    resourcePath: any;
    /**
    description: A description of the repository, rendered to HTML without any links in it.
  */
    shortDescriptionHTML: any;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this repository
  */
    url: any;
  }

  /**
    description: The possible reasons a given repository could be in a locked state.
  */
  type IRepositoryLockReasonEnum = 'MOVING' | 'BILLING' | 'RENAME' | 'MIGRATING';

  /**
    description: Collaborators affiliation level with a repository.
  */
  type ICollaboratorAffiliationEnum = 'OUTSIDE' | 'DIRECT' | 'ALL';

  /**
    description: The connection type for User.
  */
  interface IRepositoryCollaboratorConnection {
    __typename: "RepositoryCollaboratorConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IRepositoryCollaboratorEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IUser> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: Represents a user who is a collaborator of a repository.
  */
  interface IRepositoryCollaboratorEdge {
    __typename: "RepositoryCollaboratorEdge";
    cursor: string;
    node: IUser;
    /**
    description: The permission the user has on the repository.
  */
    permission: IRepositoryPermissionEnum;
  }

  /**
    description: The access level to a repository
  */
  type IRepositoryPermissionEnum = 'ADMIN' | 'WRITE' | 'READ';

  /**
    description: The connection type for CommitComment.
  */
  interface ICommitCommentConnection {
    __typename: "CommitCommentConnection";
    /**
    description: A list of edges.
  */
    edges: Array<ICommitCommentEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<ICommitComment> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface ICommitCommentEdge {
    __typename: "CommitCommentEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: ICommitComment | null;
  }

  /**
    description: Represents a comment on a given Commit.
  */
  interface ICommitComment {
    __typename: "CommitComment";
    /**
    description: The actor who authored the comment.
  */
    author: Actor | null;
    /**
    description: Author's association with the subject of the comment.
  */
    authorAssociation: ICommentAuthorAssociationEnum;
    /**
    description: Identifies the comment body.
  */
    body: string;
    /**
    description: Identifies the comment body rendered to HTML.
  */
    bodyHTML: any;
    /**
    description: Identifies the commit associated with the comment, if the commit exists.
  */
    commit: ICommit | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Check if this comment was created via an email reply.
  */
    createdViaEmail: boolean;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The actor who edited the comment.
  */
    editor: Actor | null;
    id: string;
    /**
    description: The moment the editor made the last edit
  */
    lastEditedAt: any | null;
    /**
    description: Identifies the file path associated with the comment.
  */
    path: string | null;
    /**
    description: Identifies the line position associated with the comment.
  */
    position: number | null;
    /**
    description: Identifies when the comment was published at.
  */
    publishedAt: any | null;
    /**
    description: A list of reactions grouped by content left on the subject.
  */
    reactionGroups: Array<IReactionGroup>;
    /**
    description: A list of Reactions left on the Issue.
  */
    reactions: IReactionConnection;
    /**
    description: The repository associated with this node.
  */
    repository: IRepository;
    /**
    description: The HTTP path permalink for this commit comment.
  */
    resourcePath: any;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL permalink for this commit comment.
  */
    url: any;
    /**
    description: Check if the current viewer can delete this object.
  */
    viewerCanDelete: boolean;
    /**
    description: Can user react to this subject
  */
    viewerCanReact: boolean;
    /**
    description: Check if the current viewer can update this object.
  */
    viewerCanUpdate: boolean;
    /**
    description: Reasons why the current viewer can not update this comment.
  */
    viewerCannotUpdateReasons: Array<ICommentCannotUpdateReasonEnum>;
    /**
    description: Did the viewer author this comment.
  */
    viewerDidAuthor: boolean;
  }

  /**
    description: Represents a comment.
  */
  type Comment = IIssue | ICommitComment | IPullRequest | IIssueComment | IPullRequestReview | IPullRequestReviewComment | IGistComment;

  /**
    description: Represents a comment.
  */
  interface IComment {
    __typename: "Comment";
    /**
    description: The actor who authored the comment.
  */
    author: Actor | null;
    /**
    description: Author's association with the subject of the comment.
  */
    authorAssociation: ICommentAuthorAssociationEnum;
    /**
    description: The comment body as Markdown.
  */
    body: string;
    /**
    description: The comment body rendered to HTML.
  */
    bodyHTML: any;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Check if this comment was created via an email reply.
  */
    createdViaEmail: boolean;
    /**
    description: The actor who edited the comment.
  */
    editor: Actor | null;
    id: string;
    /**
    description: The moment the editor made the last edit
  */
    lastEditedAt: any | null;
    /**
    description: Identifies when the comment was published at.
  */
    publishedAt: any | null;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: Did the viewer author this comment.
  */
    viewerDidAuthor: boolean;
  }

  /**
    description: A comment author association with repository.
  */
  type ICommentAuthorAssociationEnum = 'MEMBER' | 'OWNER' | 'COLLABORATOR' | 'CONTRIBUTOR' | 'FIRST_TIME_CONTRIBUTOR' | 'FIRST_TIMER' | 'NONE';

  /**
    description: Entities that can be deleted.
  */
  type Deletable = ICommitComment | IIssueComment | IPullRequestReview | IPullRequestReviewComment | IGistComment;

  /**
    description: Entities that can be deleted.
  */
  interface IDeletable {
    __typename: "Deletable";
    /**
    description: Check if the current viewer can delete this object.
  */
    viewerCanDelete: boolean;
  }

  /**
    description: Comments that can be updated.
  */
  type UpdatableComment = IIssue | ICommitComment | IPullRequest | IIssueComment | IPullRequestReview | IPullRequestReviewComment | IGistComment;

  /**
    description: Comments that can be updated.
  */
  interface IUpdatableComment {
    __typename: "UpdatableComment";
    /**
    description: Reasons why the current viewer can not update this comment.
  */
    viewerCannotUpdateReasons: Array<ICommentCannotUpdateReasonEnum>;
  }

  /**
    description: The possible errors that will prevent a user from updating a comment.
  */
  type ICommentCannotUpdateReasonEnum = 'INSUFFICIENT_ACCESS' | 'LOCKED' | 'LOGIN_REQUIRED' | 'MAINTENANCE' | 'VERIFIED_EMAIL_REQUIRED';

  /**
    description: Represents a subject that can be reacted on.
  */
  type Reactable = IIssue | ICommitComment | IPullRequest | IIssueComment | IPullRequestReviewComment;

  /**
    description: Represents a subject that can be reacted on.
  */
  interface IReactable {
    __typename: "Reactable";
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
    /**
    description: A list of reactions grouped by content left on the subject.
  */
    reactionGroups: Array<IReactionGroup>;
    /**
    description: A list of Reactions left on the Issue.
  */
    reactions: IReactionConnection;
    /**
    description: Can user react to this subject
  */
    viewerCanReact: boolean;
  }

  /**
    description: A group of emoji reactions to a particular piece of content.
  */
  interface IReactionGroup {
    __typename: "ReactionGroup";
    /**
    description: Identifies the emoji reaction.
  */
    content: IReactionContentEnum;
    /**
    description: Identifies when the reaction was created.
  */
    createdAt: any | null;
    /**
    description: The subject that was reacted to.
  */
    subject: Reactable;
    /**
    description: Users who have reacted to the reaction subject with the emotion represented by this reaction group
  */
    users: IReactingUserConnection;
    /**
    description: Whether or not the authenticated user has left a reaction on the subject.
  */
    viewerHasReacted: boolean;
  }

  /**
    description: Emojis that can be attached to Issues, Pull Requests and Comments.
  */
  type IReactionContentEnum = 'THUMBS_UP' | 'THUMBS_DOWN' | 'LAUGH' | 'HOORAY' | 'CONFUSED' | 'HEART';

  /**
    description: The connection type for User.
  */
  interface IReactingUserConnection {
    __typename: "ReactingUserConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IReactingUserEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IUser> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: Represents a user that's made a reaction.
  */
  interface IReactingUserEdge {
    __typename: "ReactingUserEdge";
    cursor: string;
    node: IUser;
    /**
    description: The moment when the user made the reaction.
  */
    reactedAt: any;
  }

  /**
    description: Ways in which lists of reactions can be ordered upon return.
  */
  interface IReactionOrder {
    /**
    description: The field in which to order reactions by.
  */
    field: IReactionOrderFieldEnum;
    /**
    description: The direction in which to order reactions by the specified field.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: A list of fields that reactions can be ordered by.
  */
  type IReactionOrderFieldEnum = 'CREATED_AT';

  /**
    description: A list of reactions that have been left on the subject.
  */
  interface IReactionConnection {
    __typename: "ReactionConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IReactionEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IReaction> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
    /**
    description: Whether or not the authenticated user has left a reaction on the subject.
  */
    viewerHasReacted: boolean;
  }

  /**
    description: An edge in a connection.
  */
  interface IReactionEdge {
    __typename: "ReactionEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IReaction | null;
  }

  /**
    description: An emoji reaction to a particular piece of content.
  */
  interface IReaction {
    __typename: "Reaction";
    /**
    description: Identifies the emoji reaction.
  */
    content: IReactionContentEnum;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
    /**
    description: Identifies the user who created this reaction.
  */
    user: IUser | null;
  }

  /**
    description: Represents a object that belongs to a repository.
  */
  type RepositoryNode = IIssue | ICommitComment | IPullRequest | IIssueComment | IPullRequestReview | IPullRequestReviewComment | ICommitCommentThread;

  /**
    description: Represents a object that belongs to a repository.
  */
  interface IRepositoryNode {
    __typename: "RepositoryNode";
    /**
    description: The repository associated with this node.
  */
    repository: IRepository;
  }

  /**
    description: Represents a Git commit.
  */
  interface ICommit {
    __typename: "Commit";
    /**
    description: An abbreviated version of the Git object ID
  */
    abbreviatedOid: string;
    /**
    description: Authorship details of the commit.
  */
    author: IGitActor | null;
    /**
    description: Check if the committer and the author match.
  */
    authoredByCommitter: boolean;
    /**
    description: The datetime when this commit was authored.
  */
    authoredDate: any;
    /**
    description: Fetches `git blame` information.
  */
    blame: IBlame;
    /**
    description: Comments made on the commit.
  */
    comments: ICommitCommentConnection;
    /**
    description: The HTTP path for this Git object
  */
    commitResourcePath: any;
    /**
    description: The HTTP URL for this Git object
  */
    commitUrl: any;
    /**
    description: The datetime when this commit was committed.
  */
    committedDate: any;
    /**
    description: Check if commited via GitHub web UI.
  */
    committedViaWeb: boolean;
    /**
    description: Committership details of the commit.
  */
    committer: IGitActor | null;
    /**
    description: The linear commit history starting from (and including) this commit, in the same order as `git log`.
  */
    history: ICommitHistoryConnection;
    id: string;
    /**
    description: The Git commit message
  */
    message: string;
    /**
    description: The Git commit message body
  */
    messageBody: string;
    /**
    description: The commit message body rendered to HTML.
  */
    messageBodyHTML: any;
    /**
    description: The Git commit message headline
  */
    messageHeadline: string;
    /**
    description: The commit message headline rendered to HTML.
  */
    messageHeadlineHTML: any;
    /**
    description: The Git object ID
  */
    oid: any;
    /**
    description: The datetime when this commit was pushed.
  */
    pushedDate: any | null;
    /**
    description: The Repository this commit belongs to
  */
    repository: IRepository;
    /**
    description: The HTTP path for this commit
  */
    resourcePath: any;
    /**
    description: Commit signing information, if present.
  */
    signature: GitSignature | null;
    /**
    description: Status information for this commit
  */
    status: IStatus | null;
    /**
    description: Returns a URL to download a tarball archive for a repository.                      Note: For private repositories, these links are temporary and expire after five minutes.
  */
    tarballUrl: any;
    /**
    description: Commit's root Tree
  */
    tree: ITree;
    /**
    description: The HTTP path for the tree of this commit
  */
    treeResourcePath: any;
    /**
    description: The HTTP URL for the tree of this commit
  */
    treeUrl: any;
    /**
    description: The HTTP URL for this commit
  */
    url: any;
    /**
    description: Check if the viewer is able to change their subscription status for the repository.
  */
    viewerCanSubscribe: boolean;
    /**
    description: Identifies if the viewer is watching, not watching, or ignoring the repository.
  */
    viewerSubscription: ISubscriptionStateEnum;
    /**
    description: Returns a URL to download a zipball archive for a repository.                      Note: For private repositories, these links are temporary and expire after five minutes.
  */
    zipballUrl: any;
  }

  /**
    description: Represents a Git object.
  */
  type GitObject = ICommit | ITree | IBlob | ITag;

  /**
    description: Represents a Git object.
  */
  interface IGitObject {
    __typename: "GitObject";
    /**
    description: An abbreviated version of the Git object ID
  */
    abbreviatedOid: string;
    /**
    description: The HTTP path for this Git object
  */
    commitResourcePath: any;
    /**
    description: The HTTP URL for this Git object
  */
    commitUrl: any;
    id: string;
    /**
    description: The Git object ID
  */
    oid: any;
    /**
    description: The Repository the Git object belongs to
  */
    repository: IRepository;
  }

  /**
    description: Represents an actor in a Git commit (ie. an author or committer).
  */
  interface IGitActor {
    __typename: "GitActor";
    /**
    description: A URL pointing to the author's public avatar.
  */
    avatarUrl: any;
    /**
    description: The timestamp of the Git action (authoring or committing).
  */
    date: any | null;
    /**
    description: The email in the Git commit.
  */
    email: string | null;
    /**
    description: The name in the Git commit.
  */
    name: string | null;
    /**
    description: The GitHub user corresponding to the email field. Null if no such user exists.
  */
    user: IUser | null;
  }

  /**
    description: Represents a Git blame.
  */
  interface IBlame {
    __typename: "Blame";
    /**
    description: The list of ranges from a Git blame.
  */
    ranges: Array<IBlameRange>;
  }

  /**
    description: Represents a range of information from a Git blame.
  */
  interface IBlameRange {
    __typename: "BlameRange";
    /**
    description: Identifies the recency of the change, from 1 (new) to 10 (old). This is calculated as a 2-quantile and determines the length of distance between the median age of all the changes in the file and the recency of the current range's change.
  */
    age: number;
    /**
    description: Identifies the line author
  */
    commit: ICommit;
    /**
    description: The ending line for the range
  */
    endingLine: number;
    /**
    description: The starting line for the range
  */
    startingLine: number;
  }

  /**
    description: Specifies an author for filtering Git commits.
  */
  interface ICommitAuthor {
    /**
    description: ID of a User to filter by. If non-null, only commits authored by this user will be returned. This field takes precedence over emails.
  */
    id?: string | null;
    /**
    description: Email addresses to filter by. Commits authored by any of the specified email addresses will be returned.
  */
    emails: Array<string>;
  }

  /**
    description: The connection type for Commit.
  */
  interface ICommitHistoryConnection {
    __typename: "CommitHistoryConnection";
    edges: Array<ICommitEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<ICommit> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface ICommitEdge {
    __typename: "CommitEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: ICommit | null;
  }

  /**
    description: Information about a signature (GPG or S/MIME) on a Commit or Tag.
  */
  type GitSignature = IGpgSignature | ISmimeSignature | IUnknownSignature;

  /**
    description: Information about a signature (GPG or S/MIME) on a Commit or Tag.
  */
  interface IGitSignature {
    __typename: "GitSignature";
    /**
    description: Email used to sign this object.
  */
    email: string;
    /**
    description: True if the signature is valid and verified by GitHub.
  */
    isValid: boolean;
    /**
    description: Payload for GPG signing object. Raw ODB object without the signature header.
  */
    payload: string;
    /**
    description: ASCII-armored signature header from object.
  */
    signature: string;
    /**
    description: GitHub user corresponding to the email signing this commit.
  */
    signer: IUser | null;
    /**
    description: The state of this signature. `VALID` if signature is valid and verified by GitHub, otherwise represents reason why signature is considered invalid.
  */
    state: IGitSignatureStateEnum;
  }

  /**
    description: The state of a Git signature.
  */
  type IGitSignatureStateEnum = 'VALID' | 'INVALID' | 'MALFORMED_SIG' | 'UNKNOWN_KEY' | 'BAD_EMAIL' | 'UNVERIFIED_EMAIL' | 'NO_USER' | 'UNKNOWN_SIG_TYPE' | 'UNSIGNED' | 'GPGVERIFY_UNAVAILABLE' | 'GPGVERIFY_ERROR' | 'NOT_SIGNING_KEY' | 'EXPIRED_KEY';

  /**
    description: Represents a commit status.
  */
  interface IStatus {
    __typename: "Status";
    /**
    description: The commit this status is attached to.
  */
    commit: ICommit | null;
    /**
    description: Looks up an individual status context by context name.
  */
    context: IStatusContext | null;
    /**
    description: The individual status contexts for this commit.
  */
    contexts: Array<IStatusContext>;
    id: string;
    /**
    description: The combined commit status.
  */
    state: IStatusStateEnum;
  }

  /**
    description: Represents an individual commit status context
  */
  interface IStatusContext {
    __typename: "StatusContext";
    /**
    description: This commit this status context is attached to.
  */
    commit: ICommit | null;
    /**
    description: The name of this status context.
  */
    context: string;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: The actor who created this status context.
  */
    creator: Actor | null;
    /**
    description: The description for this status context.
  */
    description: string | null;
    id: string;
    /**
    description: The state of this status context.
  */
    state: IStatusStateEnum;
    /**
    description: The URL for this status context.
  */
    targetUrl: any | null;
  }

  /**
    description: The possible commit status states.
  */
  type IStatusStateEnum = 'EXPECTED' | 'ERROR' | 'FAILURE' | 'PENDING' | 'SUCCESS';

  /**
    description: Represents a Git tree.
  */
  interface ITree {
    __typename: "Tree";
    /**
    description: An abbreviated version of the Git object ID
  */
    abbreviatedOid: string;
    /**
    description: The HTTP path for this Git object
  */
    commitResourcePath: any;
    /**
    description: The HTTP URL for this Git object
  */
    commitUrl: any;
    /**
    description: A list of tree entries.
  */
    entries: Array<ITreeEntry>;
    id: string;
    /**
    description: The Git object ID
  */
    oid: any;
    /**
    description: The Repository the Git object belongs to
  */
    repository: IRepository;
  }

  /**
    description: Represents a Git tree entry.
  */
  interface ITreeEntry {
    __typename: "TreeEntry";
    /**
    description: Entry file mode.
  */
    mode: number;
    /**
    description: Entry file name.
  */
    name: string;
    /**
    description: Entry file object.
  */
    object: GitObject | null;
    /**
    description: Entry file Git object ID.
  */
    oid: any;
    /**
    description: The Repository the tree entry belongs to
  */
    repository: IRepository;
    /**
    description: Entry file type.
  */
    type: string;
  }

  /**
    description: Represents a Git reference.
  */
  interface IRef {
    __typename: "Ref";
    /**
    description: A list of pull requests with this ref as the head ref.
  */
    associatedPullRequests: IPullRequestConnection;
    id: string;
    /**
    description: The ref name.
  */
    name: string;
    /**
    description: The ref's prefix, such as `refs/heads/` or `refs/tags/`.
  */
    prefix: string;
    /**
    description: The repository the ref belongs to.
  */
    repository: IRepository;
    /**
    description: The object the ref points to.
  */
    target: GitObject;
  }

  /**
    description: The possible states of a pull request.
  */
  type IPullRequestStateEnum = 'OPEN' | 'CLOSED' | 'MERGED';

  /**
    description: Ways in which lists of issues can be ordered upon return.
  */
  interface IIssueOrder {
    /**
    description: The field in which to order issues by.
  */
    field: IIssueOrderFieldEnum;
    /**
    description: The direction in which to order issues by the specified field.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which issue connections can be ordered.
  */
  type IIssueOrderFieldEnum = 'CREATED_AT' | 'UPDATED_AT' | 'COMMENTS';

  /**
    description: The connection type for PullRequest.
  */
  interface IPullRequestConnection {
    __typename: "PullRequestConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IPullRequestEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IPullRequest> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IPullRequestEdge {
    __typename: "PullRequestEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IPullRequest | null;
  }

  /**
    description: A repository pull request.
  */
  interface IPullRequest {
    __typename: "PullRequest";
    /**
    description: The number of additions in this pull request.
  */
    additions: number;
    /**
    description: A list of Users assigned to this object.
  */
    assignees: IUserConnection;
    /**
    description: The actor who authored the comment.
  */
    author: Actor | null;
    /**
    description: Author's association with the subject of the comment.
  */
    authorAssociation: ICommentAuthorAssociationEnum;
    /**
    description: Identifies the base Ref associated with the pull request.
  */
    baseRef: IRef | null;
    /**
    description: Identifies the name of the base Ref associated with the pull request, even if the ref has been deleted.
  */
    baseRefName: string;
    /**
    description: Identifies the body of the pull request.
  */
    body: string;
    /**
    description: Identifies the body of the pull request rendered to HTML.
  */
    bodyHTML: any;
    /**
    description: Identifies the body of the pull request rendered to text.
  */
    bodyText: string;
    /**
    description: `true` if the pull request is closed
  */
    closed: boolean;
    /**
    description: A list of comments associated with the pull request.
  */
    comments: IIssueCommentConnection;
    /**
    description: A list of commits present in this pull request's head branch not present in the base branch.
  */
    commits: IPullRequestCommitConnection;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Check if this comment was created via an email reply.
  */
    createdViaEmail: boolean;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The number of deletions in this pull request.
  */
    deletions: number;
    /**
    description: The actor who edited this pull request's body.
  */
    editor: Actor | null;
    /**
    description: Identifies the head Ref associated with the pull request.
  */
    headRef: IRef | null;
    /**
    description: Identifies the name of the head Ref associated with the pull request, even if the ref has been deleted.
  */
    headRefName: string;
    /**
    description: The repository associated with this pull request's head Ref.
  */
    headRepository: IRepository | null;
    /**
    description: The owner of the repository associated with this pull request's head Ref.
  */
    headRepositoryOwner: RepositoryOwner | null;
    id: string;
    /**
    description: The head and base repositories are different.
  */
    isCrossRepository: boolean;
    /**
    description: A list of labels associated with the object.
  */
    labels: ILabelConnection | null;
    /**
    description: The moment the editor made the last edit
  */
    lastEditedAt: any | null;
    /**
    description: `true` if the pull request is locked
  */
    locked: boolean;
    /**
    description: The commit that was created when this pull request was merged.
  */
    mergeCommit: ICommit | null;
    /**
    description: Whether or not the pull request can be merged based on the existence of merge conflicts.
  */
    mergeable: IMergeableStateEnum;
    /**
    description: Whether or not the pull request was merged.
  */
    merged: boolean;
    /**
    description: The date and time that the pull request was merged.
  */
    mergedAt: any | null;
    /**
    description: Identifies the milestone associated with the pull request.
  */
    milestone: IMilestone | null;
    /**
    description: Identifies the pull request number.
  */
    number: number;
    /**
    description: A list of Users that are participating in the Pull Request conversation.
  */
    participants: IUserConnection;
    /**
    description: The commit that GitHub automatically generated to test if this pull request could be merged. This field will not return a value if the pull request is merged, or if the test merge commit is still being generated. See the `mergeable` field for more details on the mergeability of the pull request.
  */
    potentialMergeCommit: ICommit | null;
    /**
    description: List of project cards associated with this pull request.
  */
    projectCards: IProjectCardConnection;
    /**
    description: Identifies when the comment was published at.
  */
    publishedAt: any | null;
    /**
    description: A list of reactions grouped by content left on the subject.
  */
    reactionGroups: Array<IReactionGroup>;
    /**
    description: A list of Reactions left on the Issue.
  */
    reactions: IReactionConnection;
    /**
    description: The repository associated with this node.
  */
    repository: IRepository;
    /**
    description: The HTTP path for this pull request.
  */
    resourcePath: any;
    /**
    description: The HTTP path for reverting this pull request.
  */
    revertResourcePath: any;
    /**
    description: The HTTP URL for reverting this pull request.
  */
    revertUrl: any;
    /**
    description: A list of review requests associated with the pull request.
  */
    reviewRequests: IReviewRequestConnection | null;
    /**
    description: A list of reviews associated with the pull request.
  */
    reviews: IPullRequestReviewConnection | null;
    /**
    description: Identifies the state of the pull request.
  */
    state: IPullRequestStateEnum;
    /**
    description: A list of reviewer suggestions based on commit history and past review comments.
  */
    suggestedReviewers: Array<ISuggestedReviewer>;
    /**
    description: A list of events, comments, commits, etc. associated with the pull request.
  */
    timeline: IPullRequestTimelineConnection;
    /**
    description: Identifies the pull request title.
  */
    title: string;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this pull request.
  */
    url: any;
    /**
    description: Can user react to this subject
  */
    viewerCanReact: boolean;
    /**
    description: Check if the viewer is able to change their subscription status for the repository.
  */
    viewerCanSubscribe: boolean;
    /**
    description: Check if the current viewer can update this object.
  */
    viewerCanUpdate: boolean;
    /**
    description: Reasons why the current viewer can not update this comment.
  */
    viewerCannotUpdateReasons: Array<ICommentCannotUpdateReasonEnum>;
    /**
    description: Did the viewer author this comment.
  */
    viewerDidAuthor: boolean;
    /**
    description: Identifies if the viewer is watching, not watching, or ignoring the repository.
  */
    viewerSubscription: ISubscriptionStateEnum;
  }

  /**
    description: An object that can have labels assigned to it.
  */
  type Labelable = IIssue | IPullRequest;

  /**
    description: An object that can have labels assigned to it.
  */
  interface ILabelable {
    __typename: "Labelable";
    /**
    description: A list of labels associated with the object.
  */
    labels: ILabelConnection | null;
  }

  /**
    description: The connection type for Label.
  */
  interface ILabelConnection {
    __typename: "LabelConnection";
    /**
    description: A list of edges.
  */
    edges: Array<ILabelEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<ILabel> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface ILabelEdge {
    __typename: "LabelEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: ILabel | null;
  }

  /**
    description: A label for categorizing Issues or Milestones with a given Repository.
  */
  interface ILabel {
    __typename: "Label";
    /**
    description: Identifies the label color.
  */
    color: string;
    id: string;
    /**
    description: A list of issues associated with this label.
  */
    issues: IIssueConnection;
    /**
    description: Identifies the label name.
  */
    name: string;
    /**
    description: A list of pull requests associated with this label.
  */
    pullRequests: IPullRequestConnection;
    /**
    description: The repository associated with this label.
  */
    repository: IRepository;
  }

  /**
    description: The possible states of an issue.
  */
  type IIssueStateEnum = 'OPEN' | 'CLOSED';

  /**
    description: The connection type for Issue.
  */
  interface IIssueConnection {
    __typename: "IssueConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IIssueEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IIssue> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IIssueEdge {
    __typename: "IssueEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IIssue | null;
  }

  /**
    description: An object that can be locked.
  */
  type Lockable = IIssue | IPullRequest;

  /**
    description: An object that can be locked.
  */
  interface ILockable {
    __typename: "Lockable";
    /**
    description: `true` if the object is locked
  */
    locked: boolean;
  }

  /**
    description: The connection type for IssueComment.
  */
  interface IIssueCommentConnection {
    __typename: "IssueCommentConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IIssueCommentEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IIssueComment> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IIssueCommentEdge {
    __typename: "IssueCommentEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IIssueComment | null;
  }

  /**
    description: Represents a comment on an Issue.
  */
  interface IIssueComment {
    __typename: "IssueComment";
    /**
    description: The actor who authored the comment.
  */
    author: Actor | null;
    /**
    description: Author's association with the subject of the comment.
  */
    authorAssociation: ICommentAuthorAssociationEnum;
    /**
    description: Identifies the comment body.
  */
    body: string;
    /**
    description: The comment body rendered to HTML.
  */
    bodyHTML: any;
    /**
    description: Identifies the body of the issue rendered to text.
  */
    bodyText: string;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Check if this comment was created via an email reply.
  */
    createdViaEmail: boolean;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The actor who edited the comment.
  */
    editor: Actor | null;
    id: string;
    /**
    description: Identifies the issue associated with the comment.
  */
    issue: IIssue;
    /**
    description: The moment the editor made the last edit
  */
    lastEditedAt: any | null;
    /**
    description: Identifies when the comment was published at.
  */
    publishedAt: any | null;
    /**
    description: Returns the pull request associated with the comment, if this comment was made on a
pull request.

  */
    pullRequest: IPullRequest | null;
    /**
    description: A list of reactions grouped by content left on the subject.
  */
    reactionGroups: Array<IReactionGroup>;
    /**
    description: A list of Reactions left on the Issue.
  */
    reactions: IReactionConnection;
    /**
    description: The repository associated with this node.
  */
    repository: IRepository;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: Check if the current viewer can delete this object.
  */
    viewerCanDelete: boolean;
    /**
    description: Can user react to this subject
  */
    viewerCanReact: boolean;
    /**
    description: Check if the current viewer can update this object.
  */
    viewerCanUpdate: boolean;
    /**
    description: Reasons why the current viewer can not update this comment.
  */
    viewerCannotUpdateReasons: Array<ICommentCannotUpdateReasonEnum>;
    /**
    description: Did the viewer author this comment.
  */
    viewerDidAuthor: boolean;
  }

  /**
    description: The connection type for PullRequestCommit.
  */
  interface IPullRequestCommitConnection {
    __typename: "PullRequestCommitConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IPullRequestCommitEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IPullRequestCommit> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IPullRequestCommitEdge {
    __typename: "PullRequestCommitEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IPullRequestCommit | null;
  }

  /**
    description: Represents a Git commit part of a pull request.
  */
  interface IPullRequestCommit {
    __typename: "PullRequestCommit";
    /**
    description: The Git commit object
  */
    commit: ICommit;
    id: string;
    /**
    description: The pull request this commit belongs to
  */
    pullRequest: IPullRequest;
    /**
    description: The HTTP path for this pull request commit
  */
    resourcePath: any;
    /**
    description: The HTTP URL for this pull request commit
  */
    url: any;
  }

  /**
    description: Whether or not a PullRequest can be merged.
  */
  type IMergeableStateEnum = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN';

  /**
    description: Represents a Milestone object on a given repository.
  */
  interface IMilestone {
    __typename: "Milestone";
    /**
    description: Identifies the actor who created the milestone.
  */
    creator: Actor | null;
    /**
    description: Identifies the description of the milestone.
  */
    description: string | null;
    /**
    description: Identifies the due date of the milestone.
  */
    dueOn: any | null;
    id: string;
    /**
    description: Identifies the number of the milestone.
  */
    number: number;
    /**
    description: The repository associated with this milestone.
  */
    repository: IRepository;
    /**
    description: The HTTP path for this milestone
  */
    resourcePath: any;
    /**
    description: Identifies the state of the milestone.
  */
    state: IMilestoneStateEnum;
    /**
    description: Identifies the title of the milestone.
  */
    title: string;
    /**
    description: The HTTP URL for this milestone
  */
    url: any;
  }

  /**
    description: The possible states of a milestone.
  */
  type IMilestoneStateEnum = 'OPEN' | 'CLOSED';

  /**
    description: The connection type for ReviewRequest.
  */
  interface IReviewRequestConnection {
    __typename: "ReviewRequestConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IReviewRequestEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IReviewRequest> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IReviewRequestEdge {
    __typename: "ReviewRequestEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IReviewRequest | null;
  }

  /**
    description: A request for a user to review a pull request.
  */
  interface IReviewRequest {
    __typename: "ReviewRequest";
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
    /**
    description: Identifies the pull request associated with this review request.
  */
    pullRequest: IPullRequest;
    /**
    description: The reviewer that is requested.
  */
    requestedReviewer: RequestedReviewer | null;
    /**
    description: Identifies the author associated with this review request.
  */
    reviewer: IUser | null;
  }

  /**
    description: Types that can be requested reviewers.
  */
  type RequestedReviewer = IUser | ITeam;



  /**
    description: A team of users in an organization.
  */
  interface ITeam {
    __typename: "Team";
    /**
    description: A list of teams that are ancestors of this team.
  */
    ancestors: ITeamConnection;
    /**
    description: List of child teams belonging to this team
  */
    childTeams: ITeamConnection;
    /**
    description: The slug corresponding to the organization and team.
  */
    combinedSlug: string;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: The description of the team.
  */
    description: string | null;
    /**
    description: The HTTP path for editing this team
  */
    editTeamResourcePath: any;
    /**
    description: The HTTP URL for editing this team
  */
    editTeamUrl: any;
    id: string;
    /**
    description: A list of pending invitations for users to this team
  */
    invitations: IOrganizationInvitationConnection | null;
    /**
    description: A list of users who are members of this team.
  */
    members: ITeamMemberConnection;
    /**
    description: The HTTP path for the team' members
  */
    membersResourcePath: any;
    /**
    description: The HTTP URL for the team' members
  */
    membersUrl: any;
    /**
    description: The name of the team.
  */
    name: string;
    /**
    description: The HTTP path creating a new team
  */
    newTeamResourcePath: any;
    /**
    description: The HTTP URL creating a new team
  */
    newTeamUrl: any;
    /**
    description: The organization that owns this team.
  */
    organization: IOrganization;
    /**
    description: The parent team of the team.
  */
    parentTeam: ITeam | null;
    /**
    description: The level of privacy the team has.
  */
    privacy: ITeamPrivacyEnum;
    /**
    description: A list of repositories this team has access to.
  */
    repositories: ITeamRepositoryConnection;
    /**
    description: The HTTP path for this team's repositories
  */
    repositoriesResourcePath: any;
    /**
    description: The HTTP URL for this team's repositories
  */
    repositoriesUrl: any;
    /**
    description: The HTTP path for this team
  */
    resourcePath: any;
    /**
    description: The slug corresponding to the team.
  */
    slug: string;
    /**
    description: The HTTP path for this team's teams
  */
    teamsResourcePath: any;
    /**
    description: The HTTP URL for this team's teams
  */
    teamsUrl: any;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this team
  */
    url: any;
    /**
    description: Team is adminable by the viewer.
  */
    viewerCanAdminister: boolean;
    /**
    description: Check if the viewer is able to change their subscription status for the repository.
  */
    viewerCanSubscribe: boolean;
    /**
    description: Identifies if the viewer is watching, not watching, or ignoring the repository.
  */
    viewerSubscription: ISubscriptionStateEnum;
  }

  /**
    description: The connection type for Team.
  */
  interface ITeamConnection {
    __typename: "TeamConnection";
    /**
    description: A list of edges.
  */
    edges: Array<ITeamEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<ITeam> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface ITeamEdge {
    __typename: "TeamEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: ITeam | null;
  }

  /**
    description: Ways in which team connections can be ordered.
  */
  interface ITeamOrder {
    /**
    description: The field in which to order nodes by.
  */
    field: ITeamOrderFieldEnum;
    /**
    description: The direction in which to order nodes.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which team connections can be ordered.
  */
  type ITeamOrderFieldEnum = 'NAME';

  /**
    description: The connection type for OrganizationInvitation.
  */
  interface IOrganizationInvitationConnection {
    __typename: "OrganizationInvitationConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IOrganizationInvitationEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IOrganizationInvitation> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IOrganizationInvitationEdge {
    __typename: "OrganizationInvitationEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IOrganizationInvitation | null;
  }

  /**
    description: An Invitation for a user to an organization.
  */
  interface IOrganizationInvitation {
    __typename: "OrganizationInvitation";
    /**
    description: The email address of the user invited to the organization.
  */
    email: string | null;
    id: string;
    /**
    description: The type of invitation that was sent (e.g. email, user).
  */
    invitationType: IOrganizationInvitationTypeEnum;
    /**
    description: The user who was invited to the organization.
  */
    invitee: IUser | null;
    /**
    description: The user who created the invitation.
  */
    inviter: IUser;
    /**
    description: The user's pending role in the organization (e.g. member, owner).
  */
    role: IOrganizationInvitationRoleEnum;
  }

  /**
    description: The possible organization invitation types.
  */
  type IOrganizationInvitationTypeEnum = 'USER' | 'EMAIL';

  /**
    description: The possible organization invitation roles.
  */
  type IOrganizationInvitationRoleEnum = 'DIRECT_MEMBER' | 'ADMIN' | 'BILLING_MANAGER' | 'REINSTATE';

  /**
    description: Defines which types of team members are included in the returned list. Can be one of IMMEDIATE, CHILD_TEAM or ALL.
  */
  type ITeamMembershipTypeEnum = 'IMMEDIATE' | 'CHILD_TEAM' | 'ALL';

  /**
    description: The possible team member roles; either 'maintainer' or 'member'.
  */
  type ITeamMemberRoleEnum = 'MAINTAINER' | 'MEMBER';

  /**
    description: The connection type for User.
  */
  interface ITeamMemberConnection {
    __typename: "TeamMemberConnection";
    /**
    description: A list of edges.
  */
    edges: Array<ITeamMemberEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IUser> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: Represents a user who is a member of a team.
  */
  interface ITeamMemberEdge {
    __typename: "TeamMemberEdge";
    cursor: string;
    /**
    description: The HTTP path to the organization's member access page.
  */
    memberAccessResourcePath: any;
    /**
    description: The HTTP URL to the organization's member access page.
  */
    memberAccessUrl: any;
    node: IUser;
    /**
    description: The role the member has on the team.
  */
    role: ITeamMemberRoleEnum;
  }

  /**
    description: The possible team privacy values.
  */
  type ITeamPrivacyEnum = 'SECRET' | 'VISIBLE';

  /**
    description: Ordering options for team repository connections
  */
  interface ITeamRepositoryOrder {
    /**
    description: The field to order repositories by.
  */
    field: ITeamRepositoryOrderFieldEnum;
    /**
    description: The ordering direction.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which team repository connections can be ordered.
  */
  type ITeamRepositoryOrderFieldEnum = 'CREATED_AT' | 'UPDATED_AT' | 'PUSHED_AT' | 'NAME' | 'PERMISSION' | 'STARGAZERS';

  /**
    description: The connection type for Repository.
  */
  interface ITeamRepositoryConnection {
    __typename: "TeamRepositoryConnection";
    /**
    description: A list of edges.
  */
    edges: Array<ITeamRepositoryEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IRepository> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: Represents a team repository.
  */
  interface ITeamRepositoryEdge {
    __typename: "TeamRepositoryEdge";
    cursor: string;
    node: IRepository;
    /**
    description: The permission level the team has on the repository
  */
    permission: IRepositoryPermissionEnum;
  }

  /**
    description: The possible states of a pull request review.
  */
  type IPullRequestReviewStateEnum = 'PENDING' | 'COMMENTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'DISMISSED';

  /**
    description: The connection type for PullRequestReview.
  */
  interface IPullRequestReviewConnection {
    __typename: "PullRequestReviewConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IPullRequestReviewEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IPullRequestReview> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IPullRequestReviewEdge {
    __typename: "PullRequestReviewEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IPullRequestReview | null;
  }

  /**
    description: A review object for a given pull request.
  */
  interface IPullRequestReview {
    __typename: "PullRequestReview";
    /**
    description: The actor who authored the comment.
  */
    author: Actor | null;
    /**
    description: Author's association with the subject of the comment.
  */
    authorAssociation: ICommentAuthorAssociationEnum;
    /**
    description: Identifies the pull request review body.
  */
    body: string;
    /**
    description: The body of this review rendered to HTML.
  */
    bodyHTML: any;
    /**
    description: The body of this review rendered as plain text.
  */
    bodyText: string;
    /**
    description: A list of review comments for the current pull request review.
  */
    comments: IPullRequestReviewCommentConnection;
    /**
    description: Identifies the commit associated with this pull request review.
  */
    commit: ICommit | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Check if this comment was created via an email reply.
  */
    createdViaEmail: boolean;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The actor who edited the comment.
  */
    editor: Actor | null;
    id: string;
    /**
    description: The moment the editor made the last edit
  */
    lastEditedAt: any | null;
    /**
    description: Identifies when the comment was published at.
  */
    publishedAt: any | null;
    /**
    description: Identifies the pull request associated with this pull request review.
  */
    pullRequest: IPullRequest;
    /**
    description: The repository associated with this node.
  */
    repository: IRepository;
    /**
    description: The HTTP path permalink for this PullRequestReview.
  */
    resourcePath: any;
    /**
    description: Identifies the current state of the pull request review.
  */
    state: IPullRequestReviewStateEnum;
    /**
    description: Identifies when the Pull Request Review was submitted
  */
    submittedAt: any | null;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL permalink for this PullRequestReview.
  */
    url: any;
    /**
    description: Check if the current viewer can delete this object.
  */
    viewerCanDelete: boolean;
    /**
    description: Check if the current viewer can update this object.
  */
    viewerCanUpdate: boolean;
    /**
    description: Reasons why the current viewer can not update this comment.
  */
    viewerCannotUpdateReasons: Array<ICommentCannotUpdateReasonEnum>;
    /**
    description: Did the viewer author this comment.
  */
    viewerDidAuthor: boolean;
  }

  /**
    description: The connection type for PullRequestReviewComment.
  */
  interface IPullRequestReviewCommentConnection {
    __typename: "PullRequestReviewCommentConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IPullRequestReviewCommentEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IPullRequestReviewComment> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IPullRequestReviewCommentEdge {
    __typename: "PullRequestReviewCommentEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IPullRequestReviewComment | null;
  }

  /**
    description: A review comment associated with a given repository pull request.
  */
  interface IPullRequestReviewComment {
    __typename: "PullRequestReviewComment";
    /**
    description: The actor who authored the comment.
  */
    author: Actor | null;
    /**
    description: Author's association with the subject of the comment.
  */
    authorAssociation: ICommentAuthorAssociationEnum;
    /**
    description: The comment body of this review comment.
  */
    body: string;
    /**
    description: The comment body of this review comment rendered to HTML.
  */
    bodyHTML: any;
    /**
    description: The comment body of this review comment rendered as plain text.
  */
    bodyText: string;
    /**
    description: Identifies the commit associated with the comment.
  */
    commit: ICommit;
    /**
    description: Identifies when the comment was created.
  */
    createdAt: any;
    /**
    description: Check if this comment was created via an email reply.
  */
    createdViaEmail: boolean;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The diff hunk to which the comment applies.
  */
    diffHunk: string;
    /**
    description: Identifies when the comment was created in a draft state.
  */
    draftedAt: any;
    /**
    description: The actor who edited the comment.
  */
    editor: Actor | null;
    id: string;
    /**
    description: The moment the editor made the last edit
  */
    lastEditedAt: any | null;
    /**
    description: Identifies the original commit associated with the comment.
  */
    originalCommit: ICommit | null;
    /**
    description: The original line index in the diff to which the comment applies.
  */
    originalPosition: number;
    /**
    description: The path to which the comment applies.
  */
    path: string;
    /**
    description: The line index in the diff to which the comment applies.
  */
    position: number | null;
    /**
    description: Identifies when the comment was published at.
  */
    publishedAt: any | null;
    /**
    description: The pull request associated with this review comment.
  */
    pullRequest: IPullRequest;
    /**
    description: The pull request review associated with this review comment.
  */
    pullRequestReview: IPullRequestReview | null;
    /**
    description: A list of reactions grouped by content left on the subject.
  */
    reactionGroups: Array<IReactionGroup>;
    /**
    description: A list of Reactions left on the Issue.
  */
    reactions: IReactionConnection;
    /**
    description: The comment this is a reply to.
  */
    replyTo: IPullRequestReviewComment | null;
    /**
    description: The repository associated with this node.
  */
    repository: IRepository;
    /**
    description: The HTTP path permalink for this review comment.
  */
    resourcePath: any;
    /**
    description: Identifies when the comment was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL permalink for this review comment.
  */
    url: any;
    /**
    description: Check if the current viewer can delete this object.
  */
    viewerCanDelete: boolean;
    /**
    description: Can user react to this subject
  */
    viewerCanReact: boolean;
    /**
    description: Check if the current viewer can update this object.
  */
    viewerCanUpdate: boolean;
    /**
    description: Reasons why the current viewer can not update this comment.
  */
    viewerCannotUpdateReasons: Array<ICommentCannotUpdateReasonEnum>;
    /**
    description: Did the viewer author this comment.
  */
    viewerDidAuthor: boolean;
  }

  /**
    description: A suggestion to review a pull request based on a user's commit history and review comments.
  */
  interface ISuggestedReviewer {
    __typename: "SuggestedReviewer";
    /**
    description: Is this suggestion based on past commits?
  */
    isAuthor: boolean;
    /**
    description: Is this suggestion based on past review comments?
  */
    isCommenter: boolean;
    /**
    description: Identifies the user suggested to review the pull request.
  */
    reviewer: IUser;
  }

  /**
    description: The connection type for PullRequestTimelineItem.
  */
  interface IPullRequestTimelineConnection {
    __typename: "PullRequestTimelineConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IPullRequestTimelineItemEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<PullRequestTimelineItem> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IPullRequestTimelineItemEdge {
    __typename: "PullRequestTimelineItemEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: PullRequestTimelineItem | null;
  }

  /**
    description: An item in an pull request timeline
  */
  type PullRequestTimelineItem = ICommit | ICommitCommentThread | IPullRequestReview | IPullRequestReviewThread | IPullRequestReviewComment | IIssueComment | IClosedEvent | IReopenedEvent | ISubscribedEvent | IUnsubscribedEvent | IMergedEvent | IReferencedEvent | ICrossReferencedEvent | IAssignedEvent | IUnassignedEvent | ILabeledEvent | IUnlabeledEvent | IMilestonedEvent | IDemilestonedEvent | IRenamedTitleEvent | ILockedEvent | IUnlockedEvent | IDeployedEvent | IHeadRefDeletedEvent | IHeadRefRestoredEvent | IHeadRefForcePushedEvent | IBaseRefForcePushedEvent | IReviewRequestedEvent | IReviewRequestRemovedEvent | IReviewDismissedEvent;



  /**
    description: A thread of comments on a commit.
  */
  interface ICommitCommentThread {
    __typename: "CommitCommentThread";
    /**
    description: The comments that exist in this thread.
  */
    comments: ICommitCommentConnection;
    /**
    description: The commit the comments were made on.
  */
    commit: ICommit;
    id: string;
    /**
    description: The file the comments were made on.
  */
    path: string | null;
    /**
    description: The position in the diff for the commit that the comment was made on.
  */
    position: number | null;
    /**
    description: The repository associated with this node.
  */
    repository: IRepository;
  }

  /**
    description: A threaded list of comments for a given pull request.
  */
  interface IPullRequestReviewThread {
    __typename: "PullRequestReviewThread";
    /**
    description: A list of pull request comments associated with the thread.
  */
    comments: IPullRequestReviewCommentConnection;
    id: string;
    /**
    description: Identifies the pull request associated with this thread.
  */
    pullRequest: IPullRequest;
    /**
    description: Identifies the repository associated with this thread.
  */
    repository: IRepository;
  }

  /**
    description: Represents a 'closed' event on any `Closable`.
  */
  interface IClosedEvent {
    __typename: "ClosedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Object that was closed.
  */
    closable: Closable;
    /**
    description: Identifies the commit associated with the 'closed' event.
  */
    commit: ICommit | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
  }

  /**
    description: Represents a 'reopened' event on any `Closable`.
  */
  interface IReopenedEvent {
    __typename: "ReopenedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Object that was reopened.
  */
    closable: Closable;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
  }

  /**
    description: Represents a 'subscribed' event on a given `Subscribable`.
  */
  interface ISubscribedEvent {
    __typename: "SubscribedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Object referenced by event.
  */
    subscribable: Subscribable;
  }

  /**
    description: Represents an 'unsubscribed' event on a given `Subscribable`.
  */
  interface IUnsubscribedEvent {
    __typename: "UnsubscribedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Object referenced by event.
  */
    subscribable: Subscribable;
  }

  /**
    description: Represents a 'merged' event on a given pull request.
  */
  interface IMergedEvent {
    __typename: "MergedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the commit associated with the `merge` event.
  */
    commit: ICommit | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Identifies the Ref associated with the `merge` event.
  */
    mergeRef: IRef | null;
    /**
    description: Identifies the name of the Ref associated with the `merge` event.
  */
    mergeRefName: string;
    /**
    description: PullRequest referenced by event.
  */
    pullRequest: IPullRequest;
    /**
    description: The HTTP path for this merged event.
  */
    resourcePath: any;
    /**
    description: The HTTP URL for this merged event.
  */
    url: any;
  }

  /**
    description: Represents a 'referenced' event on a given `ReferencedSubject`.
  */
  interface IReferencedEvent {
    __typename: "ReferencedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the commit associated with the 'referenced' event.
  */
    commit: ICommit | null;
    /**
    description: Identifies the repository associated with the 'referenced' event.
  */
    commitRepository: IRepository;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Reference originated in a different repository.
  */
    isCrossReference: boolean;
    /**
    description: Reference originated in a different repository.
  */
    isCrossRepository: boolean;
    /**
    description: Checks if the commit message itself references the subject. Can be false in the case of a commit comment reference.
  */
    isDirectReference: boolean;
    /**
    description: Object referenced by event.
  */
    subject: ReferencedSubject;
  }

  /**
    description: Any referencable object
  */
  type ReferencedSubject = IIssue | IPullRequest;



  /**
    description: Represents a mention made by one issue or pull request to another.
  */
  interface ICrossReferencedEvent {
    __typename: "CrossReferencedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Reference originated in a different repository.
  */
    isCrossRepository: boolean;
    /**
    description: Identifies when the reference was made.
  */
    referencedAt: any;
    /**
    description: The HTTP path for this pull request.
  */
    resourcePath: any;
    /**
    description: Issue or pull request that made the reference.
  */
    source: ReferencedSubject;
    /**
    description: Issue or pull request to which the reference was made.
  */
    target: ReferencedSubject;
    /**
    description: The HTTP URL for this pull request.
  */
    url: any;
    /**
    description: Checks if the target will be closed when the source is merged.
  */
    willCloseTarget: boolean;
  }

  /**
    description: Represents an 'assigned' event on any assignable object.
  */
  interface IAssignedEvent {
    __typename: "AssignedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the assignable associated with the event.
  */
    assignable: Assignable;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Identifies the user who was assigned.
  */
    user: IUser | null;
  }

  /**
    description: Represents an 'unassigned' event on any assignable object.
  */
  interface IUnassignedEvent {
    __typename: "UnassignedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the assignable associated with the event.
  */
    assignable: Assignable;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Identifies the subject (user) who was unassigned.
  */
    user: IUser | null;
  }

  /**
    description: Represents a 'labeled' event on a given issue or pull request.
  */
  interface ILabeledEvent {
    __typename: "LabeledEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Identifies the label associated with the 'labeled' event.
  */
    label: ILabel;
    /**
    description: Identifies the `Labelable` associated with the event.
  */
    labelable: Labelable;
  }

  /**
    description: Represents an 'unlabeled' event on a given issue or pull request.
  */
  interface IUnlabeledEvent {
    __typename: "UnlabeledEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Identifies the label associated with the 'unlabeled' event.
  */
    label: ILabel;
    /**
    description: Identifies the `Labelable` associated with the event.
  */
    labelable: Labelable;
  }

  /**
    description: Represents a 'milestoned' event on a given issue or pull request.
  */
  interface IMilestonedEvent {
    __typename: "MilestonedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Identifies the milestone title associated with the 'milestoned' event.
  */
    milestoneTitle: string;
    /**
    description: Object referenced by event.
  */
    subject: MilestoneItem;
  }

  /**
    description: Types that can be inside a Milestone.
  */
  type MilestoneItem = IIssue | IPullRequest;



  /**
    description: Represents a 'demilestoned' event on a given issue or pull request.
  */
  interface IDemilestonedEvent {
    __typename: "DemilestonedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Identifies the milestone title associated with the 'demilestoned' event.
  */
    milestoneTitle: string;
    /**
    description: Object referenced by event.
  */
    subject: MilestoneItem;
  }

  /**
    description: Represents a 'renamed' event on a given issue or pull request
  */
  interface IRenamedTitleEvent {
    __typename: "RenamedTitleEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the current title of the issue or pull request.
  */
    currentTitle: string;
    id: string;
    /**
    description: Identifies the previous title of the issue or pull request.
  */
    previousTitle: string;
    /**
    description: Subject that was renamed.
  */
    subject: RenamedTitleSubject;
  }

  /**
    description: An object which has a renamable title
  */
  type RenamedTitleSubject = IIssue | IPullRequest;



  /**
    description: Represents a 'locked' event on a given issue or pull request.
  */
  interface ILockedEvent {
    __typename: "LockedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Object that was locked.
  */
    lockable: Lockable;
  }

  /**
    description: Represents an 'unlocked' event on a given issue or pull request.
  */
  interface IUnlockedEvent {
    __typename: "UnlockedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: Object that was unlocked.
  */
    lockable: Lockable;
  }

  /**
    description: Represents a 'deployed' event on a given pull request.
  */
  interface IDeployedEvent {
    __typename: "DeployedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The deployment associated with the 'deployed' event.
  */
    deployment: IDeployment;
    id: string;
    /**
    description: PullRequest referenced by event.
  */
    pullRequest: IPullRequest;
    /**
    description: The ref associated with the 'deployed' event.
  */
    ref: IRef | null;
  }

  /**
    description: Represents triggered deployment instance.
  */
  interface IDeployment {
    __typename: "Deployment";
    /**
    description: Identifies the commit sha of the deployment.
  */
    commit: ICommit | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the actor who triggered the deployment.
  */
    creator: Actor | null;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    /**
    description: The environment to which this deployment was made.
  */
    environment: string | null;
    id: string;
    /**
    description: The latest status of this deployment.
  */
    latestStatus: IDeploymentStatus | null;
    /**
    description: Extra information that a deployment system might need.
  */
    payload: string | null;
    /**
    description: Identifies the repository associated with the deployment.
  */
    repository: IRepository;
    /**
    description: The current state of the deployment.
  */
    state: IDeploymentStateEnum | null;
    /**
    description: A list of statuses associated with the deployment.
  */
    statuses: IDeploymentStatusConnection | null;
  }

  /**
    description: Describes the status of a given deployment attempt.
  */
  interface IDeploymentStatus {
    __typename: "DeploymentStatus";
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the actor who triggered the deployment.
  */
    creator: Actor | null;
    /**
    description: Identifies the deployment associated with status.
  */
    deployment: IDeployment;
    /**
    description: Identifies the description of the deployment.
  */
    description: string | null;
    /**
    description: Identifies the environment URL of the deployment.
  */
    environmentUrl: any | null;
    id: string;
    /**
    description: Identifies the log URL of the deployment.
  */
    logUrl: any | null;
    /**
    description: Identifies the current state of the deployment.
  */
    state: IDeploymentStatusStateEnum;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
  }

  /**
    description: The possible states for a deployment status.
  */
  type IDeploymentStatusStateEnum = 'PENDING' | 'SUCCESS' | 'FAILURE' | 'INACTIVE' | 'ERROR';

  /**
    description: The possible states in which a deployment can be.
  */
  type IDeploymentStateEnum = 'ABANDONED' | 'ACTIVE' | 'DESTROYED' | 'ERROR' | 'FAILURE' | 'INACTIVE' | 'PENDING';

  /**
    description: The connection type for DeploymentStatus.
  */
  interface IDeploymentStatusConnection {
    __typename: "DeploymentStatusConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IDeploymentStatusEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IDeploymentStatus> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IDeploymentStatusEdge {
    __typename: "DeploymentStatusEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IDeploymentStatus | null;
  }

  /**
    description: Represents a 'head_ref_deleted' event on a given pull request.
  */
  interface IHeadRefDeletedEvent {
    __typename: "HeadRefDeletedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the Ref associated with the `head_ref_deleted` event.
  */
    headRef: IRef | null;
    /**
    description: Identifies the name of the Ref associated with the `head_ref_deleted` event.
  */
    headRefName: string;
    id: string;
    /**
    description: PullRequest referenced by event.
  */
    pullRequest: IPullRequest;
  }

  /**
    description: Represents a 'head_ref_restored' event on a given pull request.
  */
  interface IHeadRefRestoredEvent {
    __typename: "HeadRefRestoredEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: PullRequest referenced by event.
  */
    pullRequest: IPullRequest;
  }

  /**
    description: Represents a 'head_ref_force_pushed' event on a given pull request.
  */
  interface IHeadRefForcePushedEvent {
    __typename: "HeadRefForcePushedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the after commit SHA for the 'head_ref_force_pushed' event.
  */
    afterCommit: ICommit | null;
    /**
    description: Identifies the before commit SHA for the 'head_ref_force_pushed' event.
  */
    beforeCommit: ICommit | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: PullRequest referenced by event.
  */
    pullRequest: IPullRequest;
    /**
    description: Identifies the fully qualified ref name for the 'head_ref_force_pushed' event.
  */
    ref: IRef | null;
  }

  /**
    description: Represents a 'base_ref_force_pushed' event on a given pull request.
  */
  interface IBaseRefForcePushedEvent {
    __typename: "BaseRefForcePushedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the after commit SHA for the 'base_ref_force_pushed' event.
  */
    afterCommit: ICommit | null;
    /**
    description: Identifies the before commit SHA for the 'base_ref_force_pushed' event.
  */
    beforeCommit: ICommit | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: PullRequest referenced by event.
  */
    pullRequest: IPullRequest;
    /**
    description: Identifies the fully qualified ref name for the 'base_ref_force_pushed' event.
  */
    ref: IRef | null;
  }

  /**
    description: Represents an 'review_requested' event on a given pull request.
  */
  interface IReviewRequestedEvent {
    __typename: "ReviewRequestedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: PullRequest referenced by event.
  */
    pullRequest: IPullRequest;
    /**
    description: Identifies the reviewer whose review was requested.
  */
    requestedReviewer: RequestedReviewer | null;
    /**
    description: Identifies the user whose review was requested.
  */
    subject: IUser | null;
  }

  /**
    description: Represents an 'review_request_removed' event on a given pull request.
  */
  interface IReviewRequestRemovedEvent {
    __typename: "ReviewRequestRemovedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    id: string;
    /**
    description: PullRequest referenced by event.
  */
    pullRequest: IPullRequest;
    /**
    description: Identifies the reviewer whose review request was removed.
  */
    requestedReviewer: RequestedReviewer | null;
    /**
    description: Identifies the user whose review request was removed.
  */
    subject: IUser | null;
  }

  /**
    description: Represents a 'review_dismissed' event on a given issue or pull request.
  */
  interface IReviewDismissedEvent {
    __typename: "ReviewDismissedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
    /**
    description: Identifies the message associated with the 'review_dismissed' event.
  */
    message: string;
    /**
    description: The message associated with the event, rendered to HTML.
  */
    messageHtml: any;
    /**
    description: Identifies the previous state of the review with the 'review_dismissed' event.
  */
    previousReviewState: IPullRequestReviewStateEnum;
    /**
    description: PullRequest referenced by event.
  */
    pullRequest: IPullRequest;
    /**
    description: Identifies the commit which caused the review to become stale.
  */
    pullRequestCommit: IPullRequestCommit | null;
    /**
    description: The HTTP path for this ReviewDismissedEvent.
  */
    resourcePath: any;
    /**
    description: Identifies the review associated with the 'review_dismissed' event.
  */
    review: IPullRequestReview | null;
    /**
    description: The HTTP URL for this ReviewDismissedEvent.
  */
    url: any;
  }

  /**
    description: The connection type for Deployment.
  */
  interface IDeploymentConnection {
    __typename: "DeploymentConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IDeploymentEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IDeployment> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IDeploymentEdge {
    __typename: "DeploymentEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IDeployment | null;
  }

  /**
    description: Used for return value of Repository.issueOrPullRequest.
  */
  type IssueOrPullRequest = IIssue | IPullRequest;



  /**
    description: Ordering options for language connections.
  */
  interface ILanguageOrder {
    /**
    description: The field to order languages by.
  */
    field: ILanguageOrderFieldEnum;
    /**
    description: The ordering direction.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which language connections can be ordered.
  */
  type ILanguageOrderFieldEnum = 'SIZE';

  /**
    description: A list of languages associated with the parent.
  */
  interface ILanguageConnection {
    __typename: "LanguageConnection";
    /**
    description: A list of edges.
  */
    edges: Array<ILanguageEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<ILanguage> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
    /**
    description: The total size in bytes of files written in that language.
  */
    totalSize: number;
  }

  /**
    description: Represents the language of a repository.
  */
  interface ILanguageEdge {
    __typename: "LanguageEdge";
    cursor: string;
    node: ILanguage;
    /**
    description: The number of bytes of code written in the language.
  */
    size: number;
  }

  /**
    description: Represents a given language found in repositories.
  */
  interface ILanguage {
    __typename: "Language";
    /**
    description: The color defined for the current language.
  */
    color: string | null;
    id: string;
    /**
    description: The name of the current language.
  */
    name: string;
  }

  /**
    description: The connection type for Milestone.
  */
  interface IMilestoneConnection {
    __typename: "MilestoneConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IMilestoneEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IMilestone> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IMilestoneEdge {
    __typename: "MilestoneEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IMilestone | null;
  }

  /**
    description: Ways in which lists of projects can be ordered upon return.
  */
  interface IProjectOrder {
    /**
    description: The field in which to order projects by.
  */
    field: IProjectOrderFieldEnum;
    /**
    description: The direction in which to order projects by the specified field.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which project connections can be ordered.
  */
  type IProjectOrderFieldEnum = 'CREATED_AT' | 'UPDATED_AT' | 'NAME';

  /**
    description: State of the project; either 'open' or 'closed'
  */
  type IProjectStateEnum = 'OPEN' | 'CLOSED';

  /**
    description: A list of projects associated with the owner.
  */
  interface IProjectConnection {
    __typename: "ProjectConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IProjectEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IProject> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IProjectEdge {
    __typename: "ProjectEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IProject | null;
  }

  /**
    description: The connection type for ProtectedBranch.
  */
  interface IProtectedBranchConnection {
    __typename: "ProtectedBranchConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IProtectedBranchEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IProtectedBranch> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IProtectedBranchEdge {
    __typename: "ProtectedBranchEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IProtectedBranch | null;
  }

  /**
    description: A repository protected branch.
  */
  interface IProtectedBranch {
    __typename: "ProtectedBranch";
    /**
    description: The actor who created this protected branch.
  */
    creator: Actor | null;
    /**
    description: Will new commits pushed to this branch dismiss pull request review approvals.
  */
    hasDismissableStaleReviews: boolean;
    /**
    description: Are reviews required to update this branch.
  */
    hasRequiredReviews: boolean;
    /**
    description: Are status checks required to update this branch.
  */
    hasRequiredStatusChecks: boolean;
    /**
    description: Is pushing to this branch restricted.
  */
    hasRestrictedPushes: boolean;
    /**
    description: Is dismissal of pull request reviews restricted.
  */
    hasRestrictedReviewDismissals: boolean;
    /**
    description: Are branches required to be up to date before merging.
  */
    hasStrictRequiredStatusChecks: boolean;
    id: string;
    /**
    description: Can admins overwrite branch protection.
  */
    isAdminEnforced: boolean;
    /**
    description: Identifies the name of the protected branch.
  */
    name: string;
    /**
    description: A list push allowances for this protected branch.
  */
    pushAllowances: IPushAllowanceConnection;
    /**
    description: The repository associated with this protected branch.
  */
    repository: IRepository;
    /**
    description: List of required status check contexts that must pass for commits to be accepted to this branch.
  */
    requiredStatusCheckContexts: Array<string> | null;
    /**
    description: A list review dismissal allowances for this protected branch.
  */
    reviewDismissalAllowances: IReviewDismissalAllowanceConnection;
  }

  /**
    description: The connection type for PushAllowance.
  */
  interface IPushAllowanceConnection {
    __typename: "PushAllowanceConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IPushAllowanceEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IPushAllowance> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IPushAllowanceEdge {
    __typename: "PushAllowanceEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IPushAllowance | null;
  }

  /**
    description: A team or user who has the ability to push to a protected branch.
  */
  interface IPushAllowance {
    __typename: "PushAllowance";
    /**
    description: The actor that can push.
  */
    actor: PushAllowanceActor | null;
    id: string;
    /**
    description: Identifies the protected branch associated with the allowed user or team.
  */
    protectedBranch: IProtectedBranch;
  }

  /**
    description: Types that can be an actor.
  */
  type PushAllowanceActor = IUser | ITeam;



  /**
    description: The connection type for ReviewDismissalAllowance.
  */
  interface IReviewDismissalAllowanceConnection {
    __typename: "ReviewDismissalAllowanceConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IReviewDismissalAllowanceEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IReviewDismissalAllowance> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IReviewDismissalAllowanceEdge {
    __typename: "ReviewDismissalAllowanceEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IReviewDismissalAllowance | null;
  }

  /**
    description: A team or user who has the ability to dismiss a review on a protected branch.
  */
  interface IReviewDismissalAllowance {
    __typename: "ReviewDismissalAllowance";
    /**
    description: The actor that can dismiss.
  */
    actor: ReviewDismissalAllowanceActor | null;
    id: string;
    /**
    description: Identifies the protected branch associated with the allowed user or team.
  */
    protectedBranch: IProtectedBranch;
  }

  /**
    description: Types that can be an actor.
  */
  type ReviewDismissalAllowanceActor = IUser | ITeam;



  /**
    description: Ways in which lists of git refs can be ordered upon return.
  */
  interface IRefOrder {
    /**
    description: The field in which to order refs by.
  */
    field: IRefOrderFieldEnum;
    /**
    description: The direction in which to order refs by the specified field.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which ref connections can be ordered.
  */
  type IRefOrderFieldEnum = 'TAG_COMMIT_DATE' | 'ALPHABETICAL';

  /**
    description: The connection type for Ref.
  */
  interface IRefConnection {
    __typename: "RefConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IRefEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IRef> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IRefEdge {
    __typename: "RefEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IRef | null;
  }

  /**
    description: Ways in which lists of releases can be ordered upon return.
  */
  interface IReleaseOrder {
    /**
    description: The field in which to order releases by.
  */
    field: IReleaseOrderFieldEnum;
    /**
    description: The direction in which to order releases by the specified field.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which release connections can be ordered.
  */
  type IReleaseOrderFieldEnum = 'CREATED_AT' | 'NAME';

  /**
    description: The connection type for Release.
  */
  interface IReleaseConnection {
    __typename: "ReleaseConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IReleaseEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IRelease> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IReleaseEdge {
    __typename: "ReleaseEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IRelease | null;
  }

  /**
    description: A release contains the content for a release.
  */
  interface IRelease {
    __typename: "Release";
    /**
    description: The author of the release
  */
    author: IUser | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the description of the release.
  */
    description: string | null;
    id: string;
    /**
    description: Whether or not the release is a draft
  */
    isDraft: boolean;
    /**
    description: Whether or not the release is a prerelease
  */
    isPrerelease: boolean;
    /**
    description: Identifies the title of the release.
  */
    name: string | null;
    /**
    description: Identifies the date and time when the release was created.
  */
    publishedAt: any | null;
    /**
    description: List of releases assets which are dependent on this release.
  */
    releaseAssets: IReleaseAssetConnection;
    /**
    description: The HTTP path for this issue
  */
    resourcePath: any;
    /**
    description: The Git tag the release points to
  */
    tag: IRef | null;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this issue
  */
    url: any;
  }

  /**
    description: The connection type for ReleaseAsset.
  */
  interface IReleaseAssetConnection {
    __typename: "ReleaseAssetConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IReleaseAssetEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IReleaseAsset> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IReleaseAssetEdge {
    __typename: "ReleaseAssetEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IReleaseAsset | null;
  }

  /**
    description: A release asset contains the content for a release asset.
  */
  interface IReleaseAsset {
    __typename: "ReleaseAsset";
    /**
    description: The asset's content-type
  */
    contentType: string;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: The number of times this asset was downloaded
  */
    downloadCount: number;
    /**
    description: Identifies the URL where you can download the release asset via the browser.
  */
    downloadUrl: any;
    id: string;
    /**
    description: Identifies the title of the release asset.
  */
    name: string;
    /**
    description: Release that the asset is associated with
  */
    release: IRelease | null;
    /**
    description: The size (in bytes) of the asset
  */
    size: number;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The user that performed the upload
  */
    uploadedBy: IUser;
    /**
    description: Identifies the URL of the release asset.
  */
    url: any;
  }

  /**
    description: The connection type for RepositoryTopic.
  */
  interface IRepositoryTopicConnection {
    __typename: "RepositoryTopicConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IRepositoryTopicEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IRepositoryTopic> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IRepositoryTopicEdge {
    __typename: "RepositoryTopicEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IRepositoryTopic | null;
  }

  /**
    description: A repository-topic connects a repository to a topic.
  */
  interface IRepositoryTopic {
    __typename: "RepositoryTopic";
    id: string;
    /**
    description: The HTTP path for this repository-topic.
  */
    resourcePath: any;
    /**
    description: The topic.
  */
    topic: ITopic;
    /**
    description: The HTTP URL for this repository-topic.
  */
    url: any;
  }

  /**
    description: A topic aggregates entities that are related to a subject.
  */
  interface ITopic {
    __typename: "Topic";
    id: string;
    /**
    description: The topic's name.
  */
    name: string;
    /**
    description: A list of related topics, including aliases of this topic, sorted with the most relevant
first.

  */
    relatedTopics: Array<ITopic>;
  }

  /**
    description: The connection type for User.
  */
  interface IFollowerConnection {
    __typename: "FollowerConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IUserEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IUser> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: The connection type for User.
  */
  interface IFollowingConnection {
    __typename: "FollowingConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IUserEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IUser> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: A Gist.
  */
  interface IGist {
    __typename: "Gist";
    /**
    description: A list of comments associated with the gist
  */
    comments: IGistCommentConnection;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: The gist description.
  */
    description: string | null;
    id: string;
    /**
    description: Whether the gist is public or not.
  */
    isPublic: boolean;
    /**
    description: The gist name.
  */
    name: string;
    /**
    description: The gist owner.
  */
    owner: RepositoryOwner | null;
    /**
    description: Identifies when the gist was last pushed to.
  */
    pushedAt: any | null;
    /**
    description: A list of users who have starred this starrable.
  */
    stargazers: IStargazerConnection;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: Returns a boolean indicating whether the viewing user has starred this starrable.
  */
    viewerHasStarred: boolean;
  }

  /**
    description: The connection type for GistComment.
  */
  interface IGistCommentConnection {
    __typename: "GistCommentConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IGistCommentEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IGistComment> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IGistCommentEdge {
    __typename: "GistCommentEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IGistComment | null;
  }

  /**
    description: Represents a comment on an Gist.
  */
  interface IGistComment {
    __typename: "GistComment";
    /**
    description: The actor who authored the comment.
  */
    author: Actor | null;
    /**
    description: Author's association with the gist.
  */
    authorAssociation: ICommentAuthorAssociationEnum;
    /**
    description: Identifies the comment body.
  */
    body: string;
    /**
    description: The comment body rendered to HTML.
  */
    bodyHTML: any;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Check if this comment was created via an email reply.
  */
    createdViaEmail: boolean;
    /**
    description: The actor who edited the comment.
  */
    editor: Actor | null;
    /**
    description: The associated gist.
  */
    gist: IGist;
    id: string;
    /**
    description: The moment the editor made the last edit
  */
    lastEditedAt: any | null;
    /**
    description: Identifies when the comment was published at.
  */
    publishedAt: any | null;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: Check if the current viewer can delete this object.
  */
    viewerCanDelete: boolean;
    /**
    description: Check if the current viewer can update this object.
  */
    viewerCanUpdate: boolean;
    /**
    description: Reasons why the current viewer can not update this comment.
  */
    viewerCannotUpdateReasons: Array<ICommentCannotUpdateReasonEnum>;
    /**
    description: Did the viewer author this comment.
  */
    viewerDidAuthor: boolean;
  }

  /**
    description: The privacy of a Gist
  */
  type IGistPrivacyEnum = 'PUBLIC' | 'SECRET' | 'ALL';

  /**
    description: Ordering options for gist connections
  */
  interface IGistOrder {
    /**
    description: The field to order repositories by.
  */
    field: IGistOrderFieldEnum;
    /**
    description: The ordering direction.
  */
    direction: IOrderDirectionEnum;
  }

  /**
    description: Properties by which gist connections can be ordered.
  */
  type IGistOrderFieldEnum = 'CREATED_AT' | 'UPDATED_AT' | 'PUSHED_AT';

  /**
    description: The connection type for Gist.
  */
  interface IGistConnection {
    __typename: "GistConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IGistEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IGist> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IGistEdge {
    __typename: "GistEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IGist | null;
  }

  /**
    description: The connection type for Organization.
  */
  interface IOrganizationConnection {
    __typename: "OrganizationConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IOrganizationEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IOrganization> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IOrganizationEdge {
    __typename: "OrganizationEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IOrganization | null;
  }

  /**
    description: The connection type for Repository.
  */
  interface IStarredRepositoryConnection {
    __typename: "StarredRepositoryConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IStarredRepositoryEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IRepository> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: Represents a starred repository.
  */
  interface IStarredRepositoryEdge {
    __typename: "StarredRepositoryEdge";
    cursor: string;
    node: IRepository;
    /**
    description: Identifies when the item was starred.
  */
    starredAt: any;
  }

  /**
    description: The connection type for IssueTimelineItem.
  */
  interface IIssueTimelineConnection {
    __typename: "IssueTimelineConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IIssueTimelineItemEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IssueTimelineItem> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IIssueTimelineItemEdge {
    __typename: "IssueTimelineItemEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IssueTimelineItem | null;
  }

  /**
    description: An item in an issue timeline
  */
  type IssueTimelineItem = ICommit | IIssueComment | ICrossReferencedEvent | IClosedEvent | IReopenedEvent | ISubscribedEvent | IUnsubscribedEvent | IReferencedEvent | IAssignedEvent | IUnassignedEvent | ILabeledEvent | IUnlabeledEvent | IMilestonedEvent | IDemilestonedEvent | IRenamedTitleEvent | ILockedEvent | IUnlockedEvent;



  /**
    description: Various content states of a ProjectCard
  */
  type IProjectCardStateEnum = 'CONTENT_ONLY' | 'NOTE_ONLY' | 'REDACTED';

  /**
    description: An Identity Provider configured to provision SAML and SCIM identities for Organizations
  */
  interface IOrganizationIdentityProvider {
    __typename: "OrganizationIdentityProvider";
    /**
    description: The digest algorithm used to sign SAML requests for the Identity Provider.
  */
    digestMethod: any | null;
    /**
    description: External Identities provisioned by this Identity Provider
  */
    externalIdentities: IExternalIdentityConnection;
    id: string;
    /**
    description: The x509 certificate used by the Identity Provder to sign assertions and responses.
  */
    idpCertificate: any | null;
    /**
    description: The Issuer Entity ID for the SAML Identity Provider
  */
    issuer: string | null;
    /**
    description: Organization this Identity Provider belongs to
  */
    organization: IOrganization | null;
    /**
    description: The signature algorithm used to sign SAML requests for the Identity Provider.
  */
    signatureMethod: any | null;
    /**
    description: The URL endpoint for the Identity Provider's SAML SSO.
  */
    ssoUrl: any | null;
  }

  /**
    description: The connection type for ExternalIdentity.
  */
  interface IExternalIdentityConnection {
    __typename: "ExternalIdentityConnection";
    /**
    description: A list of edges.
  */
    edges: Array<IExternalIdentityEdge> | null;
    /**
    description: A list of nodes.
  */
    nodes: Array<IExternalIdentity> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: Identifies the total count of items in the connection.
  */
    totalCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface IExternalIdentityEdge {
    __typename: "ExternalIdentityEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IExternalIdentity | null;
  }

  /**
    description: An external identity provisioned by SAML SSO or SCIM.
  */
  interface IExternalIdentity {
    __typename: "ExternalIdentity";
    /**
    description: The GUID for this identity
  */
    guid: string;
    id: string;
    /**
    description: Organization invitation for this SCIM-provisioned external identity
  */
    organizationInvitation: IOrganizationInvitation | null;
    /**
    description: SAML Identity attributes
  */
    samlIdentity: IExternalIdentitySamlAttributes | null;
    /**
    description: SCIM Identity attributes
  */
    scimIdentity: IExternalIdentityScimAttributes | null;
    /**
    description: User linked to this external identity
  */
    user: IUser | null;
  }

  /**
    description: SAML attributes for the External Identity
  */
  interface IExternalIdentitySamlAttributes {
    __typename: "ExternalIdentitySamlAttributes";
    /**
    description: The NameID of the SAML identity
  */
    nameId: string | null;
  }

  /**
    description: SCIM attributes for the External Identity
  */
  interface IExternalIdentityScimAttributes {
    __typename: "ExternalIdentityScimAttributes";
    /**
    description: The userName of the SCIM identity
  */
    username: string | null;
  }

  /**
    description: The role of a user on a team.
  */
  type ITeamRoleEnum = 'ADMIN' | 'MEMBER';

  /**
    description: Represents the client's rate limit.
  */
  interface IRateLimit {
    __typename: "RateLimit";
    /**
    description: The point cost for the current query counting against the rate limit.
  */
    cost: number;
    /**
    description: The maximum number of points the client is permitted to consume in a 60 minute window.
  */
    limit: number;
    /**
    description: The maximum number of nodes this query may return
  */
    nodeCount: number;
    /**
    description: The number of points remaining in the current rate limit window.
  */
    remaining: number;
    /**
    description: The time at which the current rate limit window resets in UTC epoch seconds.
  */
    resetAt: any;
  }

  /**
    description: Represents the individual results of a search.
  */
  type ISearchTypeEnum = 'ISSUE' | 'REPOSITORY' | 'USER';

  /**
    description: A list of results that matched against a search query.
  */
  interface ISearchResultItemConnection {
    __typename: "SearchResultItemConnection";
    /**
    description: The number of pieces of code that matched the search query.
  */
    codeCount: number;
    /**
    description: A list of edges.
  */
    edges: Array<ISearchResultItemEdge> | null;
    /**
    description: The number of issues that matched the search query.
  */
    issueCount: number;
    /**
    description: A list of nodes.
  */
    nodes: Array<SearchResultItem> | null;
    /**
    description: Information to aid in pagination.
  */
    pageInfo: IPageInfo;
    /**
    description: The number of repositories that matched the search query.
  */
    repositoryCount: number;
    /**
    description: The number of users that matched the search query.
  */
    userCount: number;
    /**
    description: The number of wiki pages that matched the search query.
  */
    wikiCount: number;
  }

  /**
    description: An edge in a connection.
  */
  interface ISearchResultItemEdge {
    __typename: "SearchResultItemEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: SearchResultItem | null;
  }

  /**
    description: The results of a search.
  */
  type SearchResultItem = IIssue | IPullRequest | IRepository | IUser | IOrganization;



  /**
    description: The root query for implementing GraphQL mutations.
  */
  interface IMutation {
    __typename: "Mutation";
    /**
    description: Applies a suggested topic to the repository.
  */
    acceptTopicSuggestion: IAcceptTopicSuggestionPayload | null;
    /**
    description: Adds a comment to an Issue or Pull Request.
  */
    addComment: IAddCommentPayload | null;
    /**
    description: Adds a card to a ProjectColumn. Either `contentId` or `note` must be provided but **not** both.
  */
    addProjectCard: IAddProjectCardPayload | null;
    /**
    description: Adds a column to a Project.
  */
    addProjectColumn: IAddProjectColumnPayload | null;
    /**
    description: Adds a review to a Pull Request.
  */
    addPullRequestReview: IAddPullRequestReviewPayload | null;
    /**
    description: Adds a comment to a review.
  */
    addPullRequestReviewComment: IAddPullRequestReviewCommentPayload | null;
    /**
    description: Adds a reaction to a subject.
  */
    addReaction: IAddReactionPayload | null;
    /**
    description: Adds a star to a Starrable.
  */
    addStar: IAddStarPayload | null;
    /**
    description: Creates a new project.
  */
    createProject: ICreateProjectPayload | null;
    /**
    description: Rejects a suggested topic for the repository.
  */
    declineTopicSuggestion: IDeclineTopicSuggestionPayload | null;
    /**
    description: Deletes a project.
  */
    deleteProject: IDeleteProjectPayload | null;
    /**
    description: Deletes a project card.
  */
    deleteProjectCard: IDeleteProjectCardPayload | null;
    /**
    description: Deletes a project column.
  */
    deleteProjectColumn: IDeleteProjectColumnPayload | null;
    /**
    description: Deletes a pull request review.
  */
    deletePullRequestReview: IDeletePullRequestReviewPayload | null;
    /**
    description: Dismisses an approved or rejected pull request review.
  */
    dismissPullRequestReview: IDismissPullRequestReviewPayload | null;
    /**
    description: Moves a project card to another place.
  */
    moveProjectCard: IMoveProjectCardPayload | null;
    /**
    description: Moves a project column to another place.
  */
    moveProjectColumn: IMoveProjectColumnPayload | null;
    /**
    description: Removes outside collaborator from all repositories in an organization.
  */
    removeOutsideCollaborator: IRemoveOutsideCollaboratorPayload | null;
    /**
    description: Removes a reaction from a subject.
  */
    removeReaction: IRemoveReactionPayload | null;
    /**
    description: Removes a star from a Starrable.
  */
    removeStar: IRemoveStarPayload | null;
    /**
    description: Set review requests on a pull request.
  */
    requestReviews: IRequestReviewsPayload | null;
    /**
    description: Submits a pending pull request review.
  */
    submitPullRequestReview: ISubmitPullRequestReviewPayload | null;
    /**
    description: Updates an existing project.
  */
    updateProject: IUpdateProjectPayload | null;
    /**
    description: Updates an existing project card.
  */
    updateProjectCard: IUpdateProjectCardPayload | null;
    /**
    description: Updates an existing project column.
  */
    updateProjectColumn: IUpdateProjectColumnPayload | null;
    /**
    description: Updates the body of a pull request review.
  */
    updatePullRequestReview: IUpdatePullRequestReviewPayload | null;
    /**
    description: Updates a pull request review comment.
  */
    updatePullRequestReviewComment: IUpdatePullRequestReviewCommentPayload | null;
    /**
    description: Updates viewers repository subscription state.
  */
    updateSubscription: IUpdateSubscriptionPayload | null;
    /**
    description: Replaces the repository's topics with the given topics.
  */
    updateTopics: IUpdateTopicsPayload | null;
  }

  /**
    description: Autogenerated input type of AcceptTopicSuggestion
  */
  interface IAcceptTopicSuggestionInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the repository.
  */
    repositoryId: string;
    /**
    description: The name of the suggested topic.
  */
    name: string;
  }

  /**
    description: Autogenerated return type of AcceptTopicSuggestion
  */
  interface IAcceptTopicSuggestionPayload {
    __typename: "AcceptTopicSuggestionPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The accepted topic.
  */
    topic: ITopic;
  }

  /**
    description: Autogenerated input type of AddComment
  */
  interface IAddCommentInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the subject to modify.
  */
    subjectId: string;
    /**
    description: The contents of the comment.
  */
    body: string;
  }

  /**
    description: Autogenerated return type of AddComment
  */
  interface IAddCommentPayload {
    __typename: "AddCommentPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The edge from the subject's comment connection.
  */
    commentEdge: IIssueCommentEdge;
    /**
    description: The subject
  */
    subject: Node;
    /**
    description: The edge from the subject's timeline connection.
  */
    timelineEdge: IIssueTimelineItemEdge;
  }

  /**
    description: Autogenerated input type of AddProjectCard
  */
  interface IAddProjectCardInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the ProjectColumn.
  */
    projectColumnId: string;
    /**
    description: The content of the card. Must be a member of the ProjectCardItem union
  */
    contentId?: string | null;
    /**
    description: The note on the card.
  */
    note?: string | null;
  }

  /**
    description: Autogenerated return type of AddProjectCard
  */
  interface IAddProjectCardPayload {
    __typename: "AddProjectCardPayload";
    /**
    description: The edge from the ProjectColumn's card connection.
  */
    cardEdge: IProjectCardEdge;
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The ProjectColumn
  */
    projectColumn: IProject;
  }

  /**
    description: Autogenerated input type of AddProjectColumn
  */
  interface IAddProjectColumnInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the project.
  */
    projectId: string;
    /**
    description: The name of the column.
  */
    name: string;
  }

  /**
    description: Autogenerated return type of AddProjectColumn
  */
  interface IAddProjectColumnPayload {
    __typename: "AddProjectColumnPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The edge from the project's column connection.
  */
    columnEdge: IProjectColumnEdge;
    /**
    description: The project
  */
    project: IProject;
  }

  /**
    description: Autogenerated input type of AddPullRequestReview
  */
  interface IAddPullRequestReviewInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the pull request to modify.
  */
    pullRequestId: string;
    /**
    description: The commit OID the review pertains to.
  */
    commitOID?: any | null;
    /**
    description: The contents of the review body comment.
  */
    body?: string | null;
    /**
    description: The event to perform on the pull request review.
  */
    event?: IPullRequestReviewEventEnum | null;
    /**
    description: The review line comments.
  */
    comments?: Array<IDraftPullRequestReviewComment> | null;
  }

  /**
    description: The possible events to perform on a pull request review.
  */
  type IPullRequestReviewEventEnum = 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES' | 'DISMISS';

  /**
    description: Specifies a review comment to be left with a Pull Request Review.
  */
  interface IDraftPullRequestReviewComment {
    /**
    description: Path to the file being commented on.
  */
    path: string;
    /**
    description: Position in the file to leave a comment on.
  */
    position: number;
    /**
    description: Body of the comment to leave.
  */
    body: string;
  }

  /**
    description: Autogenerated return type of AddPullRequestReview
  */
  interface IAddPullRequestReviewPayload {
    __typename: "AddPullRequestReviewPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The newly created pull request review.
  */
    pullRequestReview: IPullRequestReview;
    /**
    description: The edge from the pull request's review connection.
  */
    reviewEdge: IPullRequestReviewEdge;
  }

  /**
    description: Autogenerated input type of AddPullRequestReviewComment
  */
  interface IAddPullRequestReviewCommentInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the review to modify.
  */
    pullRequestReviewId: string;
    /**
    description: The SHA of the commit to comment on.
  */
    commitOID?: any | null;
    /**
    description: The text of the comment.
  */
    body: string;
    /**
    description: The relative path of the file to comment on.
  */
    path?: string | null;
    /**
    description: The line index in the diff to comment on.
  */
    position?: number | null;
    /**
    description: The comment id to reply to.
  */
    inReplyTo?: string | null;
  }

  /**
    description: Autogenerated return type of AddPullRequestReviewComment
  */
  interface IAddPullRequestReviewCommentPayload {
    __typename: "AddPullRequestReviewCommentPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The newly created comment.
  */
    comment: IPullRequestReviewComment;
    /**
    description: The edge from the review's comment connection.
  */
    commentEdge: IPullRequestReviewCommentEdge;
  }

  /**
    description: Autogenerated input type of AddReaction
  */
  interface IAddReactionInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the subject to modify.
  */
    subjectId: string;
    /**
    description: The name of the emoji to react with.
  */
    content: IReactionContentEnum;
  }

  /**
    description: Autogenerated return type of AddReaction
  */
  interface IAddReactionPayload {
    __typename: "AddReactionPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The reaction object.
  */
    reaction: IReaction;
    /**
    description: The reactable subject.
  */
    subject: Reactable;
  }

  /**
    description: Autogenerated input type of AddStar
  */
  interface IAddStarInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Starrable ID to star.
  */
    starrableId: string;
  }

  /**
    description: Autogenerated return type of AddStar
  */
  interface IAddStarPayload {
    __typename: "AddStarPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The starrable.
  */
    starrable: Starrable;
  }

  /**
    description: Autogenerated input type of CreateProject
  */
  interface ICreateProjectInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The owner ID to create the project under.
  */
    ownerId: string;
    /**
    description: The name of project.
  */
    name: string;
    /**
    description: The description of project.
  */
    body?: string | null;
  }

  /**
    description: Autogenerated return type of CreateProject
  */
  interface ICreateProjectPayload {
    __typename: "CreateProjectPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The new project.
  */
    project: IProject;
  }

  /**
    description: Autogenerated input type of DeclineTopicSuggestion
  */
  interface IDeclineTopicSuggestionInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the repository.
  */
    repositoryId: string;
    /**
    description: The name of the suggested topic.
  */
    name: string;
    /**
    description: The reason why the suggested topic is declined.
  */
    reason: ITopicSuggestionDeclineReasonEnum;
  }

  /**
    description: Reason that the suggested topic is declined.
  */
  type ITopicSuggestionDeclineReasonEnum = 'NOT_RELEVANT' | 'TOO_SPECIFIC' | 'PERSONAL_PREFERENCE' | 'TOO_GENERAL';

  /**
    description: Autogenerated return type of DeclineTopicSuggestion
  */
  interface IDeclineTopicSuggestionPayload {
    __typename: "DeclineTopicSuggestionPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The declined topic.
  */
    topic: ITopic;
  }

  /**
    description: Autogenerated input type of DeleteProject
  */
  interface IDeleteProjectInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Project ID to update.
  */
    projectId: string;
  }

  /**
    description: Autogenerated return type of DeleteProject
  */
  interface IDeleteProjectPayload {
    __typename: "DeleteProjectPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The repository or organization the project was removed from.
  */
    owner: ProjectOwner;
  }

  /**
    description: Autogenerated input type of DeleteProjectCard
  */
  interface IDeleteProjectCardInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The id of the card to delete.
  */
    cardId: string;
  }

  /**
    description: Autogenerated return type of DeleteProjectCard
  */
  interface IDeleteProjectCardPayload {
    __typename: "DeleteProjectCardPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The column the deleted card was in.
  */
    column: IProjectColumn;
    /**
    description: The deleted card ID.
  */
    deletedCardId: string;
  }

  /**
    description: Autogenerated input type of DeleteProjectColumn
  */
  interface IDeleteProjectColumnInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The id of the column to delete.
  */
    columnId: string;
  }

  /**
    description: Autogenerated return type of DeleteProjectColumn
  */
  interface IDeleteProjectColumnPayload {
    __typename: "DeleteProjectColumnPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The deleted column ID.
  */
    deletedColumnId: string;
    /**
    description: The project the deleted column was in.
  */
    project: IProject;
  }

  /**
    description: Autogenerated input type of DeletePullRequestReview
  */
  interface IDeletePullRequestReviewInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the pull request review to delete.
  */
    pullRequestReviewId: string;
  }

  /**
    description: Autogenerated return type of DeletePullRequestReview
  */
  interface IDeletePullRequestReviewPayload {
    __typename: "DeletePullRequestReviewPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The deleted pull request review.
  */
    pullRequestReview: IPullRequestReview;
  }

  /**
    description: Autogenerated input type of DismissPullRequestReview
  */
  interface IDismissPullRequestReviewInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the pull request review to modify.
  */
    pullRequestReviewId: string;
    /**
    description: The contents of the pull request review dismissal message.
  */
    message: string;
  }

  /**
    description: Autogenerated return type of DismissPullRequestReview
  */
  interface IDismissPullRequestReviewPayload {
    __typename: "DismissPullRequestReviewPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The dismissed pull request review.
  */
    pullRequestReview: IPullRequestReview;
  }

  /**
    description: Autogenerated input type of MoveProjectCard
  */
  interface IMoveProjectCardInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The id of the card to move.
  */
    cardId: string;
    /**
    description: The id of the column to move it into.
  */
    columnId: string;
    /**
    description: Place the new card after the card with this id. Pass null to place it at the top.
  */
    afterCardId?: string | null;
  }

  /**
    description: Autogenerated return type of MoveProjectCard
  */
  interface IMoveProjectCardPayload {
    __typename: "MoveProjectCardPayload";
    /**
    description: The new edge of the moved card.
  */
    cardEdge: IProjectCardEdge;
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
  }

  /**
    description: Autogenerated input type of MoveProjectColumn
  */
  interface IMoveProjectColumnInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The id of the column to move.
  */
    columnId: string;
    /**
    description: Place the new column after the column with this id. Pass null to place it at the front.
  */
    afterColumnId?: string | null;
  }

  /**
    description: Autogenerated return type of MoveProjectColumn
  */
  interface IMoveProjectColumnPayload {
    __typename: "MoveProjectColumnPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The new edge of the moved column.
  */
    columnEdge: IProjectColumnEdge;
  }

  /**
    description: Autogenerated input type of RemoveOutsideCollaborator
  */
  interface IRemoveOutsideCollaboratorInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The ID of the outside collaborator to remove.
  */
    userId: string;
    /**
    description: The ID of the organization to remove the outside collaborator from.
  */
    organizationId: string;
  }

  /**
    description: Autogenerated return type of RemoveOutsideCollaborator
  */
  interface IRemoveOutsideCollaboratorPayload {
    __typename: "RemoveOutsideCollaboratorPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The user that was removed as an outside collaborator.
  */
    removedUser: IUser;
  }

  /**
    description: Autogenerated input type of RemoveReaction
  */
  interface IRemoveReactionInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the subject to modify.
  */
    subjectId: string;
    /**
    description: The name of the emoji to react with.
  */
    content: IReactionContentEnum;
  }

  /**
    description: Autogenerated return type of RemoveReaction
  */
  interface IRemoveReactionPayload {
    __typename: "RemoveReactionPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The reaction object.
  */
    reaction: IReaction;
    /**
    description: The reactable subject.
  */
    subject: Reactable;
  }

  /**
    description: Autogenerated input type of RemoveStar
  */
  interface IRemoveStarInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Starrable ID to unstar.
  */
    starrableId: string;
  }

  /**
    description: Autogenerated return type of RemoveStar
  */
  interface IRemoveStarPayload {
    __typename: "RemoveStarPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The starrable.
  */
    starrable: Starrable;
  }

  /**
    description: Autogenerated input type of RequestReviews
  */
  interface IRequestReviewsInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the pull request to modify.
  */
    pullRequestId: string;
    /**
    description: The Node IDs of the user to request.
  */
    userIds: Array<string>;
    /**
    description: The Node IDs of the team to request.
  */
    teamIds: Array<string>;
    /**
    description: Add users to the set rather than replace.
  */
    union?: boolean | null;
  }

  /**
    description: Autogenerated return type of RequestReviews
  */
  interface IRequestReviewsPayload {
    __typename: "RequestReviewsPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The pull request that is getting requests.
  */
    pullRequest: IPullRequest;
    /**
    description: The edge from the pull request to the requested reviewers.
  */
    requestedReviewersEdge: IUserEdge;
  }

  /**
    description: Autogenerated input type of SubmitPullRequestReview
  */
  interface ISubmitPullRequestReviewInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Pull Request Review ID to submit.
  */
    pullRequestReviewId: string;
    /**
    description: The event to send to the Pull Request Review.
  */
    event: IPullRequestReviewEventEnum;
    /**
    description: The text field to set on the Pull Request Review.
  */
    body?: string | null;
  }

  /**
    description: Autogenerated return type of SubmitPullRequestReview
  */
  interface ISubmitPullRequestReviewPayload {
    __typename: "SubmitPullRequestReviewPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The submitted pull request review.
  */
    pullRequestReview: IPullRequestReview;
  }

  /**
    description: Autogenerated input type of UpdateProject
  */
  interface IUpdateProjectInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Project ID to update.
  */
    projectId: string;
    /**
    description: The name of project.
  */
    name: string;
    /**
    description: The description of project.
  */
    body?: string | null;
    /**
    description: Whether the project is open or closed.
  */
    state?: IProjectStateEnum | null;
  }

  /**
    description: Autogenerated return type of UpdateProject
  */
  interface IUpdateProjectPayload {
    __typename: "UpdateProjectPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The updated project.
  */
    project: IProject;
  }

  /**
    description: Autogenerated input type of UpdateProjectCard
  */
  interface IUpdateProjectCardInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The ProjectCard ID to update.
  */
    projectCardId: string;
    /**
    description: The note of ProjectCard.
  */
    note: string;
  }

  /**
    description: Autogenerated return type of UpdateProjectCard
  */
  interface IUpdateProjectCardPayload {
    __typename: "UpdateProjectCardPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The updated ProjectCard.
  */
    projectCard: IProjectCard;
  }

  /**
    description: Autogenerated input type of UpdateProjectColumn
  */
  interface IUpdateProjectColumnInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The ProjectColumn ID to update.
  */
    projectColumnId: string;
    /**
    description: The name of project column.
  */
    name: string;
  }

  /**
    description: Autogenerated return type of UpdateProjectColumn
  */
  interface IUpdateProjectColumnPayload {
    __typename: "UpdateProjectColumnPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The updated project column.
  */
    projectColumn: IProjectColumn;
  }

  /**
    description: Autogenerated input type of UpdatePullRequestReview
  */
  interface IUpdatePullRequestReviewInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the pull request review to modify.
  */
    pullRequestReviewId: string;
    /**
    description: The contents of the pull request review body.
  */
    body: string;
  }

  /**
    description: Autogenerated return type of UpdatePullRequestReview
  */
  interface IUpdatePullRequestReviewPayload {
    __typename: "UpdatePullRequestReviewPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The updated pull request review.
  */
    pullRequestReview: IPullRequestReview;
  }

  /**
    description: Autogenerated input type of UpdatePullRequestReviewComment
  */
  interface IUpdatePullRequestReviewCommentInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the comment to modify.
  */
    pullRequestReviewCommentId: string;
    /**
    description: The text of the comment.
  */
    body: string;
  }

  /**
    description: Autogenerated return type of UpdatePullRequestReviewComment
  */
  interface IUpdatePullRequestReviewCommentPayload {
    __typename: "UpdatePullRequestReviewCommentPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The updated comment.
  */
    pullRequestReviewComment: IPullRequestReviewComment;
  }

  /**
    description: Autogenerated input type of UpdateSubscription
  */
  interface IUpdateSubscriptionInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the subscribable object to modify.
  */
    subscribableId: string;
    /**
    description: The new state of the subscription.
  */
    state: ISubscriptionStateEnum;
  }

  /**
    description: Autogenerated return type of UpdateSubscription
  */
  interface IUpdateSubscriptionPayload {
    __typename: "UpdateSubscriptionPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: The input subscribable entity.
  */
    subscribable: Subscribable;
  }

  /**
    description: Autogenerated input type of UpdateTopics
  */
  interface IUpdateTopicsInput {
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId?: string | null;
    /**
    description: The Node ID of the repository.
  */
    repositoryId: string;
    /**
    description: An array of topic names.
  */
    topicNames: Array<string>;
  }

  /**
    description: Autogenerated return type of UpdateTopics
  */
  interface IUpdateTopicsPayload {
    __typename: "UpdateTopicsPayload";
    /**
    description: A unique identifier for the client performing the mutation.
  */
    clientMutationId: string | null;
    /**
    description: Names of the provided topics that are not valid.
  */
    invalidTopicNames: Array<string>;
    /**
    description: The updated repository.
  */
    repository: IRepository;
  }

  /**
    description: An edge in a connection.
  */
  interface IUserContentEditEdge {
    __typename: "UserContentEditEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: IUserContentEdit | null;
  }

  /**
    description: An edit on user content
  */
  interface IUserContentEdit {
    __typename: "UserContentEdit";
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: The actor who edited this content,
  */
    editor: Actor | null;
    id: string;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
  }

  /**
    description: Represents a Git blob.
  */
  interface IBlob {
    __typename: "Blob";
    /**
    description: An abbreviated version of the Git object ID
  */
    abbreviatedOid: string;
    /**
    description: Byte size of Blob object
  */
    byteSize: number;
    /**
    description: The HTTP path for this Git object
  */
    commitResourcePath: any;
    /**
    description: The HTTP URL for this Git object
  */
    commitUrl: any;
    id: string;
    /**
    description: Indicates whether the Blob is binary or text
  */
    isBinary: boolean;
    /**
    description: Indicates whether the contents is truncated
  */
    isTruncated: boolean;
    /**
    description: The Git object ID
  */
    oid: any;
    /**
    description: The Repository the Git object belongs to
  */
    repository: IRepository;
    /**
    description: UTF8 text data or null if the Blob is binary
  */
    text: string | null;
  }

  /**
    description: The possible PubSub channels for an issue.
  */
  type IIssuePubSubTopicEnum = 'UPDATED' | 'MARKASREAD';

  /**
    description: The possible PubSub channels for a pull request.
  */
  type IPullRequestPubSubTopicEnum = 'UPDATED' | 'MARKASREAD' | 'HEAD_REF';

  /**
    description: A special type of user which takes actions on behalf of GitHub Apps.
  */
  interface IBot {
    __typename: "Bot";
    /**
    description: A URL pointing to the GitHub App's public avatar.
  */
    avatarUrl: any;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
    /**
    description: The username of the actor.
  */
    login: string;
    /**
    description: The HTTP path for this bot
  */
    resourcePath: any;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this bot
  */
    url: any;
  }

  /**
    description: The possible default permissions for organization-owned repositories.
  */
  type IDefaultRepositoryPermissionFieldEnum = 'READ' | 'WRITE' | 'ADMIN';

  /**
    description: Represents a 'base_ref_changed' event on a given issue or pull request.
  */
  interface IBaseRefChangedEvent {
    __typename: "BaseRefChangedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
  }

  /**
    description: Represents a 'added_to_project' event on a given issue or pull request.
  */
  interface IAddedToProjectEvent {
    __typename: "AddedToProjectEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
  }

  /**
    description: Represents a 'comment_deleted' event on a given issue or pull request.
  */
  interface ICommentDeletedEvent {
    __typename: "CommentDeletedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
  }

  /**
    description: Represents a 'converted_note_to_issue' event on a given issue or pull request.
  */
  interface IConvertedNoteToIssueEvent {
    __typename: "ConvertedNoteToIssueEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
  }

  /**
    description: Represents a 'mentioned' event on a given issue or pull request.
  */
  interface IMentionedEvent {
    __typename: "MentionedEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
  }

  /**
    description: Represents a 'moved_columns_in_project' event on a given issue or pull request.
  */
  interface IMovedColumnsInProjectEvent {
    __typename: "MovedColumnsInProjectEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
  }

  /**
    description: Represents a 'removed_from_project' event on a given issue or pull request.
  */
  interface IRemovedFromProjectEvent {
    __typename: "RemovedFromProjectEvent";
    /**
    description: Identifies the actor who performed the event.
  */
    actor: Actor | null;
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: Identifies the primary key from the database.
  */
    databaseId: number | null;
    id: string;
  }

  /**
    description: The affiliation type between collaborator and repository.
  */
  type IRepositoryCollaboratorAffiliationEnum = 'ALL' | 'OUTSIDE';

  /**
    description: An edge in a connection.
  */
  interface ITopicEdge {
    __typename: "TopicEdge";
    /**
    description: A cursor for use in pagination.
  */
    cursor: string;
    /**
    description: The item at the end of the edge.
  */
    node: ITopic | null;
  }

  /**
    description: Represents a GPG signature on a Commit or Tag.
  */
  interface IGpgSignature {
    __typename: "GpgSignature";
    /**
    description: Email used to sign this object.
  */
    email: string;
    /**
    description: True if the signature is valid and verified by GitHub.
  */
    isValid: boolean;
    /**
    description: Hex-encoded ID of the key that signed this object.
  */
    keyId: string | null;
    /**
    description: Payload for GPG signing object. Raw ODB object without the signature header.
  */
    payload: string;
    /**
    description: ASCII-armored signature header from object.
  */
    signature: string;
    /**
    description: GitHub user corresponding to the email signing this commit.
  */
    signer: IUser | null;
    /**
    description: The state of this signature. `VALID` if signature is valid and verified by GitHub, otherwise represents reason why signature is considered invalid.
  */
    state: IGitSignatureStateEnum;
  }

  /**
    description: An invitation for a user to be added to a repository.
  */
  interface IRepositoryInvitation {
    __typename: "RepositoryInvitation";
    id: string;
    /**
    description: The user who received the invitation.
  */
    invitee: IUser;
    /**
    description: The user who created the invitation.
  */
    inviter: IUser;
    /**
    description: The Repository the user is invited to.
  */
    repository: IRepositoryInvitationRepository | null;
  }

  /**
    description: A subset of repository info shared with potential collaborators.
  */
  interface IRepositoryInvitationRepository {
    __typename: "RepositoryInvitationRepository";
    /**
    description: Identifies the date and time when the object was created.
  */
    createdAt: any;
    /**
    description: The description of the repository.
  */
    description: string | null;
    /**
    description: The description of the repository rendered to HTML.
  */
    descriptionHTML: any;
    /**
    description: Indicates if the repository has issues feature enabled.
  */
    hasIssuesEnabled: boolean;
    /**
    description: Indicates if the repository has wiki feature enabled.
  */
    hasWikiEnabled: boolean;
    /**
    description: The repository's URL.
  */
    homepageUrl: any | null;
    /**
    description: Indicates if the repository is unmaintained.
  */
    isArchived: boolean;
    /**
    description: Identifies if the repository is a fork.
  */
    isFork: boolean;
    /**
    description: Indicates if the repository has been locked or not.
  */
    isLocked: boolean;
    /**
    description: Identifies if the repository is a mirror.
  */
    isMirror: boolean;
    /**
    description: Identifies if the repository is private.
  */
    isPrivate: boolean;
    /**
    description: The license associated with the repository
  */
    license: string | null;
    /**
    description: The license associated with the repository
  */
    licenseInfo: ILicense | null;
    /**
    description: The reason the repository has been locked.
  */
    lockReason: IRepositoryLockReasonEnum | null;
    /**
    description: The repository's original mirror URL.
  */
    mirrorUrl: any | null;
    /**
    description: The name of the repository.
  */
    name: string;
    /**
    description: The repository's name with owner.
  */
    nameWithOwner: string;
    /**
    description: The User owner of the repository.
  */
    owner: RepositoryOwner;
    /**
    description: Identifies when the repository was last pushed to.
  */
    pushedAt: any | null;
    /**
    description: The HTTP path for this repository
  */
    resourcePath: any;
    /**
    description: A description of the repository, rendered to HTML without any links in it.
  */
    shortDescriptionHTML: any;
    /**
    description: Identifies the date and time when the object was last updated.
  */
    updatedAt: any;
    /**
    description: The HTTP URL for this repository
  */
    url: any;
  }

  /**
    description: Represents an S/MIME signature on a Commit or Tag.
  */
  interface ISmimeSignature {
    __typename: "SmimeSignature";
    /**
    description: Email used to sign this object.
  */
    email: string;
    /**
    description: True if the signature is valid and verified by GitHub.
  */
    isValid: boolean;
    /**
    description: Payload for GPG signing object. Raw ODB object without the signature header.
  */
    payload: string;
    /**
    description: ASCII-armored signature header from object.
  */
    signature: string;
    /**
    description: GitHub user corresponding to the email signing this commit.
  */
    signer: IUser | null;
    /**
    description: The state of this signature. `VALID` if signature is valid and verified by GitHub, otherwise represents reason why signature is considered invalid.
  */
    state: IGitSignatureStateEnum;
  }

  /**
    description: Represents a Git tag.
  */
  interface ITag {
    __typename: "Tag";
    /**
    description: An abbreviated version of the Git object ID
  */
    abbreviatedOid: string;
    /**
    description: The HTTP path for this Git object
  */
    commitResourcePath: any;
    /**
    description: The HTTP URL for this Git object
  */
    commitUrl: any;
    id: string;
    /**
    description: The Git tag message.
  */
    message: string | null;
    /**
    description: The Git tag name.
  */
    name: string;
    /**
    description: The Git object ID
  */
    oid: any;
    /**
    description: The Repository the Git object belongs to
  */
    repository: IRepository;
    /**
    description: Details about the tag author.
  */
    tagger: IGitActor | null;
    /**
    description: The Git object the tag points to.
  */
    target: GitObject;
  }

  /**
    description: Represents an unknown signature on a Commit or Tag.
  */
  interface IUnknownSignature {
    __typename: "UnknownSignature";
    /**
    description: Email used to sign this object.
  */
    email: string;
    /**
    description: True if the signature is valid and verified by GitHub.
  */
    isValid: boolean;
    /**
    description: Payload for GPG signing object. Raw ODB object without the signature header.
  */
    payload: string;
    /**
    description: ASCII-armored signature header from object.
  */
    signature: string;
    /**
    description: GitHub user corresponding to the email signing this commit.
  */
    signer: IUser | null;
    /**
    description: The state of this signature. `VALID` if signature is valid and verified by GitHub, otherwise represents reason why signature is considered invalid.
  */
    state: IGitSignatureStateEnum;
  }
}

// tslint:enable
