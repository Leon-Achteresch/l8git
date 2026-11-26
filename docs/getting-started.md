# Getting started

[← Documentation index](README.md)

## Install

Download the build for your platform from the [releases page](https://github.com/Leon-Achteresch/l8git/releases):

| Platform | Artifact |
|----------|----------|
| macOS | `.dmg` |
| Windows | `.msi` |
| Linux | `.deb` or `.AppImage` |

l8git drives the system `git`, so **git must be installed and on your `PATH`**. Everything else ships with the app.

The app checks for updates on its own — you can trigger a check manually under **Settings → Updates**.

## First launch

The welcome screen starts with opening a repository. The graph and commit panel work immediately. For AI commit messages, configure a provider and model under **Settings → AI**; a hosted provider may also need an API key.

Three ways to add a repository:

- **Open local repository** — pick a folder that already contains a Git repository.
- **Drop a folder** anywhere in the window.
- **Clone repository** — either paste any Git remote URL, or, if you are signed in to a Git host under **Settings → Accounts**, pick a repository from the list. Choose a destination folder and a folder name, then clone.

There is also **Create empty repository** if you want to start from scratch.

A short interactive tour points out the commit panel, the history graph, the command palette, undo and the panel bar. You can end it at any time and restart it later from the command palette ("Restart tour").

## The workspace

l8git keeps every repository you added open at the same time and restores the exact layout on the next launch.

### Repository tabs and groups

Each repository gets a tab. Tabs can be organized into **groups** (and subgroups) — right-click a tab to create a group, move a repository into one, rename or dissolve it. Groups are useful when you work across a frontend, a backend and an infrastructure repository at once.

Per tab you can reload the repository or show its language statistics.

### Workspaces

Workspaces split your repositories into separate sets, for example work and private projects. Switch, add or rename them from the workspace button; right-click a tab or group to move it to another workspace. Each workspace remembers the repository you had open in it and shows it again when you switch back. A workspace without repositories shows the start screen so you can open, clone or create one. Opening a repository from search, the dashboard, the inbox or a notification switches to the workspace it belongs to. Deleting a workspace moves its repositories into the active one.

### Header

The top bar navigates between the app-level views:

| Entry | What it shows |
|-------|---------------|
| **Repository** | The main working view for the active repository |
| **Dashboard** | Insights for the active repository or across all repositories: branches, upstream drift, open PRs, working copy state, contributors, languages, recent activity, repo health |
| **Inbox** | Everything waiting on you across all repositories — see [Pull requests](pull-requests.md#the-inbox) |
| **Agents** | Agent chats and the agent overview — see the [Agents user guide](planning/agents-cli-integration/USER-GUIDE.md) |
| **Help & workflows** | Searchable workflow guides, checklists, Git glossary and keyboard shortcuts |

The header also holds the search field and the settings button. In **Help & workflows**, enter a familiar Git command such as `git add -p` or `git rebase --continue` to find the corresponding desktop guide.

In **Dashboard → All repos**, filter the table by repository name, path or branch. Press **Escape** in the search field to show every repository again. The totals above the table cover all registered repositories across workspaces.

The Dashboard's **Repository health** card shows conflicts, active Git operations, working copy changes, upstream drift, stashes and additional worktrees. A branch without an upstream has its own state. **Refresh** reads these values again; a failed read shows an error and preserves any previously loaded value as **last known**. A value that has never loaded stays **unknown**. The card links to the relevant repository panel or workflow guide so you can investigate each item.

### Sidebar panels

The left sidebar switches the main area between panels:

| Panel | Purpose |
|-------|---------|
| **Commit** | Working copy, staging, commit message — see [Commits and staging](commits-and-staging.md) |
| **History** | Commit graph, search, blame, diffs |
| **Pull requests** | PRs/MRs of the repository — see [Pull requests](pull-requests.md) |
| **CI** | Workflow runs, jobs, steps, check annotations |
| **Stash** | Push, pop, apply, drop, show, and branch from stashes |
| **Submodules** | Init, update, sync, add, deinit |
| **Worktrees** | Add, remove, lock, unlock, prune, move |
| **Hooks** | View, edit, create, delete and toggle Git hooks |
| **Tools** | Change map, Git LFS, reflog, Git command log, undo, and repository-declared tools |

In **Worktrees**, search by branch, path, commit hash, status or lock reason. Enter opens the first match. Open a worktree to copy its path or HEAD.

In **Tools → Change map**, browse a directory or filter by a path or suffix such as `*.tar.gz`. Select a file and open **Working-copy diff** to inspect its staged and unstaged changes. Untracked text files show a bounded preview. Select a pull request to see which files it touches. **Refresh** reads the current working copy and selected overlays again.

Below the panel switcher the branch sidebar lists **local branches, remote branches and tags**, with a filter field. This is where you create, check out and delete branches — see [Branches and stacks](branches-and-stacks.md).

The panel bar itself is configurable under **Settings → Sidebar**: reorder or hide panels, switch between list and grid layout, choose icons-only or labels-only, set the tab size, and pick which branch sections are open by default.

### Command palette and search

`Mod+K` opens the command palette. It searches branches, tags and commits, and it exposes actions directly:

- push, pull, fetch
- stage or unstage eligible files in the working copy. Both actions recheck the file list and skip merge conflicts and embedded repositories.
- new branch, rebase, interactive rebase
- jump to any sidebar panel
- toggle the terminal, toggle the diff layout
- undo the last operation, open the reflog, open the git command log
- compare two branches, tags or commits; open a workflow guide
- open a repository, open settings, restart the tour

`Mod+Enter` on a branch result checks it out instead of jumping to its history. For a full history search (by hash, author, email, subject, body or changed path) use the search in the History toolbar.

To find a tracked file, enter part of its path or a suffix such as `*.tar.gz` and choose **Find tracked files matching…**. The Blame explorer opens with that filter. Select a file to see who last changed each line. Press **Escape** in the filter to return to the directory tree.

### Terminal

Every repository has an embedded terminal, opened from the dock at the bottom (or the right — configurable under **Settings → Workspace**). Shift+click opens a new instance. You can also configure an external terminal and your preferred IDE for "open in editor" actions.

## Settings worth knowing early

- **Appearance** — language (English, German, Spanish, French, Portuguese, Japanese or Chinese), light/dark/system theme, UI scale.
- **Commits** — conventional commit icons in the history, date grouping, graph lane width, the default commit message template, and the AI section.
- **AI** — provider (OpenAI, Anthropic, Google, OpenRouter, Ollama, or any OpenAI-compatible endpoint with a custom base URL), API key, model, output language, and custom prompt templates per feature. API keys are stored in the OS keychain, never in plain text.
- **Accounts** — sign in to GitHub, GitHub Enterprise, GitLab, Bitbucket or Gitea/Forgejo, either through the Git Credential Manager or with a token.
- **Signing** — GPG or SSH signing for commits and tags, globally or per repository.
- **Notifications** — native notifications for red CI, review requests, finished agents and long-running remote operations.
- **Hotkeys** — rebind every shortcut, with conflict detection. See [Keyboard shortcuts](shortcuts.md).

## Next steps

Open **Help & workflows** from the header or press the configured Help shortcut (default `F1`). The help center suggests a guide for the active repository, including conflicts, detached HEAD and diverged branches. Guide checklists are local reading aids; opening or checking a step does not run Git commands. Contextual help buttons in comparisons, stashes, worktrees and tools open the relevant guide directly.

- [Commits and staging](commits-and-staging.md)
- [Branches and stacks](branches-and-stacks.md)
- [Pull requests](pull-requests.md)
