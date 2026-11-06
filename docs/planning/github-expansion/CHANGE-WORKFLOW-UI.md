# Change workflow UI (IDs 71, 72, 74, 75) — second Opus

Owner: second Opus UI agent. Files: `src/components/repo/change-workflow/**`, `src/lib/change-workflow-ui/**`, locale namespaces `changeMap`, `reviewStory`, `agentEvidence`, `changeInitiative` in all seven `src/locales/*.json` (real translations in all seven, 193 keys each, placeholder parity checked).

## Exports for integration (original Opus wires these)

| Export | File | Props | Where |
|---|---|---|---|
| `ChangeWorkflowPanel` | `src/components/repo/change-workflow/change-workflow-panel.tsx` | `{ path: string }` | Tools panel, next to `GitWorkbench` (renders nothing for hub paths). Tabs: 71 map, 74 agent evidence, 75 initiatives. Map conflict/integration buttons open `#wb-radar` / `#wb-integration`, so it must sit in the same panel as `GitWorkbench`. |
| `ReviewNarrativePanel` | `src/components/repo/change-workflow/review-narrative-panel.tsx` | `{ path: string; number: number; baseSha: string; headSha: string }` | PR detail (72), e.g. a "Story" tab. `headSha` = `PullRequestDetail.head_sha`; `baseSha` = base commit if known. The narrative scope comes from `useGithubTarget`, falling back to the local path. |

Both are named exports, so they can be lazy-loaded: `lazy(() => import("…/change-workflow-panel").then(m => ({ default: m.ChangeWorkflowPanel })))`. Three.js is a further lazy chunk inside the map (`change-map-3d.tsx`, default export).

Status: implemented and mounted by the main Opus UI agent in Tools and the PR Walkthrough tab. Final acceptance remains pending; source-specific limits below still apply. The original delegate made no app-shell or tools-panel edits.

## What each ID does (real data only)

- **71** `loadChangeMap` working-copy tree with stable path IDs; PR overlays from `pr_list` + `pr_files`; session overlays from agent worktrees (`basePath === path`) via `agent_review_summary`. Filter by path text and by PR/session/any overlay. Views: keyboard list (arrows, Enter, Backspace = up), 2D treemap (binary split, stable order, 160-tile cap), lazy Three.js 3D (WebGL failure shown). File actions: open file (`openBlameEditor`), working diff (`repo_diff_preview` staged + unstaged), PR diff (`pr_file_patch`), session diff (`agent_review_file_diff`), open Conflict radar / Integration lab. Dependencies only on an explicit "Analyse imports" click: `source_files` (≤500 JS/TS files under the focused directory, from the actual working copy with content fingerprints) → root `sourceDependencies`. It shows the scope, read/requested/candidate counts, edges, unresolved specifiers, the omitted list (always, whatever `truncated` says) and a partial flag. No edges otherwise.
- **72** Author-written chapters (title, explanation, ≥1 anchor). Anchors are chosen by clicking/Shift-clicking real lines of `pr_file_patch` on the old/new side; each pins `baseSha`/`headSha` and a SHA-256 fingerprint of the exact anchored lines. `chapterState` uses observations recomputed from the current patches: changed / missing (file or lines gone from the diff) / unknown (patch not loaded or failed). Reorder with `moveChapter`, edit, delete, jump to the anchored diff lines. No AI suggestion (optional, skipped).
- **74** Choose an agent worktree; shows task (latest chat-thread title, else "unknown"), worktree, branch, created time. `captureAgentSnapshot` → base/head/fingerprint/files; record evidence with open issues. Checks: explicit argv + timeout (workbench `CommandFields`, confirm dialog) → `evidence_run` with `expectedBaseHead`/`expectedHead`/`expectedFingerprint` and `confirmed: true`. Outcome comes from the exit code. `stale`/`afterError` are honoured even on exit 0: the note is stored, the check snapshot gets an empty fingerprint (never current again), and the panel's current capture is replaced by `after` or cleared. Re-check marks records/checks stale after content changes. Checks are offered only while the record is current.
- **75** Initiatives with steps: repository (open repos), local branch, open PR for that branch. The head is pinned via `git_resolve_commit refs/heads/<branch>` and must equal the PR's `head_sha`. Dependencies are validated with `planInitiative` (cycle/unknown errors shown). Per-step "Merge PR": `transitionInitiative` running (persisted) → `pr_detail` gate (same URL, open, head == pin) → `pr_merge` → `pr_detail` read-back must say `merged` at the pinned head → done, else failed with the message (resumable via Retry). "Refresh from provider" resolves interrupted running steps and shows PR state / branch drift. Not atomic, and the UI says so. There is no manual "mark done".

## Tests

- `src/lib/change-workflow-ui/change-workflow-ui.test.ts` (8): patch-line mapping, fingerprint current/changed/unknown/missing, layout coverage/order, leaf counts, PR number parsing, merge completes only on provider read-back, head moved → fails without merging, merged at another head → not trusted, merge call ok but provider not merged → failed.

## Known limits

- `pr_merge` now receives `expectedHeadSha` (root change), so the provider refuses a merge if the head moved; the post-merge read-back still gates "done".
- 72 patches come from `pr_file_patch` at the PR's current head. If the PR moves between the `headSha` prop and the patch fetch, observations reflect the newer patch.
- The map's PR list and working-copy tree load when the Map tab opens (the default tab).

## Backend requests to root

Resolved: `source_files` and `evidence_run` (canonical in `git-expansion/index.ts`, called via `gitExpansion`).

## Dependency change (notice to root)

- Added `three@^0.180.0` (dependency) and `@types/three@^0.180.0` (devDependency) via `bun add` for the optional 71 spatial view. Imported only by `change-map-3d.tsx` through `React.lazy`, so it is a separate chunk.
