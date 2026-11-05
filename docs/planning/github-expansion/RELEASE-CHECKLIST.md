# GitHub expansion release checklist

Status: preparation only. This document does not certify any of the 78 requested features as complete.

## Latest root gate snapshot (2026-11-05)

This section supersedes the intermediate snapshots below; it is not release clearance.

### After the three approved new P1 corrections

- All three P1 corrections were authored by Opus 5.5 and independently reviewed at high. The first corrective review found incomplete coverage of the already approved remote finding; Opus completed it, and the subsequent independent review reported no new confirmed findings. Evidence: `NEW-P1-FIXES.md`.
- User explicitly selected **only the three new P1**. Findings 4–12 in `FINAL-UI-REVIEW.md` (nine P2) remain open and unchanged. No approval for their correction is inferred.
- Final integrated TypeScript passed, `/tmp/l8git-final-typecheck.log` (empty, exit 0). Seven locales retain parity at 4806 keys; statically used keys exist.
- Final frontend unit run passed **215 suites / 1712 tests**, `/tmp/l8git-final-unit.log` (exit 0).
- Final production Vite build passed, `/tmp/l8git-final-build.log`. Bundle/sentinel gate passed: startup gzip 358328 bytes, largest JS 3787383, largest worker 7010192, total JS gzip 8865637; no build-secret sentinel. `/tmp/l8git-final-budgets.log`.
- Deterministic performance checks passed: 10000-commit graph median 8.23ms (500ms cap); 1000-hunk diff median 3.67ms (300ms cap). `/tmp/l8git-final-algorithms.log`.
- Mobile TypeScript passed; mobile tests **26 suites / 200 tests** passed, `/tmp/l8git-final-mobile.log`. Relay **11 tests** passed, `/tmp/l8git-final-relay.log`.
- Native Rust all-target result remains **783 passed**, `/tmp/l8git-final-native-tests.log`; no Rust source changed during these UI corrections.
- Full serial Chromium run: **129/132 passed** in 11.6 minutes. Two older workflow tests timed out during overlapping local build load; both passed unchanged in an isolated 2/2 rerun. The third failure was a false exact-read-count assertion in the new suggestion test. Opus corrected only that test; the full narrow range spec then passed 4/4 and an independent high review found no issues. All 132 tests have now passed across the full run plus targeted reruns; this is not represented as one clean full run. CI must establish the clean final browser gate. Logs: `/tmp/l8git-final-browser.log`, `/tmp/l8git-final-browser-timeout-rerun.log`; first-run evidence `/tmp/l8git-final-browser-failures`.
- Production UI-test build and renderer startup/heap checks passed. Median home ready1561ms, repository ready862ms, retained JS heap29472708 bytes, warmed retained growth2639372 bytes,704 DOM nodes; all within existing limits. `/tmp/l8git-final-runtime-budgets.json`. Native platform CI and release publication remain pending. Local checks included the preserved unrelated app-shell edit; clean-checkout CI must validate the committed release source.

- Final native command `cargo test --locked --features headless --all-targets -j 1` completed with exit 0: **783 tests passed** across the library and integration targets, including 439 library tests. Log: `/tmp/l8git-final-native-tests.log`. This includes the approved backend corrections, source/evidence additions and identity fixture. No Rust source edits followed this gate.
- Integrated TypeScript passed (empty `/tmp/l8git-final-typecheck.log`); subsequent small review-thread fields and pinned-range integration require a final settled-source rerun.
- Serial full frontend run passed **215 suites / 1704 tests**, `/tmp/l8git-final-unit-tests-serial.log`; later focused range tests passed 71/71 and API tests 18/18. Final all-source rerun remains required.
- The independent backend high review found no additional confirmed P0–P3 issues. The first approved nine findings have been implemented. New UI reviews found **three P1 and nine P2**; their consolidated implementation approval is pending. See `FINAL-UI-REVIEW.md`.
- Browser gates remain pending: approved-fix regression spec (7), task-flow spec (12), latest pinned-range spec (4), and the full suite. Earlier partial successes do not establish a green final browser gate.
- Version base is now consistently **1.1.0** in package, Tauri and Cargo manifests/lockfile. Recompute the final release SHA's generated version and verify uniqueness before publishing; no tag, PR, push or release has been created.
- Existing user `app-shell.tsx` remains the original 7-addition/4-deletion diff and is excluded from this task's release staging.

The current release gate is final checks and CI/artifact acceptance. The three newly approved P1 are now independently reviewed as corrected. The user explicitly deferred the nine P2; they remain documented release limitations and are not silently fixed or represented as resolved.

## Baseline captured on 2026-11-05

