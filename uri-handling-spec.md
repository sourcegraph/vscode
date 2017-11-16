# URI handling spec

## NOTES

My (@sqs) work so far has been the following (along with recommended TODOs for @felixfbecker):

1. I added tests in extensions/git/src/test/resolver.test.ts for the current git behavior. These were flaky on CI, so I skipped them for now on master. Adding more sleeps on the branch `test-git-resolver2` makes them pass. TODO: Make these tests reliable. We will need the (similar) tests for the new behavior to be reliable, so this is worth getting right.
2. I worked on the uri-handling branch. See those commit messages. I also added the first impl and test for *cross-window* resolution in a commit on that branch.

---------

External applications (such as a web browser) need to open the following things in the editor:

- a specific branch of a repository diffed against another revision (for code review); and
- a specific location in a file (which may have an associated piece of data, like a comment or future checklist item data).

To support this:

1. Commands can be invoked by the URI handler.
2. Only commands that are registered as "external commands" (a new concept) can be invoked by the URI handler.
2. The existing Git and code comments code will register commands to support opening the things listed above.

## 1. URI handler command execution

The URI handler executes a command when it handles a URI of the following form:

```
PROTOCOL:executeCommand/COMMAND?ARGUMENTS
```

where:

- `PROTOCOL` is the protocol handler scheme registered for the application (e.g., `src` or `src-insider`)
- `COMMAND` is the name of a registered external command
- `ARGUMENTS` (optional) is a URL-encoded JSON array of arguments to execute the command with

An error is displayed if:

- `COMMAND` is not the name of a registered external command;
- `ARGUMENTS` is provided but is not a JSON array;
- during execution of the command, an exception is thrown; or
- the command returns a `Promise` that is rejected.

For example, suppose the `my.command` external command is registered. Then the URI `src:executeCommand/my.command?["my","args"]` would cause `my.command` to be executed with 2 arguments, `"my"` and `"args"`.

## 2. Command whitelisting and security

For security, the editor only executes external commands when handling URIs. It does not execute other commands (such as those registered through the normal `registerCommand` API).

This is to prevent remote code execution by an attacker who can cause victims to open arbitrary URIs (e.g., by luring victims to a web page controlled by the attacker, or by posting a link in a web forum). For example, a URI `src:executeCommand/deleteFile?[{"fsPath":"/path/to/file"}]` would cause the specified file to be deleted on the victim's machine.

External commands MUST treat their arguments as untrusted input. They must not perform destructive or otherwise unsafe actions without an additional authentication or confirmation step.

Extensions register external commands with a new API:

```
vscode.commands.registerExternalCommand(command: string, callback: (...args: any[]) => any)
```

## 3. Git and code comments commands

To actually support opening the things listed at the top of this document, the Git and code comments code will register external commands.

### Git extension

#### `git.openRemoteRepository(remoteUrl: string | vscode.Uri, options?: { HEAD?: string })`

This command's goal is that there is an editor window containing a root folder that is a Git repository with the given remote URL and (if specified) has the desired `HEAD`. The procedure is roughly as follows:

1. Does any window contain a root folder that's a Git repository with the given remote URL (and `HEAD` if specified)? If yes, activate the MRU window. Otherwise, continue.
2. Does any window contain a root folder that's a Git repository with the given remote URL (ignoring `HEAD`)? If yes, activate the MRU window and forward this command to it (so it starts at step 1). Otherwise, continue.
3. Show quickpick in MRU window:
   - Title: `Choose how to open Git branch ${options.HEAD} in repository ${remoteUrl}`
   - Item (if `HEAD` is specified and this window has a root folder that's a Git repository with the given remote URL): `Checkout in ${theRootFolder}`
   - Item (for all other windows' root folders that are this Git repository): `Switch to ${otherWindowTitle} and checkout in ${otherWindowRootFolder}`
   - Item: `Open in new window` (if chosen, they're shown a second quickpick where they can either type in a directory to clone it to, or select a known location on disk of the repository to open in a new window and checkout the branch in)
   - Item: `Cancel`
4. Perform the action described by the user's quickpick choice (including running `git checkout ${options.HEAD}` if specified).

The return value is a `Promise` that resolves to `{ windowId?: number }`, so that the caller knows if the command was forwarded to another window.

NOTE: For now, to support opening a repository to a diff view and to specific files, we can just add fields to `options` for `comparisonBase`, `fetchIfNotExists` (to specify the expected commit SHA), `openFiles` (to show files), etc.

### Code comments

#### `codeComments.openThread(orgId: number, id: number)`

This command's goal is to show the specified code comments thread in the most contextual way without modifying any Git repository or worktree state. The procedure is roughly as follows:

1. Fetch the thread from the Sourcegraph Server API.
2. Await execution of `git.openRemoteRepository(remoteUrl)` (defined above) with the remote URL of the thread's repository. If the result indicates the command was forwarded to another window, then forward this `codeComments.openThread` command to that window. Otherwise continue.
3. If the thread's attachment location resolves successfully in a worktree in the current window, then show the thread peek view at the resolved location. If it would only successfully resolve to a location in a different commit, show the thread in a readonly `git:` `TextDocumentContentProvider` of the file at that commit. Otherwise (e.g., if it's not resolvable and the original commit is not available) show the thread peek view in a special `TextDocumentContentProvider` editor that displays only the snippet text.

The thread peek view will display the original branch name and commit that the thread was created on. If the user clicks on that UI element, they get a quickopen letting them choose to either (1) view the thread attached to a `git:` `TextDocumentContentProvider` document with the contents of the file as of that original commit or (2) checkout the original commit in the current repository.

In the editor, we do not support displaying a thread in a window that doesn't have the code comment's repository as one of its root folders. This is to reduce the number of choices we present to the user. The user can get this by viewing the thread on the web.

## Other components

There will need to be a way for extensions to query the WindowsService for a list of other windows and their root folders.

## Design notes

I separated the URI handler command execution from the actual behavior of the URIs so that:

- the behavior can be implemented in the extensions/services that are responsible, instead of being implemented in the NavService;
- new behavior can be added later by extensions;
- the task of URI handling reduces to the existing vscode concept of executing commands; and
- the security characteristics of URI handling are clearer.

I think it's likely that URI handler command execution will be accepted upstream in some form, probably similar to what's specified here. Upstream will probably add an extra user whitelisting step, at least initially.
