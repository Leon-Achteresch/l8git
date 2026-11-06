# Remaining PR UI: IDs 1 (rename), 17, 18, 68

Owner: Opus 5.5 UI packet (this file). No backend changes made; requests at the end go to root.

## Ownership

| File | Change |
|---|---|
| `src/lib/github-ui/diff-ranges.ts` (new) | pure anchors/ranges: `anchorAt`, `buildRange`, `rangeFields`, `rangeKeys`, `storedRangeKeys`, `headLinesFromPatch` |
| `src/lib/github-ui/review-threads.ts` (new) | `useReviewThreadIndex(path, number)`: all `listReviewThreads` pages (max 20) keyed by thread node id, account/PR keyed so results never leak |
| `src/lib/github-ui/suggestion-batch.ts` (new) | `collectCandidates`, `findOverlaps`, `staleSuggestions`, `planUnifiedDiff`, `toSelected` |
| `src/lib/github-ui/branch-context.ts` (new) | `useBranchContextBridge`, `handleBranchSwitch`, `rememberBranchFile`, `useBranchRestore`, `branchSwitches` |
| `src/components/repo/github/suggestion-batch-dialog.tsx` (new) | ID 18 dialog |
| `src/components/repo/pr/pull-request-files-tab.tsx` | `PrFile.previous_path`; range composer; thread range metadata; batch button |
| `src/components/repo/pr/pull-request-inline-comments.tsx` | `ThreadRange` prop, range labels, range-aware local apply, `onBodyChange` |
| `src/components/repo/commit/unified-diff-body.tsx` | optional `commentRange` prop only (old callers unchanged) |
| `src/lib/github-ui/review-submit.ts` (new), `pull-request-review-drafts-bar.tsx`, `pull-request-inspect-detail.tsx` (+1 prop), `src/lib/pr-review-drafts.ts` (+optional `commitId`) | pinned range submission |
| `src/lib/pr-suggestions.ts` | `applySuggestionToContent(..., startLine = line)` (backward compatible) |
| `src/components/repo/commit/commit-panel.tsx`, `commit-panel-file-list.tsx` | ID 68 consumers (restore file/scroll; record user-picked file) |
| `src/routes/__root.tsx` | one line: `useBranchContextBridge()` next to the reminder poller |
| `ui-test/pr-ranges-scene.tsx` (new), `ui-test/audit-scenes.tsx` (+2 lines), `e2e/pr-ranges.spec.ts` (new) | browser scene/spec |
| locales (all 7) | new namespaces `prRanges`, `suggestionBatch`; en+de real, others English (parity check passes). `branchContext` needs no strings. |

## Integration contract / status per ID

**1 (rename fingerprint): done.** Files tab `PrFile` forwards `previous_path` from `pr_files`, which `usePrReviewMemory` already passes to `reviewComparisonFingerprint`.

**17 (multiline comments): UI wired.**
- GitHub only (`caps.provider === "github"`). Every real patch line gets a `+`: deleted lines anchor `LEFT`/old number, context and added lines `RIGHT`/new number. Hunk headers and meta lines have no anchor, so no line numbers are invented.
- Click starts a composer. Shift-click extends from the first click; a reversed selection is normalized to patch order. Both ends must sit in one hunk with `start_line < line`, otherwise the UI refuses with a toast. That also covers mixed ranges such as old 2 → new 2. The covered rows are highlighted and the composer text survives extension.
- Drafts store `line/side/startLine/startSide`; `toReviewPayload` already emits snake-case fields to `pr_submit_review`. Pending drafts show "Lines +2 to +4" / "Old line 2". Remote threads show their GitHub range or "Outdated" through the node-id match `pr_review_threads` → `listReviewThreads`.
- **Pinned submission:** GitHub range-composer drafts record `commitId` (the full head SHA they were anchored at). `PullRequestReviewDraftsBar` uses `planReviewSubmission` (`github-ui/review-submit.ts`). Pinned drafts go through canonical `submitRangeReview(..., commitId, ...)` (`commit_id`), never the unpinned `pr_submit_review`.
  - When the PR head moved since drafting, the drafts are still submitted against their own commit, and a notice says so. If GitHub rejects that commit (force-pushed away), the error is shown and the drafts are kept.
  - Drafts from different heads, or pinned drafts mixed with legacy unpinned ones, are refused. Legacy unpinned drafts and non-GitHub providers keep the previous flow.
- Local single apply now replaces the whole same-side RIGHT range. It is disabled for old-side and outdated threads, which used to be misapplied at `original_line`.
- Other providers keep exactly the previous new-line-only anchors, because their backends ignore `side` and refuse ranges.

