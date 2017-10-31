# How to Merge Upstream

## Create the Merge Branch

- Add the upstream remote (if you don't have it already): `git remote
  add upstream https://github.com/Microsoft/vscode.git`
- Create a new branch for this merge named `merge-[yyyymmdd]`, ex: `git
  checkout -b merge-20171031`
- Run `git fetch upstream`
- View the latest builds for
  `Microsoft/vscode`
  [here](https://travis-ci.org/Microsoft/vscode/builds), pick the
  latest commit on `master` that has a passing build (green checkmark)
- Run `git merge [passing_commit_hash]`

## Fix Merge Conflicts

- Go through through each of the merge conflicts (if any), usually
  they are easy enough to fix
  - For some conflicts, you may have to compare the versions of the file
  upstream and on `sourcegraph/src` to gain enough context about what
  needs to be changed
  - For some large conflicts, you may have to revert some commits and/or
  rope in the feature owner to resolve the issue

## Build and Test

- Start fresh by running `git clean -dxf`
- Run `./scripts/npm.sh install` to install all the dependencies (make
  sure that you're using Node `^7.4.0` at this time of writing)
- Build the project using `npm run watch`, fix any compilation errors
  (if present)
- Create an OSS instance using `./scripts/code.sh`, and do some light
  tests to make sure all the core features work
  - signing in, custom homepage
  - editing a file
  - leaving a code comment, UI state updates correctly, etc.
- Make sure any errors that you see in the dev console aren't too
  serious / are expected (i.e. known issues)

## Create the PR

- `git commit` your changes, making sure that you include a list of
  the conflicts that you encountered (for documentation purposes)
- `git push` your merge branch to `sourcegraph/src`, and create a PR
  from it
  - include the list of conflicts in the PR
- Make sure the TravisCI build passes, and then merge the PR into
  master
  - **Note**: Make sure that you *don't* squash merge the PR, do a
    normal merge commit to maintain the commit history
