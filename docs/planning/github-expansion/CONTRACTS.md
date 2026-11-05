# Shared implementation contracts

## Ownership

Backend agent: `src/lib/github-expansion/**`, Rust backend when needed, this ledger. Opus 5.5: UI/components, styles and locale strings. Existing `src/components/app/shell/app-shell.tsx` dirty diff is user-owned. Root integrates, reviews and releases.

## GitHub API service

The service entrypoint is `src/lib/github-expansion/api.ts`. It uses existing `hubApi` / `gql` from `src/lib/hub/api.ts`, so credentials remain in Rust/OS keychain. Every method receives `HubAccount` and `fullName` (`owner/repo`). GitHub-only functions reject other providers explicitly. Endpoint pagination returns a `Page<T>` with `items`, `page`, and `hasMore`; callers must offer pagination. No tokens or new transport in UI.

Initial API (being implemented): `getIssue`, `listComments`, `updateIssue`, `addComment`, `updatePullRequest`, `setPullDraft`, `listLabels`, `listAssignees`, `listMilestones`, `setLabels`, `requestReviewers`, `removeReviewers`, `listTemplates`, `readTemplate`, `searchIssues`, `listWorkflows`, `dispatchWorkflow`, `listArtifacts`, `listDeployments`, `listDeploymentStatuses`, `getMergeReadiness`, `setMergeQueue`, `listSubIssues`, `addSubIssue`, `removeSubIssue`. Exact exported types in service source are canonical.

Local stores: `src/lib/github-expansion/store.ts`: `useGithubWorkspace` with scoped drafts, notes, search presets, review snapshots, snooze/priority/queue and read-position records. Account scope includes provider/host/login/repository, and subject identity includes issue/PR number.

No new Tauri commands for JSON API operations: use registered `hub_api`. Raw logs/artifact downloads need backend transport; never send authenticated download URLs to browser fetch. Git operations must use validated backend commands, not renderer shell execution.

## UI requests (Opus 5.5 UI agent)

UI-owned adapter (I write it): `src/lib/github-ui/target.ts` (UI-owned dir `src/lib/github-ui/**`) → `useGithubTarget(path)` resolves a local repo path (via `list_git_remotes`) or a `hub:login@host/owner/repo` path to `{ account: HubAccount, fullName }` or `{ reason: "no-remote" | "no-account" | "not-github" }`. Backend: please do not duplicate; consume it if useful.

Requested service functions beyond the initial API (names are proposals; canonical source wins):

- PR detail extras for one PR (GraphQL, one round trip): `getPullMeta(a, fullName, number)` → `{ nodeId, title, body, state, isDraft, baseRefName, headRefName, headRefOid, baseRefOid, labels[], assignees[], milestone|null, reviewRequests[{login|team slug, kind}], latestReviews[{login,state,commitOid}], closingIssues[{number,title,state,url}], mergeStateStatus, mergeable, reviewDecision, isInMergeQueue, mergeQueueEntry|null, viewerCanUpdate }`. Needed by IDs 2, 5, 6, 9–12, 22–24.
- `closePull` / `reopenPull` (or `updatePullRequest` with `state`), `updatePullRequest(..., { base })` for 23.
- `listCodeowners(a, fullName, ref)` → parsed rules `{ pattern, owners[] }[]` plus `matchCodeowners(rules, files)` pure helper (5).
- `searchMentionables(a, fullName, q)` users + org teams (15); `searchIssues` reused for # completion (14).
- `listIssueForms(a, fullName)` → parsed YAML forms (26); `listProjectItems` / `updateProjectField` (28).
- `listRunJobs`, `getJobLog(path|account, jobId)` via backend raw transport (41), `downloadArtifact(...)` to a user-chosen path via backend (44).
- Store: `useGithubWorkspace` slices for drafts(16), notes(30), templates(19), searchPresets(4), reviewSnapshots(1), reviewTasks(7), snooze/priority/pin/queue(32–34,39), lastVisit(37), quietHours(36), reminders(38). UI reads/writes only via store actions.

