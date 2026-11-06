# New P1 fixes (FINAL-UI-REVIEW.md findings 1–3)

Scope: only findings 1–3. The user chose "Nur die drei neuen P1 beheben". Findings 4–12 (P2) were left as they are. The earlier batch of nine fixes was kept. Backend Rust and `src/components/app/shell/app-shell.tsx` were not touched. Nothing was committed. Status: **fixed, including the P1 #3 completion; waiting for the independent `/code-review high` that root runs.**

## Independent corrective review (root follow-up)

The independent `/code-review high` found that P1 #3 is **not fully resolved yet**. This is incomplete coverage of the already approved remote-target finding, not a new independent issue: `PullRequestInspectDetail` still tags and reloads detail only by `path#number`. After origin A→B, readiness and mutation target become B while A's title/body/draft status remain displayed. The editor can overwrite B with A's text and the draft action can use A's status with B's node. The remote test currently returns identical details for both repositories and misses this sequence.

The existing P1 #3 approval covers this completion. No new independent confirmed issue was reported; the nine P2 remain untouched.

**Completion (corrective delta, waiting for root's independent review):**
- `src/components/repo/pr/pull-request-inspect-detail.tsx` now calls the existing `useGithubTarget(path)` (the same shared remote snapshot `usePrGithub` resolves in that render) and tags `pr_detail` with `path#number@login@host/owner/repo`. Non-GitHub misses (`not-github`, `no-account`, `no-remote`) keep a stable key, so GitLab/Bitbucket/hub detail loads as before.
- While remotes are re-read (`loading`, e.g. right after a remote edit) the key is `null`: no detail, no `PrGithubManage`/`PrMergeReadiness`, a loading spinner instead of "No data", and Refresh is disabled.
- A key mismatch renders `detail = null` in the same render, before effects. `PrGithubManage` (and with it the open title/body `EditDialog`) unmounts, so it cannot show A's text and then write to B. The draft action reads `detail.is_draft` and `gh.readiness.id` from the same scope.
- A generation counter plus a live-key ref guard the data, error toast and `finally`. Only the newest read writes; this also covers A→B→A, where a late first-A read has the same key. `loading` is tagged by key (`loadingKey`), so a dropped `finally` cannot leave B loading.
- No dependency cycle: the key comes from the target hook, and `usePrGithub(path, number, detail?.updated_at)` still uses the scope-filtered detail.
- Open editors checked: the edit/retarget dialogs and pickers live inside `PrGithubManage` and unmount on any scope change. Text loss on unmount and CODEOWNERS are P2 and were not changed.

## Changes

1. **Mention render loop**: `src/components/repo/github/mention-textarea.tsx`
   - The effect now depends on scalar scope (`account`, `fullName`) instead of the target object, which was re-created on every render.
   - With no token, the empty reset keeps the existing array (`h.length ? [] : h`).
   - The existing `live` flag still drops late responses.
   - `useGithubTarget` now also returns a memoized target, so other consumers get a stable identity too.
2. **Late PR response**: `src/lib/github-ui/use-pr-github.ts`
   - All loaded values (readiness/issue/meta/rules/error/loading) live in one state object tagged with `login@host/owner/repo#number`.
   - When the tag does not match the live scope, the hook renders empty values. This also covers the render that runs before effects.
   - A generation counter plus a live-scope ref drop late data, errors and `finally` writes.
   - A `reload` captured by an older render (for example after a slow queue or draft mutation) is a no-op. It cannot cancel or overwrite the live PR.
   - Caller `src/components/repo/pr/pull-request-inspect-detail.tsx`: `pr_detail` is tagged with `path#number` and guarded the same way. Without this, a late A detail could flip the direction of the draft toggle (`!detail.is_draft`) while B's node ID was in use.
   - The mutation controls (`PrGithubManage` draft, `PrMergeReadiness` queue) read `gh.target` and `gh.readiness` from the same live scope. They were not changed.
3. **Remote target cache**: `src/lib/github-ui/target.ts`
   - The permanent `remoteCache` promise map was replaced by a shared per-path store (`useSyncExternalStore`) with a generation counter for each path.
   - A read only lands if no newer read or invalidation has started since it began.
   - `invalidateGithubTarget(path)` drops the target immediately (`loading`) and re-reads.
   - Every `repo-store` reload of a path in use triggers a background re-read. The shown target stays until the new result arrives, and an unchanged result keeps the target identity.
   - Every first mount re-reads too, which keeps unopened test-scene paths working without a permanent stale cache.
   - Invalidation is called after `add_git_remote` and `set_git_remote_url` in `src/components/repo/remote/edit-remote-dialog.tsx`, and after `add_git_remote` in `src/components/repo/remote/create-remote-repo-dialog.tsx`.
   - The UI has no remove-remote action (no `remove_git_remote` call in `src/`). External changes are picked up on the next reload.

## Tests

The tests are new and mount the real components and hooks: `e2e/github-p1-fixes.spec.ts` over the new scene `ui-test/github-p1-scene.tsx` (routed `ghp1-*` in `ui-test/audit-scenes.tsx`).
- P1-1: mount without a token (React Profiler commit count stays stable, no requests, no "Maximum update depth"); `#` token (one search; the older held response arriving late is dropped); `@` token (exactly one mentionables query).
- P1-2: PR A→B with late A detail and readiness (B is shown, and the draft mutation uses B's node with B's draft direction); late A error and A `finally` do not touch B's error or loading; account switch and repository switch drop the late previous read, and mutations use the new node.
- P1-3 (completion): `pr_detail` in the scene is now routed by the path's origin at call time. A and B have distinct titles and bodies, and `o/b` has the opposite draft state. Test 9 covers origin A→B→A with held A readiness (from mount) and a held, late-failing A detail re-read. While re-reading: no A title, no Edit/draft actions, a loading state, Refresh disabled. After B lands and the late A detail/readiness/error release, B stays: title, no `CLEAN_leon_o/a_1`, no "detail boom" toast, Refresh enabled. The editor opens with B's title/body and PATCHes `/repos/o/b/pulls/1`. The draft action sends `markPullRequestReadyForReview` with `PR_leon_o/b_1`. Back on A: A's title and `convertPullRequestToDraft` with `PR_leon_o/a_1`. Test 8 now expects B's opposite direction ("Ready for review").
- P1-3: origin A→B with a held stale A read in flight. The target is `loading` immediately with no draft action. After B arrives, the late stale A does not restore A. The mutation uses B's node, and reads go to `/repos/o/b`. Then B→A works again.

Results after the completion (serial, `--workers=1`, port 4391):
- `bunx playwright test e2e/github-p1-fixes.spec.ts`: **9 passed** (8 existing + 1 new).
- Corrective delta: only `pull-request-inspect-detail.tsx` was swapped for the `/tmp/l8git-p1-remote-before` version and then restored (checked with `cmp`). Result: **tests 8 and 9 failed, 1–7 passed**. Test 9 fails at `github-p1-fixes.spec.ts:202` (A's title still shown after origin → B); test 8 times out looking for B's "Ready for review" because A's non-draft detail is still shown.
- `bunx vitest run src/lib/github-ui`: **4 files, 49 tests passed**.
- The same 5-spec set as below: **33 passed, 1 failed**. The failure is the known `pr-ranges.spec.ts:45` (`pr_file_patch` read twice), same assertion, left unchanged.
- Snapshot of the files as they were before this completion: `/tmp/l8git-p1-remote-before` (inspect detail, use-pr-github, target, mention-textarea, scene, spec). `/tmp/l8git-p1-before` is untouched.

Earlier results (before the completion, serial, `--workers=1`, port 4391):
- `bunx playwright test e2e/github-p1-fixes.spec.ts`: **8 passed**.
- Corrective delta: the 6 changed source files were swapped temporarily for the `/tmp/l8git-p1-before` versions and then restored (checked with `cmp`). Result: **8 failed**.
- `bunx vitest run src/lib/github-ui`: **4 files, 49 tests passed**.
- `bunx playwright test e2e/github-p1-fixes.spec.ts e2e/github-review-fixes.spec.ts e2e/remote-dialog.spec.ts e2e/github-task-flows.spec.ts e2e/pr-ranges.spec.ts`: **32 passed, 1 failed**.
  - The failure is `pr-ranges.spec.ts:45` (batch suggestions: `pr_file_patch` is read twice per file).
  - It fails the same way against the pre-fix snapshot (2/2 with `--repeat-each=2`), so it existed before this change. It is plausibly linked to the open P2 finding 10. Not fixed.

Not run: `tsc`, the full vitest/playwright suites, build, native, release (root owns these).

## Changed paths
- `src/components/repo/github/mention-textarea.tsx`
- `src/lib/github-ui/use-pr-github.ts`
- `src/lib/github-ui/target.ts`
- `src/components/repo/pr/pull-request-inspect-detail.tsx` (changed again in the completion)
- `src/components/repo/remote/edit-remote-dialog.tsx`
- `src/components/repo/remote/create-remote-repo-dialog.tsx`
- `ui-test/github-p1-scene.tsx` (new; in the completion: origin-routed `pr_detail`, `origin=` hold key, `failDetail`)
- `ui-test/audit-scenes.tsx` (routing for `ghp1-*`)
- `e2e/github-p1-fixes.spec.ts` (new; in the completion: test 8 draft direction, new test 9)
- `docs/planning/github-expansion/FINAL-UI-REVIEW.md` (status of findings 1–3 only)
- `docs/planning/github-expansion/NEW-P1-FIXES.md` (this file)

## Reported, not fixed
- `e2e/pr-ranges.spec.ts:45` already fails on the pre-fix code (see above).
- Other `useGithubTarget` consumers with their own fetches (for example `PrLinkedIssues`, `review-threads`, `review-memory`) were not audited for A→B late-response guards. That is outside findings 1–3.

## Final independent review outcome

`remote_p1_completion_high_review` reviewed the remote corrective delta against `/tmp/l8git-p1-remote-before`, the connected target/PR hooks and mutation callers. No new confirmed findings. The reviewer confirmed the previously incomplete P1 #3 is closed: old details and editors disappear on scope changes, and stale data/errors/loading cannot restore them. The earlier corrective review had accepted P1 #1 and #2 without additional confirmed issues. All three approved P1 are now independently reviewed. Nine P2 remain deliberately open; this is not general release clearance.
