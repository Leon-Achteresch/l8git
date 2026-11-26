# Typing and idle performance, 2026-11-26

Test machine: Apple M3, macOS 27.2.1. Baseline includes the first workspace optimization pass. Chromium measurements use a production UI fixture, 4× CPU throttling, animations enabled, 1,000 changed files and 10,000 commits. Each before/after value below is the median of three runs. WebKit used one final unthrottled run. Native timings use real Git and filesystem data.

## Typing

The draft text subscription now lives in the composer. The surrounding panel observes commit eligibility, amend state and AI action visibility. A 500-line description stays scrollable inside the editor while changed files remain accessible. Draft persistence still runs for each edit.

| Input | Chromium script ms before → after | Chromium key-to-frame p95 ms before → after | WebKit key-to-frame p95 ms after |
|---|---:|---:|---:|
| Subject | 397.2 → 277.6 | 15.8 → 16.9 | 17 |
| 500-line description | 376.5 → 266.9 | 16.4 → 15.1 | 16 |

Script time is cumulative for the whole typing sequence. Key-to-frame is the interval from the keyboard event timestamp to the next animation-frame callback, a proxy for responsiveness. Subject typing took less CPU time but its p95 latency remained around one frame.

## Status refresh

With a 32 MiB untracked text log (1,048,576 lines), the native debug status command took 197.47 ms before and 37.78 ms after, median of five calls to each version on a local filesystem. The command streams the file and counts delimiters with memchr. Untracked symlinks report their link text; reading status never needs to open the link target. The watcher filters read/open notifications and retains write-close and modification notifications.

The following Bun timings isolate the renderer-side comparison of two snapshots, with allocations of the input rows outside the timer. Status contents and order are checked before retaining the previous snapshot. Each value is the median of 15 comparisons.

| Changed files | Worktree change | Before (ms) | After (ms) |
|---:|---|---:|---:|
| 1000 | none | 0.202 | 0.023 |
| 1000 | first | 0.180 | <0.001 |
| 1000 | last | 0.183 | 0.009 |
| 10000 | none | 2.004 | 0.246 |
| 10000 | first | 1.779 | <0.001 |
| 10000 | last | 1.867 | 0.130 |
| 50000 | none | 10.117 | 0.778 |
| 50000 | first | 9.443 | <0.001 |
| 50000 | last | 9.322 | 0.637 |

## Worker failure and other stalls

The original side-by-side diff benchmark failed while creating its workers. Matching the original production worker configuration in the fixture isolated a missing TypeScript worker and reproduced Monaco’s main-thread fallback warning. Vite now bundles the editor, TypeScript/JavaScript, JSON, CSS and HTML workers locally and loads each on demand. The production bundle passes its existing size budgets; the largest lazy worker is 6.61 MiB uncompressed.

In the final Chromium side-by-side diff, p95 frame time was 16.8 ms and the median maximum was 133.3 ms. The final WebKit run reached 19 ms p95 and a 35 ms maximum. The initial one-run survey of 21 scenarios also recorded peaks of 150 ms for the search palette, 217 ms for tab switching and 200 ms for route switching. These peak values include opening or switching views, and their causes have not been isolated.

## Idle monitoring

The 4-second settled Chromium commit/history measurements recorded under 1 ms of page script time each. The UI fixture uses mocked IPC and excludes native process CPU. A separate optional shipped-entry benchmark waits through the fallback polling interval and records IPC calls, JS long tasks and cumulative script time without an animation-frame sampling loop. In 65 seconds the commit view issued one repo_status, one list_stashes and one rebase_status call. It recorded 0.60 ms of renderer script time and zero tasks of 50 ms or longer. The fixture returns in-memory responses; the native status cost is measured separately above.

## Reproduce

```sh
bun run benchmark:workspace
cargo test --locked --manifest-path src-tauri/Cargo.toml --features headless --test performance_budgets -- --nocapture --test-threads=1
SCROLL_BENCHMARK_RUNS=3 SCROLL_BENCHMARK_FRAMES=90 SCROLL_BENCHMARK_VIEWS=inspect-diff-split,idle-commit,idle-history,commit-typing,commit-typing-body bun run benchmark:scroll
bun run build
STARTUP_RUNS=3 STARTUP_IDLE_MS=65000 STARTUP_CHECK_BUDGETS=1 bun run benchmark:startup
```

## Isolating the tab-switch stall

Each direction now runs in its own fresh Chromium context against the production renderer fixture with 10,000 commits, 1,600 branches, 400 tags and 1,000 changed files. The starting tab settles for 1.5 seconds. The target waits for the first destination row and samples for another 300 ms. For a revisit the runner first opens history, returns to the commit panel, then records the next history open. The values below are medians of three runs with 4× CPU throttling. Frame gaps and cumulative JavaScript time measure different things.

| Transition | Longest frame before (ms) | After (ms) | Script before (ms) | After (ms) |
| --- | ---: | ---: | ---: | ---: |
| Commit → history, first open | 200.0 | 166.7 | 204.3 | 168.1 |
| Commit → history, revisit | 66.7 | 66.6 | 100.5 | 69.6 |
| History → commit | 33.4 | 33.4 | 60.1 | 57.0 |
| Commit → pull requests | 50.0 | 66.7 | 73.4 | 76.4 |
| Pull requests → commit | 33.4 | 33.3 | 66.6 | 55.7 |
| Commit → stash | 33.4 | 33.5 | 92.7 | 87.7 |
| Stash → commit | 33.4 | 33.4 | 55.0 | 53.5 |

Profiling identified graph construction, branch sorting for a closed picker, and scans over commit data during mount. The history panel now reuses its hash index for context menus and cherry-pick ordering. It builds branch options and author suggestions on demand and reuses the graph while its commit and branch snapshots remain current. Virtual row sizing skips an initial duplicate measurement. The first-open maximum across the three individual optimized runs ranged from 166.7 to 183.3 ms. Reopening the panel reduced script work while the median longest frame stayed near 67 ms.

The direction-by-direction measurements use the tab store action. Two additional scenarios activate the actual sidebar control via click or keyboard Enter. Both recorded a median maximum frame gap of 166.7 ms on the final Chromium build. The pull request direction varied by one frame interval in this small sample. These renderer measurements use in-memory IPC responses.

Playwright WebKit on the same machine, without CPU throttling, recorded median maximum frame gaps of 59 ms on first opening with the mouse and 52 ms on a revisit (three runs each).

```sh
SCROLL_BENCHMARK_VIEWS=tab-commit-to-history,tab-commit-to-history-revisit,tab-history-to-commit,tab-commit-to-pr,tab-pr-to-commit,tab-commit-to-stash,tab-stash-to-commit,history-open-mouse,history-open-keyboard bun run benchmark:scroll
SCROLL_BENCHMARK_BROWSER=webkit SCROLL_BENCHMARK_VIEWS=history-open-mouse,tab-commit-to-history-revisit bun run benchmark:scroll
bun run benchmark:workspace
```