Requested Git backend commands (validated, no shell from renderer): diff options `{ ignoreWhitespace, colorMoved, context }` on `repo_file_diff` / `repo_compare_file_diff` / `repo_commit_file_diff` (52–54); `repo_pickaxe(path, text, mode: "S"|"G", page)` (49); `repo_function_log(path, file, funcname|range)` (50); `repo_range_diff(path, oldBase, oldHead, newBase, newHead)` (51); `repo_blame` with `ignoreRevsFile` (60); `git_apply_patch_checked(path, patch, expectedPreimageHash)` (61); `rerere_status/forget/enable` (62); worktree details with size/last-use (64); `bisect_run(path, cmd)` (65); `sparse_checkout_*` (66); identity profile apply (67); integration-lab temp worktree merge + test run (69, 73); conflict merge-tree simulation (70); snapshot capture/restore (76).

## Advanced Git backend — validation_release agent

Canonical bridge: `src/lib/git-expansion/index.ts`. All operations use `gitExpansion(path, request)` → registered Tauri/remote command `git_expansion` with `{ path, request }`. Requests are discriminated by snake_case `op`; nested fields are camelCase. The exact request union and response map in the bridge are the UI contract; do not invent command names. Desktop and remote use existing platform IPC.

Implemented progressively: paged `pickaxe` (literal/regex) and `function_history` (explicit 1-based line range, inclusive end); pinned `range_diff`; `blame_ignore` honoring validated `.git-blame-ignore-revs`; persisted `restore_preview` / guarded `restore_apply` with optional selected source/target line ranges; `rerere_status/configure/forget`; `profiles_list/save` and explicitly confirmed `profile_apply`; bounded `housekeeping`; isolated `bisect_test`; `sparse_status/set/disable`; isolated `integration`; evidence-only file `overlap`; confirmed isolated `behavior_compare`; `snapshot_capture/list/restore_index/rescue_branch`; persisted isolated `plan_preview` and export to a new branch (`plan_export`). Existing worktree-create, safe removal and bisect start/mark/reset commands remain canonical for those operations.

Execution contract: `CommandSpec` is program + argv, never a shell string. Timeout 1–300 seconds; captured outputs bounded. Profile execution, tests and sparse mutations require explicit `confirmed: true`. Read-only previews do not execute repository setup/test commands. Worktree profiles require the persisted profile fingerprint and a registered target worktree in the same Git common directory. File restores require preview ID/fingerprint; stale file/index/HEAD rejects. Snapshots preserve raw changed/untracked regular files, index tree, HEAD and branch metadata with bounded storage; unsupported symlinks/binary text restore failures are explicit. Integration/behavior use detached temporary worktrees and return exact head IDs; they never update the source worktree. File overlap is evidence, not a semantic conflict claim. Plans support bounded merge/cherry-pick/revert steps, rehearse them isolated, and export a successful pinned result to a newly created branch without overwriting an existing ref.

## Available GitHub expansion contracts (current)

`api.ts` now exports the initial methods plus:
- `downloadGithubFile(account, repo, kind, id)` invokes local-only `hub_download`; kinds `job_logs`, `run_logs`, `artifact`. Result `{base64, content_type, file_name, size}`. In-app limit is 64 MiB; job logs are plain text, run logs/artifacts are ZIP bytes. Decode base64 and explicitly save or display. Credentials never reach signed storage or the renderer.
- `getBranchRules(account, repo, branch)` returns effective rule objects; errors are unknown, never no rules.
- `listIssueDependencies(account, repo, number, direction, page)`, `addIssueDependency`, `removeIssueDependency`; direction `blocked_by` or `blocking`.
- `listReviewThreads` returns paginated threads with comments plus explicit nested-comment pagination metadata.
- `submitRangeReview` submits comments with `line/side/start_line/start_side` pinned to full head SHA.
- `listLinkedIssues` returns paginated closing issue references.
- `listSubjectProjects` returns paginated Project V2 items and fields; `updateProjectField` updates or clears text/number/date/single-select fields. Unsupported/missing scope is an error.
- `listCommitPulls` returns PR evidence associated with a full SHA for decision history.
- `markNotificationsRead` deduplicates IDs and returns per-subject successes/failures.

