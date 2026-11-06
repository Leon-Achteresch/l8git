# GitHub and workflow expansion — acceptance ledger

All 78 approved audit ideas remain in scope. A backend or UI alone does not complete an item. Status values: **open**, **backend implemented / integration pending**, **implemented / verification pending**, **tested**, **blocked**. Independent high code review and user approval before fixing findings are release gates. Existing dirty app-shell.tsx changes are outside this work.

## Current acceptance status (root)

The original matrix and delegate tables below are historical implementation snapshots. Subsequent completion packets are recorded in `REMAINING-TASK-UI.md`, `REMAINING-PR-UI.md`, `CI-UI.md` and `CHANGE-WORKFLOW-UI.md`. All 78 IDs have implementation coverage and reachable UI reported; this does **not** mean all are accepted or ready to release. In particular, the former gaps for 3/8/26/28/31/38/70 and the range-contract integration were subsequently implemented.

The user authorized only the three newly confirmed P1 corrections. Opus implemented them; their independent corrective review and final checks are in progress. The nine P2 findings in `FINAL-UI-REVIEW.md` remain open and explicitly outside the approved correction scope. These include correctness issues in account/PR targeting, mention editors, workbench commands, suggestion preview/application, revision-pinned review and branch restoration. No completion or release claim is made while the approved corrections are under review and the final browser gate is unresolved. The deferred P2 findings must remain disclosed. The independent final backend review found no new confirmed issues; the latest native all-target gate passed 783 tests. `RELEASE-CHECKLIST.md` records the current validation snapshot and separates it from older partial runs.

