# Task-flow browser regression tests (IDs 3, 8, 26, 28, 31, 38, 70)

Owner: Opus 5.5 test sub-agent. No commits, no production source changes.

## Files

- New `ui-test/github-task-flow-scene.tsx`: scenes `ghtf-create`, `ghtf-issue`, `ghtf-review`, `ghtf-resume`, `ghtf-reminder`, `ghtf-radar`. It renders the real `IssueCreateDialog`, `IssueDetailSheet` (incl. `IssueStartWork`, Projects), `PrReviewWorktree`, `CheckReminderBar` + the real `useCheckReminderPoller`, and `ConflictRadarTool`. It seeds the real Zustand stores (hub accounts, repo store, `useGithubWorkspace`, `useChangeWorkflow` evidence, `useReviewTaskStore`, notification permission). Every IPC call goes to a local scripted provider through the existing `__L8GIT_TEST_INVOKE__` hook and is recorded with its args in `window.__ghtf.calls`. `hub_api` errors use the backend's real `"<host> <status>: <message>"` shape. There are no tokens and no network.
- New `e2e/github-task-flows.spec.ts`: 12 tests.
- `ui-test/audit-scenes.tsx`: adds the `ghtf` prefix only (import, a `!scene.startsWith('ghtf')` seed-skip and the route). The `ghfx`/`GithubFixesScene` registration and its condition are unchanged.
- `ui-test/stubs/tauri-notification.ts`: `sendNotification(options)` now forwards to an optional `window.__L8GIT_TEST_NOTIFY__`, so tests can read the exact would-be notification. Nothing native is ever shown. This shared-stub change is additive: it does nothing when the hook is unset.

## What each test asserts (actual outgoing payloads)

| Flow | Test | Evidence |
|---|---|---|
| 26 YAML form | required field blocks submit (0 writes), then exactly ONE `POST /repos/o/r/issues` | full `hub_api` args: title, rendered body, `labels:[bug,triage]`, `assignees:[leon]`. Broken form is listed disabled with its parse error; `config.yml` is excluded |
| 26 Markdown | front matter prefills title/body | one POST with `labels:[enhancement,ui]`, `assignees:[octo]` |
| 26 404 | no template picker, no alert, blank issue creates | only `GET …/ISSUE_TEMPLATE` reads (StrictMode may repeat it); one POST with empty labels/assignees |
| 26 403 | permission error shown as an alert, no picker | alert text includes `github.com 403` |
| 28 option ID | Status select's value is the real option ID | GraphQL `updateProjectV2ItemFieldValue` variables `{project:PVT_1,item:PVTI_1,field:F_STATUS,value:{singleSelectOptionId:opt_done_c41}}`; the ITERATION field has no control |
| 28 denied defs | field-definition 403 → warning, Status read-only (title "cannot be edited"), 0 mutations | |
| 3 issue workspace | resolve `HEAD` to a full SHA; tick one comment; edit the context; click | exactly one `hub_task_worktree` `{path,expectedHost,expectedFullName,worktreePath,branch,expectedHeadSha:<40-hex>,prNumber:null,allowExternalCode:false}`; cleanup warning shown; the edited context is persisted on the subject; command set is only `git_resolve_commit, hub_api, hub_task_worktree, list_git_remotes`; "Start agent" opens a confirm containing the edit, and cancelling sends nothing |
| 8 PR review | button disabled until the consent checkbox is ticked | one `hub_task_worktree` `{prNumber:7, allowExternalCode:true, branch:review/pr-7-<sha10>, expectedHeadSha:<full>}`; no `*checkout*` command at all |
| 31 resume | seeded workspace at H0, PR head H1 | moved-head warning; saved view; only the LATEST evidence for that worktree (older/other worktrees excluded); pass/fail checks; open issue; "2 files reviewed … PR head moved since; 3 threads done"; the agent confirm contains the evidence; only `list_git_remotes` is invoked |
| 38 reminder | real bar + real poller; Playwright clock drives the 60 s interval | no polling before a reminder exists; a double click gives one reminder; `pr_checks {path:hub:leon@github.com/o/r, number:7}`; no notification while one duplicate is pending or while checks sit at the wrong head; exactly one notification `{title:"#7 test", body:"success", extra:{target:{view:"pr",…}}}` when every duplicate at the pinned head succeeds; `deliveredAt` persisted; the poller stops and 180 s later there is still one notification |
| 38 stale | checks move to a new head → "PR head moved — will not fire" | |
| 70 radar | `git_expansion {op:"overlap",…,includeWorktrees:true}`; worktree section marks only the pending path "uncommitted", shows the worktree error and the "do not cover uncommitted edits" note, and offers no simulate button | the simulation request uses the committed heads `{op:"integration",heads:[feature/a,feature/b],confirmed:false}` |