`forms.ts`: `parseIssueForm`, `validateIssueAnswers`, `renderIssueAnswers`; supports markdown/input/textarea/dropdown/checkboxes, required fields/options and code rendering. Rejects unknown field types. `parseWorkflowInputs`, `validateWorkflowInputs`; types string/boolean/number/choice/environment. YAML input is bounded to 256 KB and alias expansion is limited. Repository text can be read via `readTemplate` (works for any validated text file).

Store exports and canonical shape are in `store.ts`: `accountScope`, `subjectKey`, `useGithubWorkspace`, `reviewProgress`, `isSnoozed`, `isQuietHour`. Review fingerprints must represent the complete pinned comparison, not a truncated patch; UI must never mark an unavailable/truncated diff as reviewed.

## Task/review worktrees

`src/lib/github-expansion/workspace.ts`: `createIssueWorkspace(account, repo, issue, selection, selectedComments?)`, `createReviewWorkspace(account, repo, number, selection, allowExternalCode)`. Selection `{repoPath, worktreePath, branch, expectedHeadSha}` uses a full 40/64-char SHA and a new absolute destination. Returns `{path, branch, head, source_pr, cleanup_warning}`. Calls local-only `hub_task_worktree`; review fetches `refs/pull/N/head` into a temporary app ref and refuses if its SHA changed; main HEAD/index/worktree remain untouched. Review opt-in explicitly covers fork code. Hooks/filters/fsmonitor are disabled through shared safe Git helper; project setup/test commands never start automatically. A successful worktree is linked under `useGithubWorkspace.subjects[subjectKey].workspace`, including selected issue context ready to inspect/edit before sending to an agent. `issueContext` builds that text. Existing app agent launch UI should consume this context; service does not start agents automatically.

## CI and structured diffs

`ci.ts`: `listWorkflowRuns`, `listRunJobs` (supports exact attempt), `compareCiRuns`, `inconsistentJobOutcomes`, `ciAgentContext`. Inconsistent outcomes are evidence for the same workflow/SHA/job, not a claim that a particular test is flaky. Metadata-only comparison must not imply root cause.

`analysis.ts`: `structuredDiff(before, after, json|yaml)` returns JSON-pointer-path add/remove/change records; malformed or oversize content fails explicitly. `npmDependencyDiff` supports package-lock v2/v3 and reports direct/nested/optional/dev changes; other lock formats are explicitly unsupported.

Advanced Git contract refinements: history `page` is **one-based** (legacy zero aliases page one). `createdAt` / `lastModified` timestamps are Unix **milliseconds**; lastModified means filesystem modification, not user usage. `snapshots_list` also returns `current: { head, indexTree } | null` for guarded index restoration. `RestorePreview` includes `deleteFile` and `binary`; UI must explicitly show deletion before applying. Full-file binary restore preserves bytes; selected line ranges only support UTF-8 text. `overlap` optionally accepts `includeWorktrees: true` and returns separate `worktrees`, `worktreeOverlaps` and `worktreeErrors`, including uncommitted tracked/untracked changes even when two worktrees share a HEAD. These overlaps are pending-file evidence only; existing committed-head test merges do not simulate uncommitted edits.

## Multiline reviews and batch suggestions

Existing `pr-review-drafts.ts` now accepts `side`, `startLine`, `startSide` in draft input and emits snake-case backend fields through `toReviewPayload`; existing `pr_submit_review` and GitHub payload preserve them. Non-GitHub multiline submission errors explicitly. Independent service `submitRangeReview` additionally pins submission to a reviewed SHA.

