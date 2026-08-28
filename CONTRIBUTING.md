# Contributing to l8git

Thanks for taking the time to contribute. l8git is fully open source under the [MIT license](LICENSE) — there is no paid tier, no fair-source clause and no proprietary component.

This guide covers everything you need to get the app running, find your way around the code, and land a pull request.

By participating you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Architecture overview](#architecture-overview)
- [Internationalization rules](#internationalization-rules)
- [Conventions](#conventions)
- [Pull request process](#pull-request-process)
- [Where to start](#where-to-start)

---

## Prerequisites

- **Bun** — package manager and runtime ([install](https://bun.sh))
- **Rust** with `rustup` — Tauri backend ([install](https://rustup.rs))
- **Git** available in your `PATH` — l8git shells out to the system `git`
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (WebView2 ships with Windows)
- **Linux:** WebKitGTK and the related development packages — see the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

Optional, only needed for the features that use them:

- `git-lfs` for the Git LFS panel
- One of the agent CLIs (`codex`, `claude`, `opencode`, `cursor-agent`) for the agent chat
- `gpg` or `ssh-keygen` for commit signing

---

## Getting started

```bash
git clone https://github.com/Leon-Achteresch/l8git.git
cd l8git

bun install

bun run tauri dev
```

`bun run tauri dev` builds the Rust backend and starts the desktop app with hot module reloading for the frontend. The first build takes a while because the whole Rust dependency tree is compiled.

For pure UI work you can skip the Rust build:

```bash
bun run dev
```

This serves the frontend at <http://localhost:1420>. Tauri APIs are unavailable in a plain browser, so anything that calls into the backend will fail there.

---

## Development workflow

### Checks

Run these before you push. They are exactly what CI runs:

```bash
bunx tsc --noEmit                       # typecheck
bun run test                            # frontend tests (vitest)
bun run build                           # tsc + Vite production build
cd src-tauri && cargo test --all-targets # Rust tests
```

`bun run build` also produces `dist/`, which the Rust build needs for `generate_context!` — if the frontend build fails, the Rust build fails too.

### Tests

- Frontend tests use [Vitest](https://vitest.dev) and live next to the code they cover (`src/lib/inbox.test.ts`, `src/lib/stack.test.ts`, …). The agent module keeps its tests in `src/lib/agents/__tests__/`.
- Tauri `invoke` and the agent transport are replaced with `vi.mock` in tests — no real process is spawned.
- New pure functions (parsers, derivations, store logic) should come with tests. Pull them out of components so they are testable.
- Rust tests live alongside the modules and run against fixture repositories created in temporary directories.

### Building a bundle

```bash
bun run tauri build
```

---

## Architecture overview

l8git is a two-process app: a Rust backend that owns all Git and network work, and a React frontend that only renders and dispatches.

```
React frontend (src/)  ──invoke/events──►  Rust backend (src-tauri/src/)  ──►  git CLI, provider APIs, PTY
```

### Frontend (`src/`)

| Area | Notes |
|------|-------|
| `src/routes/` | TanStack Router routes, generated route tree in `src/routeTree.gen.ts` |
| `src/components/` | UI, grouped by feature (`repo/commit`, `repo/rebase`, `repo/pr`, `agents`, `app`, …); primitives in `components/ui` (shadcn/ui + Radix + Base UI) |
| `src/lib/` | Zustand stores, pure logic and helpers — this is where the testable code belongs |
| `src/locales/` | `de.json` and `en.json` translation resources |
| `src/hooks/` | Shared React hooks |

State lives in Zustand stores (`repo-store.ts`, `ui-store.ts`, `stack-store.ts`, `inbox-store.ts`, …). Preference stores use the `persist` middleware with an explicit `merge` that sanitizes persisted input — follow that pattern when you add a new preference store, never trust `localStorage` shape.

### Rust backend (`src-tauri/src/`)

| Module | Responsibility |
|--------|----------------|
| `git.rs` | Core Git operations: status, diff, staging, commit, branches, merge, cherry-pick, revert, reset, stash, tags, remotes, blame, log |
| `pr.rs` | Pull/merge request model and provider detection (GitHub, GitLab, Bitbucket, Gitea/Forgejo) |
| `providers.rs` | Provider HTTP clients — PR listing, reviews, merges, checks and pipelines |
| `rebase.rs` | Local and interactive rebase, todo lists, continue/skip/abort, fixup/autosquash |
| `undo.rs` | Operation based undo log and undo execution |
| `stack.rs` | Stacked branches: stack detection, restacking, PR chains |
| `lfs.rs` | Git LFS detection, tracked patterns, pointer inspection, `lfs pull` |
| `media.rs` | Image/binary blob loading for the media diff viewers |
| `cmdlog.rs` | Transparency log — records every git command with duration and exit status |
| `agent_review.rs` | Diff review for agent worktree sessions, hunk-level accept/discard |
| `agent_transport.rs` | JSONL-over-stdio transport for the agent CLIs |
| `claude.rs`, `cursor.rs` | Provider specific agent process handling |
| `credentials.rs`, `secrets.rs` | Git credentials and secrets in the OS keychain |
| `island.rs` | Detached Dynamic Island window and main window minimize/restore |
| `watcher.rs` | Debounced filesystem watcher per repository |
| `pty/`, `shell.rs` | Embedded terminal via `portable-pty`, shell resolution |
| `repo_tools.rs` | Repository declared tools (`.l8git/tools.json`) |
| `cmd.rs` | Shared command execution helpers |

Git operations run on a blocking thread pool via `tokio::task::spawn_blocking` and are exposed as Tauri commands. Register new commands in `lib.rs`.

Errors returned to the frontend are surfaced as toasts — return descriptive messages, and prefer stable sentinel strings over prose when the frontend has to branch on the error.

---

## Internationalization rules

**Every user-facing string must exist in every locale file.** Today that is `src/locales/de.json` and `src/locales/en.json`; German is the fallback language.

- No hardcoded UI text in components. Use `t('section.key')` from `react-i18next`.
- Keys are grouped by feature area (`commitPanel.*`, `rebaseEditor.*`, `inbox.*`, …). Add new keys to the group they belong to.
- When you add a key to one locale file, add it to **all** of them in the same commit. A missing key falls back to German and looks like a bug to English users.
- Use interpolation (`{{count}}`) and the i18next plural suffixes (`_one` / `_other`) instead of building sentences in code.

Check that the locale files are in sync before pushing:

```bash
bun -e '
const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]);
const de = new Set(flat(require("./src/locales/de.json")));
const en = new Set(flat(require("./src/locales/en.json")));
const diff = [...de].filter(k => !en.has(k)).map(k => `missing in en: ${k}`)
  .concat([...en].filter(k => !de.has(k)).map(k => `missing in de: ${k}`));
if (diff.length) { console.error(diff.join("\n")); process.exit(1); }
console.log("locales in sync");
'
```

---

## Conventions

### Conventional Commits

Commit subjects follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<optional scope>): <subject>
```

Recognized types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

This is not cosmetic. The release pipeline (`.github/workflows/release.yml`) parses commit subjects and groups them into the generated changelog by type — anything that does not match the pattern lands in an unsorted "other" bucket. Mark breaking changes with `!` after the type/scope or a `BREAKING CHANGE:` footer.

The app itself parses the same format (`src/lib/conventional-commit.ts`) to render type badges in the history, so well-formed subjects also improve the UI.

### Versioning

`package.json` holds the `major.minor` version. The release pipeline computes the patch number from the commit count since the last minor bump (`.github/scripts/compute-release-version.mjs`) and writes the result into `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` (`.github/scripts/set-version.mjs`). Do not bump patch versions by hand — only the `major.minor` part is edited manually, and the README version badge is updated along with it.

### Code style

- TypeScript everywhere in `src/`, no `any` when a real type is possible.
- Import via the `@/*` alias (maps to `./src/*`).
- Keep components focused; move logic that can be unit tested into `src/lib/`.
- Tailwind CSS 4 for styling, `cn()` from `src/lib/utils` for conditional classes.
- Follow the patterns of neighbouring files — matching the existing structure is more valuable than personal preference.

### Branching

- `development` is the integration branch. Base your work on it and open pull requests against it.
- `main` is the release branch; pushing to it triggers the release pipeline.

---

## Pull request process

1. Open an issue first for anything larger than a small fix, so the approach can be discussed before you invest time.
2. Create a branch off `development`.
3. Keep the pull request focused — one topic per PR reviews far faster.
4. Add or update tests for logic changes, and update the docs in `docs/` when behaviour changes.
5. Add the strings for **both** locales if you touched the UI.
6. Fill in the pull request template: what changed, why, and how you tested it.
7. **CI must be green before a PR is merged.** The workflow runs typecheck, frontend tests, frontend build and `cargo test --all-targets` on Linux.
8. Address review feedback with additional commits; the changelog is generated from subjects, so keep them meaningful.

Planned work and priorities live in [ROADMAP.md](ROADMAP.md) — a quick look there tells you whether something is already scheduled.

---

## Where to start

Labels such as `good first issue` can only be created on GitHub itself, so here is a concrete recommendation list instead. Each of these is a small, self-contained follow-up from the roadmap and a good first contribution. Open an issue for the one you want to take so nobody duplicates the work.

1. **Prefill the commit body when rewording** — the interactive rebase editor starts a `reword` with an empty body; load the existing commit body first (`src/components/repo/rebase`, `src-tauri/src/rebase.rs`).
2. **Validate refs in the rebase dialog and editor** — the target/onto/base inputs accept free text today; verify the ref exists before starting and show the existing `rebase.errors.unknown*` messages inline.
3. **Stack badges on branch labels** — the stacks section knows the level of every branch; surface a small badge on the branch rows in the sidebar (`src/lib/stack.ts`, `src/components/repo/sidebar`).
4. **Terminal toggle and terminal history keys into the rebinding system** — both are still hardcoded while everything else is configurable through `src/lib/hotkey-prefs.ts`.
5. **Deep links into settings sections** — support a hash/section parameter so "open settings at Hotkeys" works from the command palette instead of always landing on the first section.
6. **"Create branch from this commit" dialog** — the commit context menu can check out a commit but cannot start a branch from it.
7. **Undo error texts as sentinels** — `src-tauri/src/undo.rs` returns English prose for unsupported cases; return stable sentinel codes and translate them in the frontend.
8. **Take `default_branch` from the provider payload** — the PR views infer the base branch instead of using the value the provider already returns (`src-tauri/src/providers.rs`).

Bug reports, documentation fixes and translation improvements are equally welcome — they do not need to come from this list.
