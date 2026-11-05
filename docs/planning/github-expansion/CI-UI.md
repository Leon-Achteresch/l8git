# GitHub CI UI (IDs 41–48) — third Opus

Owner: third Opus UI agent. Files: `src/components/repo/github-ci/**`, `src/lib/github-ci-ui/**`, locale namespace `ghci` in all 7 `src/locales/*.json`.

## Export for integration (original Opus wires this into `repo-ci-panel.tsx`)

| Export | File | Props |
|---|---|---|
| `GithubCiExtensions` | `src/components/repo/github-ci/github-ci-extensions.tsx` | `{ path: string; selectedRunId?: number }` |

- `path`: local repo path or `hub:login@host/owner/repo`; resolved with `useGithubTarget`. Non-GitHub / no account / no remote renders an explicit unsupported note (no controls).
- `selectedRunId`: when passed, the panel follows it (the host's selected run). When omitted, the panel shows its own run picker (latest 100 runs, "load more").
- Suggested placement: below/next to the existing run detail (`CiDetailPanel`) or as an extra tab. It is self-contained (own tabs: Logs, Compare, Matrix, Retries, Agent, Dispatch, Artifacts, Deployments) and does not duplicate the existing job graph, rerun/cancel, annotations or YAML editor.

## Status (implemented and mounted in `repo-ci-panel.tsx`; final acceptance pending)

| ID | State | What the user gets | Honest limits |
|---|---|---|---|
| 41 | implemented | Explicit per-job "Load log" via `downloadGithubFile(job_logs)`; literal search with match count + Enter/Shift+Enter navigation; timestamps toggle; next-error navigation (exact `##[error]` markers, otherwise labelled heuristic); click/Shift+click line selection → copy (or ±20 lines around focus); save log; save full run-log ZIP. Rendering is windowed (1000 lines). | No live streaming (running jobs show a snapshot note). ZIP payloads are refused as text and must be saved. Display cap 16 MiB text; transport cap 64 MiB. |
| 42 | implemented | Baseline picker for the same workflow, defaulting to the last green run created before the selected run; observed differences: commit range via compare API (commit/file counts + link), workflow YAML at both pinned SHAs (`structuredDiff`), run metadata, jobs with changed outcome + failed steps; first error lines only from logs already loaded. Separate "Possible factors (not verified)" box derived only from those observations. | Baseline jobs: first 100. No root-cause claims. |
| 43 | implemented | Workflow + ref selection (default branch prefilled), inputs parsed from the YAML at that ref (`parseWorkflowInputs`), typed controls (boolean/choice/number/string/environment), `validateWorkflowInputs` + environment-name check against `/environments`; explicit submit; exact `workflow_run_id` when returned, otherwise matching only new `workflow_dispatch` runs of same workflow/ref/actor after the click; ambiguous → list, never picks; never retried. | Environment list unavailable → name not checked (shown). |
| 44 | implemented | Run artifacts: name, size, expiry/expired, digest, commit (flags other-commit), pagination. Bytes fetched only on explicit Download → save dialog → `save_user_export_bytes`. | >64 MiB → "download on GitHub". |
| 45 | implemented | Jobs grouped by `name (a, b)` pattern into grids with per-cell exact status; click opens that job's log. Always labelled heuristic. | API has no matrix values. |
| 46 | implemented | Pick (failed) job → load its log → build `ciAgentContext` (+ optional workflow YAML at head SHA) → editable textarea → `hub_task_worktree` at the run's exact head SHA (hooks/filters off, nothing executed) → explicit acknowledgement checkbox (extra warning for `pull_request*` events) → `useAgentChatStore.sendMessage(worktree, context)`; "Open worktree" adds it as repo. | Commit must exist locally (fetch hint shown). Needs an open local clone with matching origin. |
| 47 | implemented | On demand: same workflow + exact SHA, up to 10 runs × attempts (30 attempt cap), `inconsistentJobOutcomes`, per-attempt evidence links, partial-load count, disclaimer. | Job-level only; never names a flaky test. |
| 48 | implemented | Deployments filtered to the run's exact SHA with latest status, description, preview/log URLs (http/https only, platform opener); for unfinished runs, GitHub `pending_deployments` with reviewers, wait timer and `current_user_can_approve`; "Review on GitHub". | Statuses for first 20 deployments; no in-app approve (not invented). |

All panels: loading states, permission/404/rate-limit classification with provider message, explicit unsupported state for non-GitHub/no account/no remote, freshness ("Loaded at" on refresh button), i18n in 7 locales (`ghci`).

Evidence: `npx vitest run src/lib/github-ci-ui` → 10/10 (logs parse/search/snippet/zip+size refusal, matrix grouping, last-green baseline, attempt bounds, dispatch coercion/env check/run matching/returned id, URL safety, latest deployment status, error classification). `src/lib/i18n.test.ts` passes. `npx tsc --noEmit` clean. Not run: live GitHub, UI rendering in app (needs host integration), independent review (root).

## Backend requests to root

1. ~~Binary save~~ done: `save_user_export_bytes(path, base64)` — used for ZIPs, artifacts and job-log saves.
2. ~~Dispatch run id~~ done: `dispatchWorkflow` → `WorkflowDispatchResult | null`.
3. UI adapter reads stay in `src/lib/github-ci-ui/reads.ts`: `getWorkflowRun`, `getDefaultBranch`, `listEnvironments`, `listPendingDeployments`, `compareCommits`.
