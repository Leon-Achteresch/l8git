<div align="center">
  <img src="public/icons/128x128.png" alt="l8git logo" width="128" height="128" />
  <h1>l8git</h1>
  <p><strong>A fast, multi-repository Git desktop client built with Tauri 2, React 19, and Rust.</strong></p>
  <p>
    <a href="#features">Features</a> •
    <a href="#screenshots">Screenshots</a> •
    <a href="#installation">Installation</a> •
    <a href="#development">Development</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="ROADMAP.md">Roadmap</a>
  </p>
  <p>
    <img src="https://img.shields.io/badge/version-0.5.0-blue.svg" alt="Version" />
    <img src="https://img.shields.io/badge/Tauri-2-ffc131.svg" alt="Tauri 2" />
    <img src="https://img.shields.io/badge/React-19-61DAFB.svg" alt="React 19" />
    <img src="https://img.shields.io/badge/Rust-2021-ed7b2b.svg" alt="Rust" />
    <img src="https://img.shields.io/badge/pr-GitHub_%7C_Bitbucket-181717.svg" alt="PR Support" />
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
- **Tags** — create, delete, and delete remote tags
- **Remotes** — list, add, update, and remove remote URLs

### Pull Requests
- **GitHub** — list, view, create, comment, review, merge PRs; view check runs and legacy commit statuses
- **Bitbucket** — list, view, create, comment, merge PRs; view commit statuses
- **GitHub Enterprise** — compatible with self-hosted GHE instances
- **Auto-merge** — enable/disable auto-merge on GitHub PRs
- **PR checkout** — checkout PR branches directly from the UI
- **Avatar resolution** — commit author avatars via GitHub/Bitbucket APIs
- **Web URL** — quickly open a PR comparison page in your browser

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

### Advanced Git Features
- **Submodules** — list, init, update, sync, add, and deinit submodules; view submodule commit references
- **Worktrees** — add, remove, lock, unlock, prune, and move git worktrees
- **Git hooks** — list, view, edit, create, delete, and toggle hook executability
- **Bisect** — start, mark (good/bad/skip), and reset bisect sessions
- **Binary files** — binary file detection with dedicated diff reporting

### Terminal
- **Embedded terminal** — xterm.js-based terminal for each repository
- **Resizable** — supports interactive shell commands, resize, and repaint

### Quality of Life
- **AI commit messages** — generate meaningful commit messages via OpenAI, Anthropic, Google, OpenRouter, Ollama, or any OpenAI-compatible endpoint (custom base URL)
- **Themes** — light, dark, and system theme with smooth transitions
- **Animations** — configurable UI animation preferences
- **Internationalization** — i18n support with locale switching
- **Keyboard shortcuts** — hotkey system via TanStack Hotkeys
- **Auto-updater** — Tauri updater with automatic update checks
- **Git credentials** — store and manage HTTPS credentials for GitHub, GitHub Enterprise, Bitbucket, and GitLab

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
| `src-tauri/src/` | Rust backend — Git operations (`git.rs`), PR/CI provider APIs (`pr.rs`, `providers.rs`), credentials (`credentials.rs`), terminal (`terminal.rs`), file watcher (`watcher.rs`), shell helpers (`shell.rs`) |
| `public/` | Static assets and app icons |
| `.github/workflows/` | CI/CD release pipeline configuration |

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

1. **Rust backend** (`src-tauri/`) — handles all Git operations via shell commands, manages HTTP requests to GitHub/Bitbucket/GitLab APIs, watches filesystem changes, manages credentials, and runs an embedded terminal via portable-pty. Tauri commands expose every operation to the frontend through a typed IPC bridge.

2. **React frontend** (`src/`) — renders the UI using TanStack Router for client-side routing and Zustand for state management. The UI is organized into panels (commit, stash, PR, submodules, worktrees, hooks, CI) that swap based on the active sidebar tab. File diffs and commit history use virtualized rendering for performance with large repositories.

Git operations run on a blocking thread pool via `tokio::task::spawn_blocking` and are fully asynchronous from the UI perspective.

---

## Roadmap

Planned work — including interactive rebase, universal undo, side-by-side diffs, and Git LFS support — is tracked in [ROADMAP.md](ROADMAP.md).

---

## Contributing

Contributions are welcome! Please open an issue or pull request on [GitHub](https://github.com/Leon-Achteresch/l8git).

---

## License

[MIT](LICENSE)

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/Leon-Achteresch">Leon Achteresch</a>
</p>
