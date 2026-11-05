# Remaining UI packet (Opus 5.5) — 3/8, 26, 28, 31, 35/37, 38, 70

Owner: this UI sub-agent. Root coordinates; no commits. Review findings in BACKEND-REVIEW.md / UI-REVIEW.md are **not** touched here (user approval pending).

## Files owned

- `src/components/repo/github/issue-start-work.tsx`, `issue-detail-sheet.tsx`, `issue-create-dialog.tsx`, `pr-review-worktree.tsx`, `check-reminder-bar.tsx`
- `src/components/hub/hub-inbox.tsx`
- `src/lib/github-ui/check-reminders.ts`, `inbox-model.ts`, `inbox-visit.ts`, `issue-forms-ui.ts`, `project-fields.ts`, `workspace-resume.ts`, `worktree-radar.ts` (+ `remaining-ui.test.ts`)
- `src/components/repo/workbench/run-tools.tsx` — radar `includeWorktrees` only
- `src/routes/__root.tsx` — reminder poller hook only (other packet's branch bridge preserved)
- Locale keys in namespaces `startWork`, `reviewWt`, `reminder`, `inboxx`, `issueForm`, `issue`, `wb` (en/de real; es/fr/ja/pt/zh get the English text so no key mismatch)

Not touched: PR files / inline comments / UnifiedDiffBody, CI and change-workflow packages, `app-shell.tsx`, Rust.

## Status (hand-off)

| ID | State | Flow |
|---|---|---|
| 3 | UI wired | Issue sheet → pick clone, base pinned to resolved full HEAD SHA (refreshable), branch, tick comments, edit context preview → canonical `createIssueWorkspace` (`hub_task_worktree`, no external code, hooks off). Edited context saved on the subject workspace; `cleanup_warning` shown. PR "Closes #n" offer unchanged (keys off `subjects.workspace.branch`). |
| 8 | UI wired | PR detail → explicit "I understand this checks out PR code" consent → canonical `createReviewWorkspace` (backend fetches `refs/pull/N/head`, so forks work; pinned SHA verified; branch `review/pr-N-<sha10>`). Shown only for local clones (not `hub:` paths). Dirty-guarded cleanup also unlinks the subject. |
| 26 | UI wired | Issue create: canonical `loadIssueTemplate` for YAML forms and Markdown front-matter (title/labels/assignees/body prefill); labels/assignees sent in the same create request (`submitIssueForm` / `createIssue`). 404 → no templates; other list errors shown inline; broken files listed with their parse error. |
| 28 | UI wired | Project fields: paginated `listProjectFields`; single-select `<select>` sends `singleSelectOptionId`; text/number/date editing kept; iteration/other types read-only; missing definitions/permissions shown, select falls back to read-only. |
| 31 | UI wired (persisted state only) | `WorkspaceResume` (issue + PR workspaces): reopen worktree, terminal/editor, saved branch view (`branchContexts`), latest recorded agent evidence for that worktree (checks with outcome, open issues), PR review snapshot (+ head-moved warning) and local review-task marks; editable context; agent send only after confirm. No backend state added. |
| 35/37 | UI wired | Inbox grouping via `groupSubjectEvents`; digest via `eventsSinceVisit` (first visit: none); last visit keyed by provider+host+login. |
| 38 | UI wired | Reminders in canonical store (`saveReminder` / `claimReminder`), pinned to the full head SHA of the checks shown, exact check name, `checkReminderReady` (every duplicate must be complete); claim before notify → at most once. Stale-head reminders shown and never fire. Old unpinned `l8git-check-reminders-v1` entries are intentionally ignored (cannot be pinned safely). GitHub only (needs `head_sha`). Quiet-hours prefs untouched. |
| 70 | UI wired | Radar sends `includeWorktrees: true`; worktree overlaps (uncommitted files marked) and per-worktree errors shown separately from committed-head test merges, with a note that simulations do not cover dirty edits. |

Tests: `src/lib/github-ui/remaining-ui.test.ts` (10 tests: fork review payload + consent, issue payload + comment selection, Markdown/YAML templates + 404 vs 403, project option IDs + pagination, reminder wrong head / duplicates / claim-once / account scope, inbox dedupe + first-visit digest, resume context). The old `reminderSatisfied` unit test was replaced by these stronger canonical tests.

Not done / limits: no Playwright scene for these flows (no fixture scene exists for hub GitHub subjects; adding one touches files outside this packet). Locales: en/de translated; es/fr/ja/pt/zh carry the English text for the new keys (no key mismatch). Notifications with unparsable `updatedAt` are dropped by canonical grouping.
