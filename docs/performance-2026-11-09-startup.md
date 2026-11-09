# Renderer startup — 2026-11-09

Baseline: `26d5f67d2a04aa520936886c36b665ab433564eb` (v1.1.4).

## Scope and measurement

`scripts/benchmark-startup.mjs` exercises the shipped `dist/index.html` and real
entry module. It replaces native IPC with deterministic responses, then measures
an empty workspace, a restored commit view with 1,000 changed files, and a restored
history with the native initial page size of 80 commits. Settings navigation and
return to the repository, plus the palette's first load and keyboard reopen, are
checked after the timing signal.

Measurements use fresh browser contexts, a 1280 × 860 viewport, reduced motion,
the German default locale with its English fallback, and five samples per view.
Chromium runs with 4× CPU throttling on an Apple M3 (macOS arm64). Readiness includes
two animation frames after the expected content becomes visible. JavaScript bytes
are completed resource bodies at that point, without HTTP compression. These are
renderer timings, **not** native process/WebView launch or OS-cache-cold timings.
CPU-profile runs are diagnostic only and excluded from the comparison.

The existing `benchmark-runtime.mjs` remains the heap/large-fixture gate. Its entry
loads the test scene collection, so it should not be interpreted as shipped-app
startup. Both benchmarks are retained in CI.

## Initial optimization results (`362c30f`)

| View | Before | After | Ready-time reduction | Completed-JS reduction |
| --- | ---: | ---: | ---: | ---: |
| Empty workspace | 433 ms | 344 ms | 20.6% | 36.5% |
| Restored commit view | 679 ms | 610 ms | 10.2% | 14.3% |
| Restored history | 735 ms | 664 ms | 9.7% | 10.7% |

Every optimized timing sample was below the fastest baseline sample for its view.
The empty workspace's median script time fell from 205 to 168 ms; restored commit
and history script time fell from 376 to 345 ms and 406 to 366 ms respectively.
Raw numeric samples and source hashes are in
[performance-2026-11-09-startup.json](performance-2026-11-09-startup.json).
The samples and hashes identify optimization commit `362c30f`. Review fixes in
`b02ac6a` add failed-import recovery, independent background error logging and
benchmark cleanup without changing the normal startup sequence. The further
startup changes below have their own captures. These are measured improvements,
not a claim of a universal minimum launch time.

## 150 ms target follow-up (`8744c5b`)

An empty renderer can meet 150 ms in this setup. Fully restored repository views
still exceed it. No result here establishes a 150 ms native cold launch.

The harness now also records `paintReadyMs` inside the page: a MutationObserver
recognizes the expected content, then crosses two animation frames. This avoids
including Playwright selector polling and transport latency in that metric. The
original `readyMs` signal and its existing CI limit remain intact. A rendering
opportunity is a proxy, not a measured display presentation timestamp. Both PR
revisions below use the same timed readiness logic; the old table above retains
its original measurements.

Five fresh WebKit contexts per view, no CPU throttle, German locale, same M3:

| View | `b02ac6a` | `8744c5b` | Target |
| --- | ---: | ---: | ---: |
| Empty workspace | 115 ms | 127 ms | 150 ms |
| Restored commit view | 291 ms | 268 ms | 150 ms |
| Restored history | 318 ms | 270 ms | 150 ms |

These are medians of `paintReadyMs`. Commit and history improve by 7.9% and 15.1%;
the empty view is 12 ms slower in this capture. A separate three-sample WebKit
first-use verification produced 118/267/268 ms. That variation is another reason
not to describe one number as a platform-independent lower bound.

The CPU-throttled Chromium comparison also retains its trade-offs:

| View | Before `readyMs` / `paintReadyMs` | After `readyMs` / `paintReadyMs` |
| --- | ---: | ---: |
| Empty workspace | 350 / 303 ms | 352 / 310 ms |
| Restored commit view | 608 / 571 ms | 629 / 596 ms |
| Restored history | 666 / 617 ms | 638 / 577 ms |

The commit view's throttled readiness regresses despite median script time
falling from 345 to 341 ms. History script time falls from 369 to 346 ms.
The follow-up favors the restored-view path in the macOS app's WebKit engine;
it does not claim a speedup in every browser and CPU condition. All previous
bundle, memory and correctness budgets stay unchanged. Numeric samples and
application source hashes are in
[performance-2026-11-09-startup-follow-up.json](performance-2026-11-09-startup-follow-up.json).

