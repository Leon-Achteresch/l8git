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

The welcome screen offers a single next step: open a repository. There is nothing to configure first — the graph, the commit panel and even the first AI commit message work without setting anything up.

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

### Header

The top bar navigates between the app-level views:

| Entry | What it shows |
|-------|---------------|
| **Repository** | The main working view for the active repository |
| **Dashboard** | Insights for the active repository or across all repositories: branches, upstream drift, open PRs, working copy state, contributors, languages, recent activity, repo health |
| **Inbox** | Everything waiting on you across all repositories — see [Pull requests](pull-requests.md#the-inbox) |
| **Agents** | Agent chats and the agent overview — see [Agents](agents.md) |
| **Info / About** | Version, changelog |

The header also holds the search field and the settings button.

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
| **Tools** | Git LFS, reflog, git command log, undo, and any repository declared tools |

Below the panel switcher the branch sidebar lists **local branches, remote branches and tags**, with a filter field. This is where you create, check out and delete branches — see [Branches and stacks](branches-and-stacks.md).

The panel bar itself is configurable under **Settings → Sidebar**: reorder or hide panels, switch between list and grid layout, choose icons-only or labels-only, set the tab size, and pick which branch sections are open by default.

### Command palette and search

`Mod+K` opens the command palette. It searches branches, tags and commits, and it exposes actions directly:

- push, pull, fetch
- new branch, rebase, interactive rebase
- jump to any sidebar panel
- toggle the terminal, toggle the diff layout
- undo the last operation, open the reflog, open the git command log
- open a repository, open settings, restart the tour

`Mod+Enter` on a branch result checks it out instead of jumping to its history. For a full history search (by hash, author, email, subject, body or changed path) use the search in the History toolbar.

### Terminal

Every repository has an embedded terminal, opened from the dock at the bottom (or the right — configurable under **Settings → Workspace**). Shift+click opens a new instance. You can also configure an external terminal and your preferred IDE for "open in editor" actions.

### The island

The floating island shows the current repository, its branch, the number of pending changes and running agents. It can be moved, reset to its default position, or hidden entirely under **Settings → Interface elements**.

Click the island to switch repositories, right-click it for its menu. From there it opens two more surfaces:

- **AI chat** — the same provider you configured under **Settings → AI**, but with tools: it reads repository state (status, branches, commits, diffs) and runs l8git actions for you. Actions that change something ask for approval first; the wrench icon in the chat header switches to running them straight away.
- **Actions** — a searchable list of everything the island can do: push, pull, fetch, stage, commit, switch or create branches, stash, open any view of the app, reveal the folder, start an agent.

### Detaching the island

The island can leave the app. **Detach island** in its menu — or the picture-in-picture button in the header, which detaches it and minimizes l8git in one go — moves it into a small always-on-top window of its own. It keeps working while l8git is minimized: same repositories, same chat, same actions. **Show l8git** brings the main window back, **Dock island** returns the island into it. The detached window remembers where you left it, and closing l8git closes it too.

## Settings worth knowing early

- **Appearance** — language (German/English), light/dark/system theme, UI scale.
- **Commits** — conventional commit icons in the history, date grouping, graph lane width, the default commit message template, and the AI section.
- **AI** — provider (OpenAI, Anthropic, Google, OpenRouter, Ollama, or any OpenAI-compatible endpoint with a custom base URL), API key, model, output language, and custom prompt templates per feature. API keys are stored in the OS keychain, never in plain text.
- **Accounts** — sign in to GitHub, GitHub Enterprise, GitLab, Bitbucket or Gitea/Forgejo, either through the Git Credential Manager or with a token.
- **Signing** — GPG or SSH signing for commits and tags, globally or per repository.
- **Notifications** — native notifications for red CI, review requests, finished agents and long-running remote operations.
- **Hotkeys** — rebind every shortcut, with conflict detection. See [Keyboard shortcuts](shortcuts.md).

## Next steps

- [Commits and staging](commits-and-staging.md)
- [Branches and stacks](branches-and-stacks.md)
- [Pull requests](pull-requests.md)