| ID | Feature | Acceptance criterion | Status | Evidence |
|---|---|---|---|---|
| 1 | Review memory | Persist reviewed content fingerprints and compare against the current pinned PR head; unchanged files remain reviewed and changed files require re-review. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 2 | Merge readiness cockpit | Explain conflicts, checks, approvals, unresolved threads and effective branch rules without treating unknown as ready. | open | — |
| 3 | Issue to workspace | Create a linked branch/worktree and carry selected issue context into terminal/editor/agent and subsequent PR. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 4 | Saved GitHub searches | Persist editable search queries and fetch paginated matching issues/PRs for the selected account. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 5 | Reviewer management | Request/remove users and teams and suggest CODEOWNERS matches. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 6 | Merge queue | Show queue state, enqueue/dequeue with supported GitHub mutations and explicit permission failures. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 7 | Review tasks | Turn unresolved PR threads into a private, resumable work list without implicitly resolving provider threads. | open | — |
| 8 | Review worktree | Create an isolated checkout for a pinned PR head and offer explicit commands and guarded cleanup. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 9 | Edit PR title/body | Update title/body through authenticated provider APIs and refresh the displayed detail. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 10 | Draft/ready lifecycle | Toggle draft state using GitHub GraphQL and refresh state. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 11 | Edit labels | Read repository labels and replace issue/PR labels. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 12 | Assignees and milestone | Read eligible assignees/milestones and update issue/PR metadata. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 13 | PR templates | Discover supported repository template paths and populate a new PR draft from a chosen file. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 14 | Issue autocomplete | Search referenced issues/PRs for # completion and insert the selected reference. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 15 | Mention autocomplete | Search users/teams with account-aware results and insert @ mentions. | backend implemented / integration pending | `searchMentionables`: repository users + organization teams; explicit pagination/permission state |
| 16 | Persistent PR drafts | Persist title/body/base/head per account/repository and restore after reload. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 17 | Multiline comments | Submit start/end line and side metadata and render the complete comment range. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 18 | Batch suggestions | Preview and apply multiple suggestions against verified matching local content. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 19 | Comment templates | Persist private templates and insert them into review editors. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 20 | Permanent code links | Generate provider blob links pinned to a commit SHA and selected line range. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 21 | Internal GitHub URL navigation | Validate supported host/repository URLs and navigate to issue/PR details. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 22 | Close/reopen PR | Update PR state and refresh detail and lists. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 23 | Retarget PR | Update the base branch with explicit selection and refresh comparisons. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 24 | Linked issues | Display linked closing issues and navigate to their detail. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 25 | Issue details | Read body/comments/metadata and edit/comment/close/reopen issues. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 26 | Issue Forms | Load repository issue forms, validate required fields and submit rendered issue content. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 27 | Subissues/dependencies | Read and modify supported issue hierarchy/blocking relations. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 28 | GitHub Projects | Read item fields/status and update supported project fields. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 29 | Issue from diff | Compose issue body with selected code and commit-pinned permalink. | open | — |
| 30 | Private notes | Persist private notes by account/host/repository/issue-or-PR identity. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 31 | Resume task | Restore linked worktree, agent and pending review/test context for an issue. | open | — |
| 32 | Snooze | Persist time/event-based snoozes and reactivate entries when their condition occurs. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 33 | Waiting state | Separate requires-my-action from awaiting-others using provider state plus private overrides. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 34 | Priority and pins | Persist personal priority/pin per inbox subject. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 35 | Grouped inbox events | Coalesce events by subject while preserving new meaningful state changes. | backend implemented / integration pending | `src/lib/github-expansion/`; UI/background wiring pending |
| 36 | Quiet hours | Suppress native notifications in configured local-time windows without losing inbox entries. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 37 | Return summary | Record last visit and summarize meaningful newer events. | backend implemented / integration pending | `src/lib/github-expansion/`; UI/background wiring pending |
| 38 | Conditional reminders | Monitor a selected check condition and notify when satisfied once. | backend implemented / integration pending | `src/lib/github-expansion/`; UI/background wiring pending |
| 39 | Review queue | Persist a user-defined ordered list of PRs to review. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 40 | Bulk inbox actions | Mark multiple provider notifications read or snooze multiple subjects with partial-failure reporting. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 41 | Workflow logs | Fetch job/run logs through credential-safe backend transport and support bounded search. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 42 | Compare CI runs | Compare commits, workflow metadata, jobs and failures between selected runs and separate observations from hypotheses. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 43 | Workflow dispatch | List workflows, select ref/inputs and trigger workflow_dispatch with permission errors surfaced. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 44 | Artifacts | List artifacts with size/expiry/commit and download through safe redirect handling. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 45 | CI matrix | Group job matrix variants with per-cell status and job navigation. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 46 | CI agent task | Build reviewable agent context from exact run/head/logs/workflow and create an isolated task. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 47 | Flaky test hints | Compare repeat attempts for the same SHA and report contradictory test outcomes with evidence. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 48 | Deployments | Read deployment/status/preview URLs by exact ref and show approval/waiting states. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |
| 49 | Pickaxe search | Search history for introduced/removed text with bounded paging and literal argument handling. | backend implemented / integration pending | `git_expansion::tests::pickaxe_is_paged_pinned_and_treats_leading_dashes_as_text` |
| 50 | Function history | Trace selected function ranges with explicit language/Git support limitations. | backend implemented / integration pending | `line_history_and_range_diff_return_actual_pinned_history`; explicit line-range history |
| 51 | Range diff | Compare pre/post-rebase series using pinned ranges and present content changes. | backend implemented / integration pending | `line_history_and_range_diff_return_actual_pinned_history` |
| 52 | Ignore whitespace | Allow toggling whitespace comparison consistently across diff readers. | backend implemented / integration pending | `diff_preview.rs`, `diff-preview.ts`; fixtures written, Rust verification pending |
| 53 | Moved code | Show Git move highlighting separately from added content. | backend implemented / integration pending | `diff_preview.rs` produces ANSI-free patch and moved-line metadata; Rust verification pending |
| 54 | Expandable diff context | Expand context for a selected hunk without changing comparison refs. | backend implemented / integration pending | `repo_diff_preview` bounded 0–500 context; Rust fixtures pending |
| 55 | Generated files | Identify and collapse generated/vendor files without hiding their presence. | open | — |
| 56 | Diff profiles | Persist filters for tests/packages/generated files and show active filters. | open | — |
| 57 | Rendered Markdown diff | Safely render both Markdown revisions and compare their presentation. | open | — |
| 58 | Structured JSON/YAML diff | Parse both revisions and show structural changes with parse-failure fallback. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 59 | Dependency diff | Show direct/transitive package changes from supported manifest/lockfile pairs. | backend implemented / integration pending | `src/lib/github-expansion/`, `hub.rs`; live/UI verification pending |
| 60 | Blame ignore revisions | Read and respect repository .git-blame-ignore-revs with clear invalid-ref errors. | backend implemented / integration pending | `blame_ignore_validates_each_revision_and_reads_repo_file` |
| 61 | Restore historical hunk | Preview and apply a selected historical hunk against verified current contents. | backend implemented / integration pending | `historical_hunk_restore_preserves_other_lines_and_rejects_stale_preview`; branch/index/file CAS; binary/deletion fixtures |
| 62 | Rerere controls | Inspect and control recorded conflict resolutions without silently applying them. | backend implemented / integration pending | `rerere_configuration_uses_compare_and_swap`; status/remaining/diff/forget backend |
| 63 | Worktree profiles | Persist explicit setup/copy/start actions and require deliberate execution of repository commands. | backend implemented / integration pending | `worktree_profiles_require_confirmation_registered_target_and_no_overwrite` |
| 64 | Worktree housekeeping | Show worktree status/size/usage/linked PR and guarded cleanup previews. | backend implemented / integration pending | `worktree_profiles_require_confirmation_registered_target_and_no_overwrite`; filesystem modification timestamp, UI adds linked agent/PR and cleanup |
| 65 | Guided bisect | Run an explicitly selected test command and record good/bad/skip outcomes with resumable progress. | backend implemented / integration pending | `bisect_test_runs_isolated_and_can_mark_exact_tested_commit`; existing bisect log resumes state |
| 66 | Sparse checkout | Configure selected repository directories and explain omitted working-tree paths. | backend implemented / integration pending | `sparse_checkout_changes_only_clean_pinned_worktree` |
| 67 | Identity profiles | Apply selected author/signing/account configuration per repository group with first-commit preview. | backend implemented / integration pending | `src/lib/github-expansion/`; UI/background wiring pending |
| 68 | Restore branch context | Persist per-branch selected view/file/scroll/task and restore on switch. | backend implemented / integration pending | `src/lib/github-expansion/`; UI/background wiring pending |
| 69 | Integration laboratory | Combine pinned branch heads in an isolated temporary worktree, report conflicts and run explicitly authorized tests. | backend implemented / integration pending | `integration_reports_real_conflicts_and_preserves_source_worktree`; isolated bounded argv execution |
| 70 | Conflict radar | Compare active session changes and provide overlap evidence and optional isolated test merges. | backend implemented / integration pending | `integration_reports_real_conflicts_and_preserves_source_worktree`; pending-worktree radar fixture added |
| 71 | Architecture map | Provide navigable stable file/module map with PR/session/dependency overlays and optional Three.js view. | backend implemented / integration pending | `change-workflow/model.ts`, `readers.ts`: real working-copy tree/overlays, stable paths, source-tagged supplied dependencies; spatial UI and dependency acquisition pending |
| 72 | Guided PR narrative | Persist ordered review chapters pinned to diff locations and invalidate changed chapters after updates. | backend implemented / integration pending | `change-workflow/model.ts`, `store.ts`: scoped chapter order/anchors/invalidation; UI wiring pending |
| 73 | Behavior comparison | Execute declared comparison scenarios on isolated pinned revisions and associate resulting artifacts with exact heads. | backend implemented / integration pending | `behavior_comparison_runs_exact_revisions_and_collects_declared_artifacts` |
| 74 | Agent evidence | Record task/base/head/check results and mark evidence stale after changes. | backend implemented / integration pending | `change-workflow/readers.ts`: actual heads/content fingerprint, before/after check capture and stale detection; runner UI integration pending |
| 75 | Multi-repo initiative | Persist related repo branches/PRs/dependencies and resumable non-atomic integration sequence. | backend implemented / integration pending | `change-workflow/model.ts`, `store.ts`: dependency validation, ordered readiness, resumable transitions; operation/UI wiring pending |
| 76 | Selective time travel | Capture index/worktree/refs before supported operations and selectively restore verified historical content. | backend implemented / integration pending | `snapshot_preserves_raw_worktree_index_and_untracked_content`; raw binary/deletion tests added |
| 77 | Git plan editor | Represent bounded Git actions as pinned, previewable steps with isolated rehearsal and guarded execution. | backend implemented / integration pending | `successful_plan_is_pinned_and_exports_only_to_new_branch` |
| 78 | Project decision history | Resolve commit to PR/issues/discussions with source links and evidence-backed summaries. | backend implemented / integration pending | `src/lib/github-expansion/`; live GitHub verification pending |