`src/lib/github-expansion/suggestions.ts`: `previewSuggestions(path, reviewedHead, selectedSuggestions)` -> immutable-by-convention `SuggestionPlan` containing exact before/after file contents. Selection `{id,file,startLine,endLine,expectedLines,replacementLines}` requires matching original lines; rejects overlapping/invalid/stale ranges. `applySuggestionPlan(plan)` -> local-only `hub_apply_suggestions(path, expectedHead, edits)` validates full HEAD and every regular file against expected contents before one batch patch application; index stays untouched. Plans must be displayed before application and discarded/recomputed if selection or repository changes. No provider threads are resolved implicitly.

### UI requests round 2 (Opus 5.5, needed now)

- `MergeReadiness`: please add `baseRefOid` (and `headRefName`) and `closingIssuesReferences(first: 20) { nodes { number title state url repository { nameWithOwner } } }` → unblocks 24 and the no-patch fallback of review memory (1) pinning the base commit.
- ID 7 local done marks: no longer needed from backend; UI-owned `src/lib/github-ui/review-task-store.ts` (local only, never resolves remotely).
- `getPull(a, repo, number)` returning REST pull incl. `requested_teams`, `base.sha`, `head.sha` for 5 (team display/removal) — or add `reviewRequests` to readiness.
- Review fingerprint (ID 1) used by UI: SHA-256 over `path, previous_path, status, provider base→head patch` (patch = comparison incl. base); no patch → pinned base+head commit IDs. Implemented in `src/lib/github-ui/review-memory.ts` with tests.

## Identity profiles, inbox events and branch resume

`identity.ts`: persisted `useIdentityProfiles` stores sanitized author/signing/account-reference metadata and group assignments; `readIdentity(path)` -> `{info:{effective,local,fingerprint},completed_keys,error}`; `applyIdentity(path,profile,expectedFingerprint)` applies five local Git keys after a stale-state check. Writes can partially succeed: UI must show `error` and `completed_keys` and refresh the returned effective state. Signing account references are metadata and do not silently change host-wide credentials. `identityDifferences` supports a first-commit preview. Command `hub_identity_profile` is local-only.

`events.ts`: `groupSubjectEvents`, `eventsSinceVisit`, `checkReminderReady` use shared account-scoped subject keys; duplicate delivery IDs coalesce while distinct source events remain. First visit produces no invented missed-events summary. Check reminders are pinned to full head SHA and exact check name; duplicate-name checks must all complete. Store actions `saveReminder`, `claimReminder` (returns false after first claim) and `saveBranchContext`, plus `branchContextKey`, support notification/navigation integration. Existing background polling/notification code must consume these explicitly; services alone do not complete inbox UX.

## Complete review comparison fingerprints

`getReviewTreeState(account,repo,baseSha,headSha)` resolves pinned merge base then retrieves complete base/head tree blob metadata. `reviewComparisonFingerprint(state,path,previousPath?)` includes both blob IDs, modes and rename paths while remaining stable across unrelated rebases. It returns null for truncated trees or absent paths; UI must refuse marking those unavailable comparisons reviewed. This does not prove a truncated rendered patch has been fully read: render completeness is a separate prerequisite for marking reviewed.

Issue creation also exports `createIssue` with labels/assignees/milestone metadata. `issue-forms.ts`: `listIssueTemplates`, `loadIssueTemplate` (Markdown front matter or YAML form), `submitIssueForm` renders validated answers and preserves template labels/assignees. Only a 404 yields an empty optional template list; permission/rate-limit failures remain errors. `listOrganizationTeams` and `searchMentionUsers` support mention/reviewer pickers. `listProjectFields` returns paginated editable field definitions including single-select option IDs needed by `updateProjectField`.

## Architecture-source and actual-agent evidence backend

`gitExpansion(path, {op:"source_files",files:string[],expectedHead:string})` reads **current working-copy bytes**, not historical clean blobs. The worktree HEAD is pinned before/after. At most 500 paths, 1 MiB per regular UTF-8 text file, 8 MiB total returned source. Response: `{head,files:[{path,text,fingerprint}],omitted:[{path,error}],truncated}`. Fingerprints are SHA-256 of the actual returned bytes. Unsafe paths/symlinks, missing/special/binary/invalid-UTF8/oversize/over-budget files are explicit omissions; `truncated` marks size/budget omissions. A stale expected HEAD rejects the entire read.