- Repository: `Leon-Achteresch/l8git`; working branch `development`, baseline commit `0cb17e0b250689edd931d8dc1f271446d9da2cc3`.
- Pre-existing user change: `src/components/app/shell/app-shell.tsx`; preserve it and distinguish it from implementation changes during review.
- Latest published release observed: [v1.0.85](https://github.com/Leon-Achteresch/l8git/releases/tag/v1.0.85).
- Latest observed main release run: [41345219981](https://github.com/Leon-Achteresch/l8git/actions/runs/41345219981), successful for `14a9d78ec368ef34c27e29967512b1ac978a8cde`.
- Baseline development CI: [41344133009](https://github.com/Leon-Achteresch/l8git/actions/runs/41344133009), successful for the baseline commit.
- GitHub CLI is authenticated with repository and workflow access. No token values belong in reports or artifacts.
- Local host is Linux; Node `20.19.2`, Bun `1.3.10`, Rust `1.99.0`. Bun is installed at `/home/leon/.bun/bin/bun` but is absent from the login shell PATH.
- Locale parity and statically used locale keys: passed; 3,895 keys in seven locales. Dynamic translation keys still require runtime coverage.
- Baseline `node node_modules/typescript/bin/tsc --noEmit`: passed.
- Focused frontend baseline: eight suites and 65 tests passed (`pr-provider`, `pr-review-drafts`, `pr-suggestions`, `pr-threads`, `inbox`, `hub/github`, `provider-rate-limit`, `app-releases`).

## Before publishing

- [ ] The implementation ledger accounts for all 78 requested IDs, with end-to-end behavior and test evidence. Helpers, placeholders and disabled controls alone do not fulfill a feature.
- [ ] All UI changes were made by Opus 5.5, as requested. Backend/service changes and integration are attributed separately.
- [ ] Applicable documentation, supported-provider capabilities, remote/server dispatch contracts and error states match the implemented behavior.
- [ ] Independent `/code-review` at high covers only this task's changes. Report findings with severity and obtain user approval before fixing them, per `/home/leon/.codex/AGENTS.md`.
- [ ] Required checks below pass against the final reviewed head, rather than an earlier intermediate commit.
- [ ] Native behavior, real-provider permissions, rate limits, pagination, unsupported capabilities and destructive Git-operation guards have meaningful validation evidence.
- [ ] Final diff preserves unrelated user work; final release scope and remaining limitations are explicitly known.

## Exact current CI gates

`.github/workflows/ci.yml` runs for pull requests and pushes to `main` or `development`, and is callable by the release workflow.

Linux checks, in order:

1. Install native Tauri build dependencies, Rust and Bun; `bun install --frozen-lockfile`.
2. `node scripts/check-locales.mjs` and `node scripts/check-used-locales.mjs`.
3. `bunx tsc --noEmit`.
4. `bun run test`.
5. `bun run build` with the workflow's build-secret sentinel.
6. `node scripts/check-build.mjs` and `bun scripts/benchmark-ui.ts`.
7. In `src-tauri`: `cargo test --locked --all-targets --features headless`.
8. In `mobile`: `bun run typecheck` and `bun run test`.
9. In `relay`: `cargo test --locked`.
10. Install Playwright Chromium; `bun run test:ui`.
11. `bunx vite build --config vite.ui-test.config.ts` and `node scripts/benchmark-runtime.mjs`.
12. Preserve runtime measurements; preserve browser failure evidence when relevant.

Parallel native jobs on macOS and Windows each run dependency installation, `bun run build`, and `cargo test --locked --manifest-path src-tauri/Cargo.toml --all-targets --features headless`, with a 45-minute job timeout.

Local Linux success cannot certify native macOS/Windows UI, installers, signing, updater execution or real GitHub account workflows. CI build/test success also does not replace runtime acceptance of these behaviors.

## Release trigger and version

- `.github/workflows/release.yml` starts automatically on a push to `main`, or manually through `workflow_dispatch`. A push to `development` starts CI only.
- Do not push/merge to `main` as a preparatory action: that starts publishing.
- Release runs include the full reusable CI workflow. The publish matrix waits for its `checks` job and release preparation.
- The version script takes package major/minor and counts commits since the latest package-version change. It does not select the next unused tag from GitHub releases.
- The unchanged baseline development checkout computes `1.0.84`, while published `v1.0.85` already exists. Recompute on the intended final release commit and verify tag uniqueness and version monotonicity before triggering publication.
- `set-version.mjs` writes the computed version into `package.json`, `src-tauri/tauri.conf.json`, and the package entry in `src-tauri/Cargo.toml` in the workflow checkout. Validate package/lockfile compatibility through the actual locked release build.
- The workflow creates a public release directly (`releaseDraft: false`, `prerelease: false`); it is not an unpublished staging release.

## Publishing and artifact acceptance

- [ ] Required CI, preparation, and all three publish jobs succeed for the intended exact release SHA.
- [ ] macOS universal build succeeds (`--target universal-apple-darwin --features headless`).
- [ ] Windows and Ubuntu 22.04 builds succeed with `--features headless`.
- [ ] Published assets include expected macOS DMG/application archive, Windows NSIS/MSI, and Linux AppImage/DEB/RPM formats, with updater signatures where required by configuration.
- [ ] `latest.json` exists, has the intended version, contains all expected platform entries (including universal macOS mapping), and points to uploaded assets with nonempty signatures.
- [ ] Tauri signing succeeds with configured repository secrets and matches the updater public key configured in the application. Never print signing secrets.
- [ ] Determine actual macOS signing/notarization status from the workflow evidence. The workflow intentionally permits unsigned macOS output when Apple secrets are absent; a green build alone does not establish signing.
- [ ] Confirm tag, release page, changelog and release target SHA, plus artifact availability. The release page can appear before the complete publish matrix has finished.
- [ ] Perform native install/update smoke acceptance where suitable devices are available; record any platform limits explicitly.

## Monitoring handoff

- Root owns publishing and babysitting; child agents do not start PR watches or releases.
- For PR work, link each created/pushed PR immediately using T3 `link_pull_request`, finish needed updates, then use `watch_pull_request` and end the turn while awaiting checks/reviews. Handle wakeups against the current head. Stop the watch before final handback.
- For the release run itself, GitHub CLI read calls can identify the exact run and inspect job state/logs (`gh run list`, `gh run view`, `gh release view`). There is no dedicated workflow-run watch tool exposed in the current catalog.
- The user explicitly requested release babysitting. If monitoring must continue with no active turn, root may configure an authorized scheduled task bound to the precise repository/run and an explicit stop-on-success condition. Do not create schedules prematurely, and do not use scheduling or polling to wait for a delegated child or a PR.
- On a failed release job, inspect its failure first, distinguish transient infrastructure from code/configuration failures, and preserve the original reviewed SHA/version relationship when deciding whether to retry or fix. Code-review findings still follow the user's approval rule.
- Report success only after the full release run and artifact checks succeed; do not equate release-page creation with completed publication.

## Implementation-stage validation update

- `cargo check --locked --features headless --lib` passed during integration.
- Full cargo library runs passed 424 then 425 tests; the subsequently built current library binary passed 426/426 with `--test-threads=2`, including all 20 final advanced-Git fixtures and seven hub fixtures.
- `cargo test --locked --features headless --test git_diff_preview` passed four integration tests.
- A later `--all-targets` run was intentionally interrupted (exit 130) under host memory pressure, rather than a test assertion failure. Other project builds plus redundant concurrent typechecks exhausted available RAM; only this agent's cargo and redundant tsc were stopped. Run the final full gate serially (`-j 1`) after sources settle and sufficient memory is available.
- Latest identity-profile registration/fixture postdates the successful library binary. All-target integration tests, final shared-source typecheck, native CI and independent review remain required; these intermediate results do not certify release readiness.

### Root serial all-target validation

Root subsequently ran `cargo test --locked --features headless --all-targets -j 1` in `src-tauri`; it completed with exit 0, including the previously pending identity registration and all integration targets. This removes the earlier memory-pressure interruption as a test blocker. Additional `source_files` and `evidence_run` backend work started after this successful run, so it still requires its own focused tests and a final settled-source gate. UI integration, real-provider acceptance and independent high review remain open.

### Integrated browser and build snapshot

- Production Vite build completed; `scripts/check-build.mjs` passed with startup gzip 356264 bytes (460800 cap), largest JS 3787383 bytes, largest worker 7010192 bytes and no build-secret sentinel in output. This is a snapshot before final UI changes, not final release certification.
- Complete frontend unit run: 211 suites / 1667 tests passed. Mobile: 26 suites / 200 tests passed. Relay: seven unit and four integration tests passed. Later source changes still require final checks.
- Full Chromium run: 91/100 passed, nine failed. Preserved first failure contexts at `/tmp/l8git-ui-failures-first-run`.
- Re-ran only those nine with `--last-failed --workers=1`: eight passed unchanged, one failed again. The reproducible failure is `e2e/responsive-workspace.spec.ts:140`: at 150% text scale the first diff line extends outside its scroller by 12.5625px (required <1px). Opus main UI owner was notified; assertions/timeouts were not weakened. The eight non-reproduced failures are not proof of a fully stable browser gate.
- Independent scoped reviews found two P1 and seven P2 issues in total. See BACKEND-REVIEW.md and UI-REVIEW.md. User approved all nine corrections; fixes and regression tests remain in progress. Release readiness is withheld until they are resolved and the remaining features are accepted.

### Approved corrections and live read verification

- User explicitly approved all nine combined review findings ("Alle neun beheben"). Corrections are in progress; all UI corrections remain Opus 5.5 work.
- The JSX false-edge correction excludes JSX/TSX from the limited import scanner and returns explicit unsupported paths. Its four focused import-analysis tests pass; UI scope/exclusion disclosure is assigned to Opus.
- Root extracted the actual GraphQL query strings for `getMergeReadiness`, `getPullMeta`, `listReviewThreads` and `listLinkedIssues` from the source and executed them read-only against `Leon-Achteresch/l8git` PR 115 through the authenticated GitHub CLI. All four returned data without GraphQL errors. Evidence: `/tmp/l8git-live-read-smoke.json`. This verifies those live query shapes, not app keychain integration, UI behavior or remote mutation workflows. No issue/comment/PR/workflow was created.
