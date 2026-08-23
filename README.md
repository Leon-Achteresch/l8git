<div align="center">
  <img src="public/icons/128x128.png" alt="l8git logo" width="128" height="128" />
  <h1>l8git</h1>
  <p><strong>A fast, multi-repository Git desktop client built with Tauri 2, React 19, and Rust.</strong></p>
  <p>
    <a href="#features">Features</a> •
    <a href="#screenshots">Screenshots</a> •
    <a href="#installation">Installation</a> •
    <a href="docs/README.md">Documentation</a> •
    <a href="#development">Development</a> •
    <a href="CONTRIBUTING.md">Contributing</a> •
    <a href="ROADMAP.md">Roadmap</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/version-0.5.0-blue.svg" alt="Version" />
    <img src="https://img.shields.io/badge/Tauri-2-ffc131.svg" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/React-19-61DAFB.svg" alt="React 19" />
    <img src="https://img.shields.io/badge/Rust-2021-ed7b2b.svg" alt="Rust" />
    <img src="https://img.shields.io/badge/pr-GitHub_%7C_GitLab_%7C_Bitbucket_%7C_Gitea-181717.svg" alt="PR Support" />
    <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License" />
  </p>
</div>

---

**l8git** is a desktop Git client that manages **multiple repositories simultaneously** in a single, focused interface. Built for developers who juggle several projects, it combines Git operations, pull request management, CI monitoring, and more — all without leaving a fast, native desktop app.

Instead of switching between windows or terminals, l8git puts every repository on a tabbed workspace with instant access to commits, branches, stashes, diffs, remotes, submodules, worktrees, hooks, and CI pipelines.

---

## Features

### Multi-Repository Workspace
- **Tabbed interface** — add any number of local repositories and switch freely
- **Parallel operations** — fetch, pull, or push on all repos at once
- **File system watcher** — automatic refresh when files change on disk
- **Persistent state** — reopens your exact workspace layout on launch

### Git Operations
- **Status** — full file-level status (staged, unstaged, untracked) with inline diff counts
- **Staging** — stage/unstage individual files, hunks, or discard changes
- **Commit** — write commit messages, amend commits, or generate AI-powered commit messages
- **Branching** — create, checkout, delete local and remote branches
- **Merging** — merge with strategies (fast-forward, `--ff-only`, `--no-ff`, squash) and conflict resolution
- **Cherry-pick** — pick individual commits, continue/skip/abort on conflicts
- **Revert** — revert commits with merge mainline parent selection
- **Reset** — soft/mixed/hard reset to any ref
- **Stash** — push, pop, apply, drop, show, and branch from stashes
- **Tags** — create annotated and signed tags, delete local and remote tags
- **Remotes** — list, add, update, and remove remote URLs; push to any remote
- **Signing** — GPG and SSH commit/tag signing, configurable globally or per repository

### Rebase & History Rewriting
- **Rebase** — onto any ref, with `--onto`, `--autostash`, and a preview of the commits that will be replayed
- **Interactive rebase** — visual editor with drag-and-drop reordering and one-click pick/reword/squash/fixup/edit/drop
- **Fixup & amend into older commits** — straight from the commit context menu
- **Conflict-aware** — continue/skip/abort with the three-way merge editor wired in

### Undo & Transparency
- **Universal undo** — reverse the last merge, rebase, reset, cherry-pick, revert, commit or amend; never uses `--hard`
- **Reflog view** — browse where `HEAD` has been and reset back, keeping or discarding local changes
- **Git command log** — every git command l8git runs, with duration and exit status

### Stacked Branches
- **Stacks** — build branch chains, restack automatically when the base moves
- **PR chains** — submit a whole stack as a chain of pull requests
- **Graph visualization** — see the stack structure in the commit graph
- **Branch archiving** — find merged and stale branches, archive them, undo from the toast

### Pull Requests
- **GitHub** — list, view, create, comment, review, merge PRs; check runs and legacy commit statuses; GitHub Enterprise supported
- **GitLab** — merge requests and pipelines, gitlab.com and self-hosted
- **Bitbucket** — list, view, create, comment, merge PRs; view commit statuses
- **Gitea / Forgejo** — detected properly instead of falling back to GitHub; gitea.com, Codeberg and self-hosted
- **Reviews** — inline comment threads, review drafts submitted as one review, thread resolution, applicable suggested changes
- **Auto-merge** — enable/disable auto-merge on GitHub PRs
- **PR checkout** — checkout PR branches directly from the UI
- **Capability-aware UI** — actions a provider does not support are not offered

### Inbox & Notifications
- **Cross-repository inbox** — your PRs, requested reviews, red CI runs and running agents in one list
- **Native notifications** — CI turned red, review requested, agent finished or waiting, long remote operation done

### CI/CD Integration
- **GitHub Actions** — list workflow runs, view jobs and steps, rerun and cancel workflows
- **Bitbucket Pipelines** — view commit and PR pipeline statuses
- **Check annotations** — view inline check run annotations with output logs
- **Workflow file editor** — read, edit, and save `.github/workflows/*` YAML files directly