## Commands and results

`L8GIT_UI_TEST_PORT=4182 bunx playwright test e2e/github-task-flows.spec.ts --workers=1 --reporter=line` (Chromium only; no full suite, no tsc/cargo).

The machine was heavily overloaded during all runs (load 30–57 on 8 cores, at times <200 MB free RAM, no swap, root rustc/tsc gates running). Results per run:

1. 9/12 pass. Failing: YAML and 403 (still on `Loading…` after 5 s, cold dev server) and 404 (read `window.__ghtf` before the lazy scene installed it). Fix: explicit readiness wait in `open()`.
2. 7/12 pass (403 now passes). YAML/Markdown: page.goto/readiness hit the 30 s test timeout. 404: wrong assertion (StrictMode lists templates twice); now asserts that every request is the one directory GET. Project ×2: elements not found within 5 s; they passed in run 1.
3. A one-time `beforeAll` warm-up was added: the only longer budget (120 s per navigation, 240 s total). The YAML test now got past loading and failed only on `toBeDisabled()` for an `<option disabled>` (Playwright reports options as enabled). Changed to `toHaveAttribute("disabled", "")`. The worker restart then timed out the warm-up on the radar scene; radar was removed from the warm-up (all scenes share one statically imported module).
4. The warm-up's first `page.goto` timed out after 120 s → 12 did not run. Runs stopped at root's request.

**Passed at least once, unchanged since that pass:** Markdown, 403, project option ID, project denied, issue workspace (3), PR review (8), resume (31), reminder once-only (38), reminder stale (38), radar (70): 10/12.
**Not yet verified green after the last fix:** YAML form (only the option-disabled assertion changed) and 404 (assertion corrected). The final warm-up change is also unverified.

## Blockers / limits

- **Likely interaction with an unapproved production finding (not fixed, per instruction):** `MentionTextarea`'s `[token, target]` effect calls `setHits([])` while `useGithubTarget` hands back a new result object on every render. Every mounted mention textarea therefore keeps re-rendering. The create dialog always mounts one (body or form textarea), and the issue sheet mounts the reply box. This fits the create/sheet tests that were slow or timed out only on some runs, and the warm-up navigation timeouts, under CPU starvation. It is not proven: run 1 still passed the Markdown and both project tests. Re-run this spec after the approved fix, on an idle machine.
- The `use-pr-github` stale-reply and `target.ts` remote-cache findings are not exercised by these scenes (no PR detail view; each test uses a fresh page, so the module-level remote cache never sees a changed origin).
- Fork support: the UI evidence is the pinned PR payload (`prNumber` + full SHA + consent) and the absence of any checkout command. The actual `refs/pull/N/head` fetch for a fork lives in the Rust backend and is not covered by these browser tests.
- The agent hand-off is only verified up to the confirm prompt and the cancel path. Accepting would start the real agent runtime (`codexSessionManager`), which this harness does not stub.
- Projects: real GraphQL never returns iteration values with the queried fragments. The "unsupported/read-only" case is therefore covered by the missing-definitions fallback, plus an ITERATION definition that gets no control.
- The notification test forces `document.hasFocus() = false` and permission `granted`, so the real `notify` path reaches the stub. Quiet hours are default-off.
- Unit coverage unchanged: `src/lib/github-ui/remaining-ui.test.ts` (root reports the serial unit suite 215 files / 1704 tests PASS).
