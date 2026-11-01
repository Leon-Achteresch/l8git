# Workspace continuity and interaction hardening — 2026-11-01

This is the first interaction-quality package, not a native performance certification
or the proposed agent integration preview.

## Changes

- Shared buttons use native buttons and CSS press feedback instead of a Motion
  instance per button. The feedback respects reduced motion and the app's
  animation setting. Existing refs, disabled states and `asChild` remain supported.
- Route and repository panel changes show their content without fading or moving
  the whole view. Dialog, drawer and other targeted animations remain available.
- History restores its inspected commit, multiple selection, range anchor and
  scroll position when returning from another panel, route or repository.
- The commit panel restores its selected file. The file list restores its search,
  collapsed sections/folders and scroll position. Multiple file selections,
  selected hunks and open destructive dialogs are deliberately not resumed.
- Scroll offsets belong to their filter/display context. Changing that context
  starts at the top; refreshing the same list does not deliberately reset it.
- Only view state stays in RAM, for the 24 most recently updated repositories.
  Heavy panels unmount normally, and there are no scroll-triggered React state
  updates or localStorage writes. Closing a repository clears its view cache.

Selection restoration is limited to currently loaded, still-valid commits/files.
In particular, existing repository-switch history trimming and filtered-history
pagination can exclude an older selection. This package does not retain entire
histories or automatically fetch a selected commit that is no longer loaded.

## Validation

- Full Vitest suite: 193 files, 1,565 tests passed.
- Existing history, staging and virtual-row regression checks: 14 passed.
- Five new Playwright scenarios passed twice: history panel/route continuity,
  repository isolation and selection invalidation, file filter/selection/scroll
  continuity, and press feedback with animations enabled and disabled.
- TypeScript and production build passed. Vite reports large-chunk and mixed
  static/dynamic-import warnings; this package does not resolve those warnings.
- Production fixture build and the existing runtime-budget script passed all
  readiness, retained JavaScript heap and DOM limits over three samples, each
  with five warmed settings round trips. Local results are in
  `test-results/workspace-runtime.json` (not a before/after comparison).
- Final independent code review at high effort: no open findings.

The new UI regression checks run against deterministic IPC fixtures in Chromium.
They establish behavior, not native frame rates, Git subprocess latency, memory
usage in the real Tauri window, or performance parity with another Git client.
The outstanding WebKit/history and side-by-side-diff issues described in
[the previous report](performance-2026-10-18-commit-inspect.md) still require native
measurement and further work.

## Reproduce

```sh
bun run test
bun run build
bunx playwright test e2e/workspace-continuity.spec.ts --workers=1 --repeat-each=2
bunx playwright test e2e/history-workflows.spec.ts e2e/staging-workflows.spec.ts e2e/scroll-performance.spec.ts
bunx vite build --config vite.ui-test.config.ts
RUNTIME_BENCHMARK_OUT=test-results/workspace-runtime.json node scripts/benchmark-runtime.mjs
```

## Release verification

The complete release candidate also passed:

- Linux native release build with `--features headless`, producing `l8git` and
  `l8gitd`; the headless binary's `--version` invocation succeeds.
- All 739 Rust tests with `--locked --all-targets --features headless`, all 11
  relay tests, mobile typecheck and all 200 mobile tests.
- The complete 96-test Chromium workflow suite, locale-key checks, bundle limits,
  graph/diff compute budgets and the production renderer's runtime budgets.
- A functional smoke run of all 21 expanded benchmark targets. These short runs
  overlapped other builds/tests, so their frame rates are not a performance claim.
- Native Linux startup and process-memory sampling for a repository under an
  isolated HOME, D-Bus session and Xvfb, including the sample at 60 seconds. This
  uses software graphics and does not certify actual desktop/GPU frame rates.

The release review found one P2 issue in the pre-existing benchmark additions:
the palette target used `Control+K` on every platform and could silently measure a
closed palette on macOS. With user approval, it now uses `ControlOrMeta+K`, waits
for the visible palette input before typing and waits for it to close afterward.
The corrected target passed the Linux smoke run and a fresh independent high-effort
review with no findings. Practical macOS behavior still needs its own validation.

Local evidence is in `test-results/release-runtime.json`,
`test-results/release-benchmark-smoke.json` and
`test-results/release-native-memory.json`. macOS/Windows native verification and
the distributable installers are handled by GitHub's CI/release workflows.

## PR review follow-up

The scroll context now uses user-selected branch names rather than resolved tip
hashes, while history queries still use the current tips. Background history
reloads invalidate the restoration marker during their temporary empty state and
do not save its clamped zero offset. When a non-empty list returns, its actually
reachable offset is saved immediately, including zero for a permanently short
list. Performance fixture branches and tags now point to recent commits; their
counts and metadata are unchanged.

Four new browser regressions reproduced each failure before its correction:
empty filtered reload, advancing branch tip, recent fixture refs and the
long-to-short-to-long history sequence across a tab switch. All four and the
existing related checks pass (19 targeted UI scenarios in total). The final
independent high-effort review has no open findings. The full 1,565-test unit
suite, production and fixture builds, bundle limits and final renderer runtime
budgets also pass. The latest renderer evidence is in
`test-results/pr115-final-runtime.json`.