### Conflict Resolution
- **Three-way merge editor** — view base, ours, and theirs for conflicted files
- **Inline conflict editing** — edit merged content and mark as resolved
- **Stage resolved files** — automatically stages files after resolution
- **Merge/cherry-pick state inspection** — view in-progress conflicts with path lists

### Repository Insights
- **Commit history** — virtualized infinite-scroll log with date-ordered commits
- **Search commits** — search by hash, author, email, subject, body, or changed paths
- **Blame annotations** — inline git blame with author, date, and commit hash
- **Language statistics** — per-repo breakdown of programming languages
- **File explorer** — browse repository files, view file contents at any commit
- **Diffs** — staged, unstaged, and commit-to-commit diffs with syntax highlighting
- **Side-by-side & word-level diff** — switch layouts anywhere, highlight changes inside a line
- **Image diff** — before/after, swipe, and onion-skin comparison with fit and 1:1 zoom
- **Dashboard** — branch, upstream, PR, working-copy, contributor, language and repo-health cards

### Advanced Git Features
- **Submodules** — list, init, update, sync, add, and deinit submodules; view submodule commit references
- **Worktrees** — add, remove, lock, unlock, prune, and move git worktrees
- **Git hooks** — list, view, edit, create, delete, and toggle hook executability
- **Bisect** — start, mark (good/bad/skip), and reset bisect sessions
- **Binary files** — binary file detection with dedicated diff reporting
- **Git LFS** — installation/initialization status, tracked patterns, pointer inspection, `lfs pull`
- **Repository tools** — run the commands a repository declares in `.l8git/tools.json`

### Terminal
- **Embedded terminal** — xterm.js-based terminal for each repository
- **Resizable** — supports interactive shell commands, resize, and repaint

### AI Suite
- **Commit messages** — generated from the staged diff via OpenAI, Anthropic, Google, OpenRouter, Ollama, or any OpenAI-compatible endpoint (custom base URL)
- **Commit splitting** — group a pile of changes into logical commits, editable before it is applied
- **PR descriptions** — drafted from the diff between base and compare branch
- **Explain** — explain a commit, a branch against its base, or the current diff
- **Conflict suggestions** — proposed resolutions in the three-way editor, never applied automatically
- **Reroll & hints** — regenerate or refine any AI output, with editable prompt templates per feature
- **Local models** — Ollama as a first-class, key-free option

### Agents
- **Four CLI providers** — Codex, Claude Code, OpenCode and Cursor, embedded as chats inside the app
- **Worktree sessions** — every agent works in its own git worktree, so sessions run in parallel
- **Session review** — hunk-level keep/discard of what the agent changed
- **One-click finish** — commit, merge back into the base branch, clean up worktree and branch
- **Agent overview** — every thread across every repository, with status and token cost

### Quality of Life
- **Command palette** — every action reachable without the mouse
- **Hotkey rebinding** — remap every shortcut, with conflict detection
- **Onboarding** — open a repo, see the graph, get an AI commit message with zero configuration; interactive mini tour
- **Themes** — light, dark, and system theme with smooth transitions
- **Animations** — configurable UI animation preferences
- **Internationalization** — English and German, switchable at runtime
- **Auto-updater** — Tauri updater with automatic update checks
- **Git credentials** — store and manage HTTPS credentials for GitHub, GitHub Enterprise, GitLab, Bitbucket and Gitea/Forgejo in the OS keychain

---

## Screenshots

*Coming soon.*

---

## Installation