**18 (batch suggestions): UI wired.** "Apply suggestions…" in the Files tab (GitHub + pinned head):
1. Candidates are every suggestion block in loaded review-thread comments. Expected lines come from real new-side lines of the provider patch.
2. Rejected and disabled: outdated (never `original_line`), LEFT side, lines outside the diff, patch unavailable.
3. Nothing is preselected. Overlaps inside a file are flagged on both candidates and block preview. Two blocks in one comment count as an overlap.
4. Preview reads each local file once and checks each suggestion separately with the canonical applier (stale ones are listed and left out). It then calls `previewSuggestions(path, headSha, ok)` and renders a zero-context diff per file from `plan.edits[].expected_content`.
5. Apply requires a confirmation checkbox and then calls `applySuggestionPlan`, where backend CAS checks full HEAD and contents. Any failure discards the plan. Preview is refused when another branch is checked out (`branch !== headRef`) or there is no full head SHA. Threads are never resolved.

**68 (branch context): UI wired.**
- `useBranchContextBridge` (root) subscribes to `useRepoStore` branch values per repo path. A switch is an in-place change from one non-empty branch to another. New, removed or loading repositories are not switches.
- Outgoing save: panel (`sidebarTab` when the repo is active), files-list scroll (`repo-view-state`), and the active agent thread as provider-scoped `taskKey`. The file is recorded only when the user clicks a row (`rememberBranchFile`), so the panel's automatic fallback after a status reload never overwrites it.
- Incoming restore: panel only for the active repository. A `useBranchRestore` request `{id,path,branch,file,scrollTop}` is consumed by the commit panel/file list only when path **and current branch** match and that branch's rows exist, so late status from the other branch is ignored.
- The agent thread is reopened only if it still exists for the same provider and no newer switch happened (sequence guard). Commit message drafts are untouched.

## Tests

- `src/lib/github-ui/pr-ranges.test.ts`: pinned submission (same head, moved head keeps commit, mixed heads refused, legacy/non-GitHub unchanged, store keeps commitId); LEFT/RIGHT anchors, reversed selection, mixed and invalid ranges, cross-hunk refusal, payload, range apply. Batch: rejections, overlap including same-comment blocks, per-file stale, exact two-file plan diff.
- `src/lib/github-ui/branch-context.test.ts`: switch detection, round trip of panel/file/scroll/task, no cross-repo leak, inactive repo panel untouched, stale/provider/deleted task guards.
- Run: `bunx vitest run src/lib/github-ui/ src/lib/pr-suggestions.test.ts src/lib/pr-review-drafts.test.ts src/lib/github-expansion/suggestions.test.ts src/lib/github-expansion/store.test.ts src/lib/repo-view-state.test.ts` → all passed (latest: `src/lib/github-ui/` + suggestion/draft tests, 7 files, 69 tests; branch-context and store tests in the earlier 9-file run). `node scripts/check-locales.mjs` passes.
- `e2e/pr-ranges.spec.ts` (4 tests: range LEFT/RIGHT/reversed/invalid, batch overlap + two-file apply payload + no resolve, stale rejection, wrong branch). **Passed 4/4** (`L8GIT_UI_TEST_PORT=<free> bunx playwright test e2e/pr-ranges.spec.ts --workers=1`). The first run exposed outdated candidates labelled `:0-0`; they now show "(Outdated)".

## Final contract integration (done)

- `startDiffSide`: batch rejects ranges that start on the old side or have an unknown start side (`oldSide`). Remote thread labels use the real start side.
- Batch expected lines come only from pinned `pr_file_patch(expectedHeadSha=headSha, expectedBaseSha=baseSha)`. The batch button needs both pins and never reuses the cached unpinned patch.
- A notice appears when any thread has `comments.pageInfo.hasNextPage` (`hasPartialComments`).
- Before preview, local `git_resolve_commit(HEAD)` must equal the PR head; otherwise it is refused with both SHAs. Backend apply CAS stays authoritative.

## Remaining gaps

1. Comments past the first 100 in a thread are not scanned; the user now sees a notice.
2. ID 68 has no browser test.
3. `e2e/pr-ranges.spec.ts` scene/spec were updated for pins and HEAD and have not been re-run since that change.

## Root final review update

The independent range/batch/branch review confirmed P2 findings 10–12 in `FINAL-UI-REVIEW.md`: selection/preview races, inline patch/composer revision mismatch, and premature branch-scroll restore. The user explicitly deferred these; they remain open. Later integrated browser runs reproduce a separate assertion failure in the two-file batch test: its exact one-read-per-file count does not allow the existing-thread read followed by the explicit thread refresh. Do not confuse that assertion with coverage of the deferred races. Earlier 4/4 results predate the final pinned-patch assertion and are historical.