`gitExpansion(agentWorktreePath, {op:"evidence_run",basePath,expectedBaseHead,expectedHead,expectedFingerprint,command:CommandSpec,confirmed:true})` executes one explicitly confirmed argv **inside the selected existing registered agent worktree**, preserving its dirty contents for the test. It does not create a clean copy. Expected heads and canonical agent-review content fingerprint must match before launch. Response: `{run,before:{baseSha,headSha,worktreeFingerprint},after: same|null,stale,afterError:string|null,files:string[]}`. Coordination and both mutation locks follow existing review ordering. Fingerprint uses the existing `review_content_fingerprint` helper and the same changed/untracked selection as `agent_review_summary`. If the test changes content, HEAD, or branch context, `stale:true`; post-capture failures preserve the actual run and return `after:null` with `afterError`. Tests never auto-commit, stage, reset or clean the selected worktree. Caller should retain `before` as the proof's snapshot, respect backend `stale`, and refresh current evidence separately.

## Artifact export and dispatch identity (root additions)

Local-only `save_user_export_bytes(path: string, base64: string)` saves actual downloaded binary bytes to a user-selected **absolute** file path with an atomic temporary-file/rename operation and 64 MiB decoded cap. Base64 length is bounded before allocation. Existing `save_user_export` remains JSON-only; do not use it for text logs. New command is registered and declared local-only, like other desktop export functions. UI must select the path through the normal save dialog and pass existing `GithubDownload.base64`; it never sends URLs or credentials.

