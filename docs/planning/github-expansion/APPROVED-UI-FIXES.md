# Approved UI review fixes (Opus 5.5)

User approval: "Alle neun beheben". This file covers the six completed-package UI findings in `UI-REVIEW.md` and the UI display side of two backend findings in `BACKEND-REVIEW.md`. Backend contracts (conditional merge, pinned patch, JSX exclusion, classification fields, mention pagination) were done by Root/Codex. Final independent review is aggregated by root.

Regression harness: `ui-test/github-fixes-scene.tsx` mounts the **real** lazy components (`GithubCiExtensions`, `ReviewNarrativePanel`, `SemanticDiffView`) over a scripted provider (`window.__ghfx`). The provider can hold and release individual requests (`hold(pattern)` / `release(pattern)`) and records every request with its arguments. Spec: `e2e/github-review-fixes.spec.ts` (native Playwright, 7 tests). Unit: `src/lib/change-workflow-ui/change-workflow-ui.test.ts`.

## UI-REVIEW 1 — P1 CI Agent tab render loop
- Fix: `ci-agent-task.tsx` `useClones` now selects the stable `s.repos` object and derives `Object.keys` with `useMemo`. Before, a fresh array per snapshot caused an unstable `getSnapshot` loop.
- Evidence: test "CI Agent tab renders without a render loop" opens the real Agent tab through the tab bar. It requires the step-1 controls and no `Maximum update depth` or `getSnapshot should be cached` console or page errors.

## UI-REVIEW 2 — P1 initiative merge race
- Fix: `initiative-ops.ts` `mergeStep` passes `expectedHeadSha: step.headSha` to `pr_merge`. On GitHub/GitLab the backend makes the provider merge conditional on that SHA. Gitea/Bitbucket refuse pinned merges before any network call. The read-back stays an extra confirmation only.
- Evidence: unit test "pins pr_merge to the checked head…". The simulated provider moves the head A→B between preflight and mutation and rejects the conditional merge. Checked: `pr_merge` received `expectedHeadSha: A`, nothing merged, step `failed` with the provider error, saves `running→failed`. A retry is still possible (resumable) and refuses at preflight without a second merge call.

## UI-REVIEW 3 — P2 stale workflow input schema
- Fix: `ci-dispatch.tsx` stores the schema together with its identity (`workflow id + path + trimmed ref`). Any other identity reads as idle. A late read for a workflow/ref that is no longer selected is dropped. `dispatch()` checks again that the loaded identity equals the current one.
- Evidence: test "a late workflow input schema for A never prepares or dispatches B". A's YAML read is held, the user selects B, then A is released. The form stays idle, with no `alpha` field and no run button. Loading B and running sends exactly one POST, to `/workflows/12/dispatches`, with `{ ref: main, inputs: { beta: from-b } }` and no `alpha`.

## UI-REVIEW 4 — P2 CI context/worktree crossing runs
- Fix: `CiAgentTask` is remounted by `ciAgentIdentity(path, repo, run id, attempt, job id)`. Inside it, context and worktree state are tagged with that identity, and every async result checks a live identity ref before writing. `send()` preflights that context id, worktree id, live identity and worktree head equal the current run head. A creation that finishes after a switch has made a real worktree. Its branch/SHA/path are kept in a persistent warning toast with an Open action, and it appears in the repository's worktree list (reloaded) for cleanup. Nothing is sent.
- Evidence: test "late CI context and worktree results never cross into another run". (a) Run 1's context build is held (workflow file read), the user switches to run 2, then it is released: run 2 shows no context. Run 2 then builds its own context (contains `test-2`, not `test-1`). (b) Run 2's `hub_task_worktree` is held, the user switches back to run 1, then it is released: the stale-worktree notice for `ci/fix-2-test-2 @ bbbbbbb` is visible. The call was pinned to B's SHA. Run 1 shows no worktree, no context and no Send button.

## UI-REVIEW 5 — P2 stale narrative patch cache
- Fix: `review-narrative-panel.tsx` `usePatches` uses revision key `path/PR/base/head`. The promise cache is keyed by revision+file, and state is stored per revision: another revision reads as empty. Late promises are discarded by a live revision ref, and observations are tagged with their revision. Every read is `pr_file_patch` with **both** `expectedHeadSha` (headRefOid) and `expectedBaseSha` (baseRefOid). The backend checks the actual provider head/base before and after the read and rejects drift. A rejection is kept as the file's error and shown as a refusal alert and in the anchored diff; such chapters are `unknown`, never current. A `null` patch (binary) is "no text patch", not a failure.
- Evidence: test "late old-head reply cannot mark the new head current". Head A's patch (which matches the anchor) is held, the view switches to head B (patch changed) and shows `Changed`. A is released late and the chapter stays `Changed`, never `Current`. All reads carry `expectedBaseSha` and both head pins. Test "matching pinned patch is current; a backend revision refusal is shown": head A shows `Current`. For head B the backend refuses, so the refusal alert, `Unknown` and the backend message are shown.

## UI-REVIEW 6 — P2 refresh leaves artifact/deployment panels stale
- Fix: the host's refresh generation (`reload`) is passed as `refresh` to `CiArtifacts` and `CiDeployments` and is part of their load effects. Artifacts also discard late page results from an older generation.
- Evidence: test "refresh reloads artifacts and deployment statuses for the same unchanged run". Run id, attempt and `updated_at` stay identical. A newly available artifact `bundle` appears after Refresh, and a deployment changes from "No status reported yet" to the new `success` status description.

## BACKEND-REVIEW 2 display — JSX/TSX excluded from dependency analysis
- `change-map.tsx` no longer spends the source-read cap on `.jsx/.tsx`. They stay import targets through the full repository path list. Excluded files (UI-side plus `sourceDependencies().unsupported`) are shown as a count with an expandable list. `changeMap.analysisLimit` and `analysisScope` in all seven locales now state the real scope (static relative JS/TS without JSX). The backend regression (no false edge from TSX rendered text) is owned by root in `dependencies.test.ts`.
- Remaining limit: no UI browser test for the change-map exclusion list; it is a direct render of the backend's `unsupported` list.

## BACKEND-REVIEW 1 display — same-version classification changes
- `semantic-diff.tsx` labels each dependency as direct/transitive · dev/runtime · optional. When `beforeClassification` and `afterClassification` differ, it shows `before → after` (struck-through before, amber, titled "Installation classification changed"), including same-version rows.
- Evidence: test "dependency view shows a same-version dev → runtime classification change" (`x@1.0.0` moved from devDependencies to dependencies) expects `direct · dev → direct · runtime`.

## BACKEND-REVIEW 3 — mention pagination
Backend-only. The returned cursor shape is unchanged, so no caller adaptation was needed. No other agent's mention files were edited.

## Translations
New/changed keys in all seven locales: `ghci.agent.staleWorktree`, `reviewStory.patchRefused`, `changeMap.unsupportedFiles`, `changeMap.analysisLimit`, `changeMap.analysisScope`, `semantic.devDep|runtimeDep|optionalDep|classChanged`.