## Advanced Git backend implementation evidence

Owned by validation_release agent: `src-tauri/src/git_expansion.rs`, `src-tauri/src/git_expansion/tests.rs` and `src/lib/git-expansion/index.ts`. Registered desktop and remote dispatch use the same `git_expansion` request contract. This section is backend evidence only; end-to-end UI/provider/native acceptance and independent high review remain open.

Executed during implementation: `cargo check --locked --features headless --lib` passed; initial 15 advanced fixture tests passed; full library suites passed 424 then 425 tests; root diff-preview integration target passed four tests. The latest compiled library test binary passed **426/426** with two test threads and contains **all 20** final advanced Git fixtures plus seven hub fixtures. The all-target cargo run was intentionally interrupted under host memory pressure before all integration targets completed; no all-target success is claimed, and latest identity-profile registration/fixture requires a fresh final build. Latest advanced fixtures also cover literal paths/symlinks, external-filter/hook suppression, binary byte preservation, deleted-file restoration, same-HEAD branch-switch invalidation and uncommitted overlaps across distinct worktrees.

Deliberate bounds: history pages are one-based and capped at page 1000; 4 MiB captured output, 8 MiB inspected regular files, 32 MiB snapshot contents / 2000 changed files; 32 steps/heads in lab/plan, commands use explicit argv and timeout 1–300 seconds. Function history follows selected line ranges; it does not invent universal language-specific function detection. Whole-file binary and deleted-file restores are supported; selective hunks require UTF-8 text, and symlink/special-file restoration is explicitly rejected. A restore into an absent parent directory requires recreating/reviewing that directory first. Housekeeping reports filesystem modification, which must not be labeled user usage. Pending-worktree overlap evidence is separate from committed-head merge simulations. Git plans support merge/cherry-pick/revert rehearsal and new-branch export; source branch/worktree contents are preserved. Native Windows/macOS runtime verification and real external test environments are not established by Linux fixture success.