Eagerly bundling both repository panels exceeded the unchanged static-entry
budget; an early HTML module-preload experiment produced no consistent gain.
Neither experiment is shipped. Profiles spread the remaining cost across React
mounting, style/layout and frame scheduling; they do not establish a hard lower
bound for another architecture.

Additional changes:

- Begin the saved repository and local-status reads before the first React
  render. The rehydration hook avoids a duplicate initial `open_repo`, including
  StrictMode's effect probe, and refreshes normally on later route mounts.
- Remove the initial blank/deferred workspace pass; retain deferred repository
  and tab switching. Saved panels still preload alongside the native reads.
- Load commit inspection only when a commit is selected and load issue creation
  only when opened. The production harness now checks first-use inspection too.
- Start background wiring after the selected panel commits. A five-second timer
  keeps updates/notifications available when the initial view fails or the window
  starts hidden; it clears when the visible view starts the services normally.
- Synchronize the delayed CI-worktree browser test with the committed panel
  switch before releasing its response, so it tests completion after navigation.

Local follow-up validation: 217 suites / 1,719 frontend tests, all 132 browser
workflows, production build/typecheck, locale checks and bundle/security budgets;
production startup, palette/navigation and first-use inspection in Chromium and
WebKit. Final CI and release publication remain separate gates.

## Changes

- Keep the always-first `/` route in the entry graph, eliminating a serial route
  request. Load only the chosen repository panel, starting its import alongside
  native reads. The small panel loader shows completed imports immediately rather
  than imposing an extra Suspense fallback/reveal cycle.
- Split the command palette from its persistent trigger and hotkey. Split AI
  explanation controllers and commit-focus requests from their large UI modules.
  Closed Git dialogs and the inbox popup load on first use; dialogs retain their
  state and exit animations afterwards. Keyboard closing also clears palette search.
- Start update/notification wiring after the selected view has crossed a paint,
  once per app lifetime, including when the user immediately changes routes;
  retain a fallback for hidden windows or failed initial views.
- CPU profiles identified synchronous layout reads in container sizing, the repo
  rail's active-tab scrolling, and chunk visibility checks. Let ResizeObserver
  deliver the initial layout before measuring/scrolling; skip chunk geometry and
  scroll-root traversal when all chunks are already rendered. Long lists retain
  their visibility and focus handling.

The static-entry gzip budget is unchanged. Its measured scope now includes `/`,
which was previously a dynamic chunk: static-entry bytes can rise while actual
startup requests and completed JavaScript fall. Editor, language, AI-provider and
terminal bundles remain available on demand.

## Verification

- Typecheck, production build, locale consistency and bundle/security budgets.
- 217 frontend suites / 1,719 tests; 783 native Rust tests with `headless`;
  mobile typecheck and 200 tests; 11 relay tests.
- Full 132-test Chromium workflow run; after the layout changes, all 39 focused
  responsive, scroll, focus/recycling and workspace-continuity tests passed again.
- Production WebKit startup, first-use palette and settings round trips for all
  three views; existing renderer heap and retained-growth budgets.
- macOS release app bundle (locally ad-hoc signed), real repository restoration,
  commit/history switching and first-use palette smoke. CI validates the final source on Linux, macOS and Windows; release
  installers and updater assets must also pass publication checks.

## Reproduction

Preserve a production build of the baseline, then run the new harness against it
and the current production build without concurrent compilers or test runners:

```sh
STARTUP_DIST=/path/to/baseline-dist STARTUP_VERIFY_PALETTE=0 \
  STARTUP_OUT=test-results/startup-before.json bun run benchmark:startup
STARTUP_CHECK_BUDGETS=1 STARTUP_OUT=test-results/startup-after.json \
  bun run benchmark:startup
STARTUP_BROWSER=webkit STARTUP_RUNS=3 bun run benchmark:startup
```

The baseline disables only the new post-timing palette check: its old global
shortcut does not clear the search query on close. The timed startup sequence is
identical. `STARTUP_LOCALE=en` tests the single-bundle English case; the default is
`de`. Optional `STARTUP_PROFILE_DIR=/tmp/startup-profiles` writes CDP CPU profiles;
use a sourcemapped build to inspect original source locations.

CI runs three samples and rejects closed heavy UI chunks requested before
readiness, duplicate initial repository opens, runtime errors, broken first-use/
navigation/inspection flows, and readiness above
6 seconds. Existing static bundle and memory limits are not relaxed.