`dispatchWorkflow` now returns `WorkflowDispatchResult | null` (`workflow_run_id?`, `run_url?`, `html_url?`). Existing transport pins API 2022-11-28; on github.com the service sends `return_run_details: true` per [GitHub's API announcement](https://github.blog/changelog/2026-02-19-workflow-dispatch-api-now-returns-run-ids/). Older Enterprise hosts retain their no-content behavior; callers must not assume a run ID or guess ambiguous runs. There is no automatic retry of dispatch after a network/response error, because the server may already have accepted it.

## PR metadata / mentions / CODEOWNERS integration additions

`getPullMeta(account,repo,number,cursors?)` now implements the UI-requested normalized shape above, with per-connection `pagination` and independent optional cursors named labels/assignees/reviewRequests/latestReviews/closingIssues. `getPull` returns raw REST PR metadata including `requested_teams`, `base.sha`, `head.sha`. `MergeReadiness` now queries `baseRefOid`, `headRefName`, closingIssuesReferences plus pageInfo; the new TS fields are optional only for compatibility with older fixture constructors.

`searchMentionables(account,repo,q,{users?,teams?}?)` -> `{items:[{kind:user|team,login,label,insert}],hasMore,usersCursor,teamsCursor,teamsUnavailable}`. Repository users use the mentionableUsers endpoint, not only assignable users. Organization teams are searched separately so missing org permissions do not hide available users. Team login is `org/slug`, insertion `@org/slug`. Pagination consumers should deduplicate items by kind/login when one connection is exhausted.

`src/lib/github-expansion/codeowners.ts`: `listCodeowners(account,repo,baseRef)` reads the first accessible file in GitHub precedence order and returns `{path,ref,rules,errors,validationError}`. Native GitHub validation errors are loaded from codeowners/errors at the SAME base ref and invalid lines excluded. Missing provider validation remains explicit; this is not an assertion that those owners are valid. `parseCodeowners` supports ownerless exceptions, escaped whitespace, directory/root patterns, globstars, email/team owners and GitHub-specific unsupported syntax diagnostics. `matchCodeowners` returns Map<owner,files> with last-match precedence and case-sensitive matching. Email owners are informational unless resolved to a GitHub user; never send email strings as reviewer logins. Repository text >1MiB is loaded through the Git blob API (3MiB maximum) rather than silently omitted by contents API limits.

Validation for these additions: focused serial `cargo test --locked --manifest-path src-tauri/Cargo.toml --features headless --lib git_expansion::tests --quiet -j 1` passed 25/25 tests. New tests verify dirty working-copy source bytes and SHA fingerprints; 500-path/1-MiB-per-file/8-MiB-total limits; unsafe/symlink/binary/missing omissions without filters; exact compatibility with public agent-review summary fingerprints; real dirty/untracked agent-worktree execution; refusal of stale/unconfirmed execution before writes; and stale marking after an executed command changes the index. Root retains final whole-source testing, UI integration and independent review gates.

## Approved review fixes — conditional mutation and pinned patch contract

The user explicitly approved the nine reported review fixes. Backend changes preserve existing optional-call compatibility:

- `pr_merge(path, number, strategy, message?, delete_source_branch?, expected_head_sha?)`: renderer/remote camelCase argument is `expectedHeadSha`. A supplied SHA must contain exactly 40 or 64 hexadecimal characters. GitHub and GitLab native merge PUT bodies carry provider-enforced `sha`; a provider-side head change therefore rejects the mutation before merging. Gitea/Bitbucket/unknown providers reject pinned merges rather than replacing this condition with a racy GET. Omitting the SHA retains existing unpinned behavior.
- `pr_file_patch(path, number, file, expected_head_sha?, expected_base_sha?)`: camelCase args `expectedHeadSha` and `expectedBaseSha`. Supply both or neither. Pinned mode currently supports GitHub/Gitea, loading their actual REST `head.sha` / `base.sha` before AND after reading the patch, and returning an error if either differs or is unavailable. `expectedBaseSha` is GraphQL `baseRefOid` / REST `base.sha` (target tip), not the comparison merge-base commit. Success with supplied pins proves those revision checks; the returned `Option<string>` shape remains unchanged. Other providers fail closed when pins are requested. Legacy unpinned reads are unchanged. Existing remote/mobile dispatch mirrors both optional arguments. UI must still invalidate generations/caches on revision changes and never relabel a stale unpinned result as pinned.

`npmDependencyDiff` now compares package presence, version, directness, development and optional flags per side. Each result retains `beforeClassification` / `afterClassification` (`{direct,dev,optional}` or null if absent); old `direct/dev/optional` fields remain, taking after classification when present or before for removals. This includes same-version classification changes and versionless additions/removals.

`searchMentionables` cursor semantics are now independent: omitted property = initial page; string = next page; explicit null = exhausted connection and it is NOT requested again. Initial `{}` still loads both. An owner-only lookup is used when users are exhausted but organization teams continue. Sending both explicit nulls returns an empty completed page without network calls. `teamsUnavailable` reports a failure on the current page; pagination consumers can retain earlier warning state while appending subsequent user pages.

Approved-fix verification: focused backend `api.test.ts` + `analysis.test.ts` passed **25/25**; a temporary backend-only TypeScript configuration covering these four source/test files passed. Native `cargo test --locked --features headless --lib pr::guards::tests -j1` passed **5/5**: actual HTTP SHA-conditioned GitHub/GitLab merge requests reject A-read/B-current before the fixture mutates, unchanged and legacy merges remain supported, invalid/unsupported pins fail closed, patch loading rejects actual HTTP head/base drift and preflight drift prevents patch requests. Final integrated TypeScript/native gates and the independent aggregate review remain root-owned; no live-provider mutation was performed for these tests.

## UI requests round 3 (Opus 5.5, IDs 17/18/68; details in REMAINING-PR-UI.md)

- `listReviewThreads`: please add `startDiffSide` so mixed-side remote ranges and batch suggestions starting on the old side are exact.
- Pinned `pr_file_patch(expectedHeadSha, expectedBaseSha)`: the batch-suggestion dialog will pass both once available (Files tab `loadPatch`).