## UI integration status (Opus 5.5) — final for this delegate

"UI wired" = reachable control calling the real service/backend; focused tests named; still needs root's independent UI review and live-account verification. Not "tested" end-to-end against GitHub. Locales: en+de translated for all new namespaces; **es/fr/pt/zh/ja carry English text** (parity + used-key checks pass; translation pending). 71/72/74/75 UI = second Opus delegate (mounted by me lazily in Tools / PR "Walkthrough" tab). 41–48 UI = third Opus delegate (mounted lazily in CI panel "GitHub CI tools").

| ID | Status | Where / evidence | Gaps / blockers |
|---|---|---|---|
| 1 | UI wired | PR Files tab reviewed checkbox, changed/new since review, resume file; canonical `getReviewTreeState`+`reviewComparisonFingerprint` (`github-ui/review-memory.ts`) | needs `meta.baseRefOid` (hidden when unknown); `pr_files.previous_path` now forwarded through the Files tab `PrFile` type into `reviewComparisonFingerprint` (rename-aware); marking requires rendered patch. See REMAINING-PR-UI.md |
| 2 | UI wired | PR detail "Merge readiness" (`readiness.ts`, 5 tests) | — |
| 3 | partial | Issue sheet "Work on this issue": branch+worktree via `worktreeAdd`, terminal/editor/agent on click, PR "Closes #n" offer | not yet switched to canonical `createIssueWorkspace` (hooks-disabled helper) |
| 4 | UI wired | Hub → PRs → "Saved searches" chips/edit/paginate (`search-chips` test) | — |
| 5 | UI wired | Reviewers picker: users+teams (`getPullMeta.reviewRequests`), canonical CODEOWNERS suggestions, stale-review re-request hint | email owners not offered (by design) |
| 6 | UI wired | readiness panel enqueue/dequeue (only when rule/entry exists) | live verification |
| 7 | UI wired | PR "Mine" tab tasks; local-only done store (`reviewTasks` test) | — |
| 8 | partial | PR detail "Review in separate worktree" (`pr-review-worktree.tsx`), pinned-SHA check, dirty-guarded cleanup | same-repo PRs only; should adopt canonical `createReviewWorkspace` (fork support) |
| 9–12, 22, 23 | UI wired | PR action row (`pr-github-manage.tsx`); issue sheet for issues | — |
| 13, 16 | UI wired | PR create: template buttons, account-scoped persisted draft | — |
| 14, 15 | UI wired | `mention-textarea.tsx` (#issues, @users+teams via `searchMentionables`) in edit/create/comment | token parser untested |
| 17 | UI wired | PR Files tab (GitHub): side-aware old/new anchors, Shift-click range (reversed normalized, one hunk), range highlight, draft label, remote thread range/outdated label via `listReviewThreads`; `github-ui/diff-ranges.ts`; tests `github-ui/pr-ranges.test.ts`, `e2e/pr-ranges.spec.ts` | non-GitHub stays single new-line (capability-honest); mixed-side remote start side not fetched (see REMAINING-PR-UI.md) ; e2e 4/4 passed |
| 18 | UI wired | PR Files tab "Apply suggestions…" → `SuggestionBatchDialog`: select, overlap/outdated/old-side/off-diff/stale rejections, per-file exact plan diff, explicit confirm, `applySuggestionPlan`, no thread resolve; `github-ui/suggestion-batch.ts`; tests as 17 | patches for expected lines use unpinned `pr_file_patch` until pinned mode lands; HEAD mismatch is refused at apply (backend CAS), not at preview |
| 19 | UI wired | template insert in inline composer + issue comments; manager in "Mine" | — |
| 20 | UI wired | PR Files "Permalink" with line range (`parseLineRange` test) | — |
| 21 | UI wired | app search: paste GitHub PR/issue URL → internal hub view; `?issue=` route | — |
| 24 | UI wired | "Closes" chips in PR header → issue sheet | — |
| 25 | UI wired | hub Issues → issue sheet: body/comments/edit/close reasons/reopen/labels/assignees/milestone | — |
| 26 | UI wired | issue create dialog: YAML forms via `forms.ts`, validation, labels/assignees | Markdown front-matter templates (canonical `issue-forms.ts`) not yet used |
| 27 | UI wired | issue sheet sub-issues + blocked-by/blocking | — |
| 28 | partial | issue sheet projects: text/number/date editable | single-select editing needs `listProjectFields` wiring |
| 29 | UI wired | commit/compare diff header "Create issue from lines" (body test) | — |
| 30, 34 | UI wired | private notes/pin/priority in "Mine", issue sheet note, inbox row actions | — |
| 31 | partial | issue sheet "Open worktree / terminal / editor / agent" for linked workspace | no pending review/test context restore |
| 32, 33, 35, 37, 39, 40 | UI wired | Hub inbox (`hub-inbox.tsx`, `inbox-model` tests): sections, snooze, grouping, digest, queue, batch read w/ partial failures | uses own grouping, not canonical `events.ts` |
| 36 | UI wired | Settings → Notifications quiet hours; `notify()` gate | — |
| 38 | UI wired | PR Checks reminder bar + root poller (`reminderSatisfied` test) | own store; not pinned to head SHA like canonical `checkReminderReady` |
| 41–48 | mounted | third delegate's `GithubCiExtensions` lazily in CI panel | delegate owns status |
| 49–51, 60–66, 69, 70, 73, 76, 77 | UI wired | Tools → Git workbench; 76 restore shows deletion/binary; 70 `includeWorktrees` not used | `args.test.ts` |
| 52–54 | UI wired | commit/compare viewers; staging panel overlay control (transformed view disables staging) | moved highlight inline only |
| 55, 56 | UI wired | compare dialog: class labels + persisted profiles + "n hidden – show" (`file-classes.test.ts`) | commit-inspect list not filtered |
| 57–59 | UI wired | diff viewer "View" select: rendered Markdown / JSON-YAML structure / npm lock deps | npm lock only |
| 67 | UI wired | Git workbench "Identity profiles": group assignment, effective/local preview, first-commit warning, guarded apply | — |
| 68 | UI wired | root-mounted `useBranchContextBridge` (`github-ui/branch-context.ts`): saves panel/user-picked file/files scroll/agent thread for outgoing branch, restores incoming (panel only for active repo; file+scroll consumed by commit panel/file list once that branch's rows exist; agent thread only if it still exists for same provider); tests `github-ui/branch-context.test.ts` | task pointer = active agent thread per repo path (no other per-branch task state exists); no browser test |
| 71, 72, 74, 75 | mounted | second delegate's panels (Tools, PR "Walkthrough") | delegate owns status |
| 78 | UI wired | commit inspect "Why does this commit exist?" PRs/issues/reviews with source links | — |

Regression handled: e2e `responsive-workspace` 150% (staging header wrap) fixed by moving display options into an overlay; that single test now passes. `agent-review-safety` 8/8 pass when run alone (failure under parallel load not reproduced).
## GitHub/backend verification evidence

Backend ownership: `src/lib/github-expansion/**`, additions in `src-tauri/src/hub.rs`, multiline review additions in `pr.rs`/`pr/github.rs` and existing `pr-review-drafts.ts`. UI remains exclusively Opus-owned. Existing dirty `app-shell.tsx` was not edited by this backend agent.

- Focused Vitest run on 2026-11-05: **62 tests passed in 11 files** (`src/lib/github-expansion/`, `src/lib/pr-review-drafts.test.ts`, `src/lib/github-ui/`). Includes exact PR metadata/team payloads, GraphQL mutation confirmation, project pagination, partial org permissions, blob-pair review fingerprints, CODEOWNERS precedence/provider validation/safe matching, structured/dependency diff, form validation, suggestions, CI evidence and scoped persistence helpers.
- Full TypeScript check completed successfully before final PR metadata/CODEOWNERS additions; final integrated root typecheck still required after Opus work settles.
- Validator reported **426 Rust library tests passed**, including download-route validation, dirty-main/index-preserving task worktrees, stale PR-head refusal/temporary-ref cleanup, batch suggestion all-file validation/index preservation and multiline comment payloads. Later identity-profile fixture must be included in root's final all-targets run.
- `hub_download`, `hub_task_worktree`, `hub_apply_suggestions`, `hub_identity_profile` are registered local-only; they cannot expose local account credentials through remote/mobile dispatch. No unregistered renderer shell execution was added.
- GitHub API behavior is covered by fixtures and primary API/schema documentation. **No live GitHub-account, GitHub Enterprise-version matrix, OS-keychain, native Windows/macOS or release acceptance has been performed by this agent.** Those remain explicit integration gates.
- Backend-only status is intentional: providers, stores and pure algorithms do not count as completed user-visible features until reachable UI and background/navigation workflows consume them. No release or completion claim follows from this subsection.