### macOS
Download the latest `.dmg` from the [releases page](https://github.com/Leon-Achteresch/l8git/releases).

### Windows
Download the latest `.msi` installer from the [releases page](https://github.com/Leon-Achteresch/l8git/releases).

### Linux
Download the `.deb` or `.AppImage` from the [releases page](https://github.com/Leon-Achteresch/l8git/releases).

> **Note:** You need `git` installed and available in your `PATH`.

---

## Documentation

User documentation lives in [`docs/`](docs/README.md) — plain Markdown, no site generator needed.

| Page | What it covers |
|------|----------------|
| [Getting started](docs/getting-started.md) | Installing, adding repositories, the workspace layout, settings |
| [Commits and staging](docs/commits-and-staging.md) | Hunk and line staging, AI commit messages, commit splitting, conflicts |
| [Branches and stacks](docs/branches-and-stacks.md) | Merging, rebase, interactive rebase, stacks, branch archiving |
| [Pull requests](docs/pull-requests.md) | Providers, reviews, merging, CI, the inbox |
| [Agents](docs/agents.md) | The four agent CLIs, worktree sessions, review and finish flow |
| [Safety net](docs/safety.md) | Undo, reflog, the git command log |
| [Keyboard shortcuts](docs/shortcuts.md) | Defaults, rebinding, context keys |

---

## Development

### Prerequisites

- **Bun** — package manager and runtime ([install](https://bun.sh))
- **Rust** with `rustup` — Tauri backend ([install](https://rustup.rs))
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (WebView2 ships with Windows)
- **Linux:** WebKitGTK and development packages — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Get Started

```bash
# Clone the repository
git clone https://github.com/Leon-Achteresch/l8git.git
cd l8git

# Install dependencies
bun install

# Start the development desktop app
bun run tauri dev
```

### Frontend-Only Development

```bash
bun run dev
```

Opens at [http://localhost:1420](http://localhost:1420) — Tauri APIs are unavailable in the browser.

### Build

```bash
# Frontend only (typecheck + Vite production build)
bun run build

# Desktop installer/app bundle
bun run tauri build
```

### Generate App Icons

```bash
bun run tauri:icon
```

Reads from `public/icons/ios/AppIcon~ios-marketing.png`.

### Project Structure

| Path | Contents |
|------|----------|
| `src/` | React UI — TanStack Router routes, Zustand stores, UI components (shadcn/ui + Radix + Motion), i18n locales |
| `src-tauri/src/` | Rust backend — Git operations (`git.rs`), rebase (`rebase.rs`), undo log (`undo.rs`), stacks (`stack.rs`), LFS (`lfs.rs`), media diffs (`media.rs`), command log (`cmdlog.rs`), agent review and transport (`agent_review.rs`, `agent_transport.rs`), PR/CI provider APIs (`pr.rs`, `providers.rs`), credentials (`credentials.rs`, `secrets.rs`), terminal (`pty/`), file watcher (`watcher.rs`) |
| `docs/` | User documentation |
| `public/` | Static assets and app icons |
| `.github/workflows/` | CI and release pipeline configuration |

TypeScript paths: `@/*` maps to `./src/*` (see `tsconfig.json`).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **UI Framework** | React 19 with TypeScript |
| **Build Tool** | Vite 7 + @vitejs/plugin-react |
| **Styling** | Tailwind CSS 4 + tw-animate-css |
| **UI Components** | shadcn/ui, Radix UI, Base UI, Motion, Vaul, Sonner, Embla Carousel |
| **Routing** | TanStack Router v1 |
| **State Management** | Zustand v5 |
| **Icons** | Lucide React |
| **Rich Text** | Monaco Editor, React Markdown + remark-gfm |
| **Charts** | Recharts |
| **Date Handling** | date-fns |
| **Internationalization** | i18next + react-i18next |
| **Code Editor** | Monaco Editor via vite-plugin-monaco-editor |
| **Desktop Runtime** | Tauri 2 (Rust backend) |
| **Terminal** | xterm.js with fit and web-links addons |
| **Git Integration** | Rust `std::process::Command` — shell-based git execution |
| **HTTP Client** | reqwest (Rust) — GitHub, Bitbucket, GitLab API access |
| **File Watching** | notify + notify-debouncer-full (Rust) |
| **PTY** | portable-pty (Rust) — terminal emulation |
| **AI** | Vercel AI SDK — OpenAI, Anthropic, Google, OpenRouter, Ollama, OpenAI-compatible providers |

---

## Architecture

l8git follows a two-process architecture:

1. **Rust backend** (`src-tauri/`) — handles all Git operations via shell commands, manages HTTP requests to the GitHub/GitLab/Bitbucket/Gitea APIs, watches filesystem changes, manages credentials, drives the agent CLIs over stdio, and runs an embedded terminal via portable-pty. Tauri commands expose every operation to the frontend through a typed IPC bridge.

2. **React frontend** (`src/`) — renders the UI using TanStack Router for client-side routing and Zustand for state management. The UI is organized into panels (commit, history, PR, CI, stash, submodules, worktrees, hooks, tools) that swap based on the active sidebar tab. File diffs and commit history use virtualized rendering for performance with large repositories.

Git operations run on a blocking thread pool via `tokio::task::spawn_blocking` and are fully asynchronous from the UI perspective. Every git command is recorded in the transparency log, so nothing the app does is hidden.

A deeper walkthrough of the module layout, the i18n rules and the testing setup is in [CONTRIBUTING.md](CONTRIBUTING.md#architecture-overview).

---

## Roadmap

Planned work is tracked in [ROADMAP.md](ROADMAP.md) — currently Linux polish, packaging channels (Homebrew, winget, AUR, Flatpak), more locales, and the road to 1.0.

---

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md): it covers the setup, the architecture, the i18n rules, the commit conventions, and the PR process. It also lists [concrete small tasks](CONTRIBUTING.md#where-to-start) that make good first contributions.

Everyone participating is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Bug reports and feature requests go through the [issue templates](https://github.com/Leon-Achteresch/l8git/issues/new/choose).

---

## Sponsoring

l8git is and will stay fully open source under MIT — no paywall, no feature gates, AI always works with your own keys or local models. If it saves you time, consider [sponsoring the development](https://github.com/sponsors/Leon-Achteresch). Sponsors are credited in the release changelog.

---

## License

[MIT](LICENSE)

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/Leon-Achteresch">Leon Achteresch</a>
</p>
