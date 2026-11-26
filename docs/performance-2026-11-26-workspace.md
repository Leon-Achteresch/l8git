# Workspace performance, 2026-11-26

Measured on Apple M3, arm64, macOS 27.2.1, Bun 1.4.3. The baseline was the working tree at 3db40a9 before these performance edits. Each pair used the same fixtures and runner settings.

## Production renderer

Chromium headless, 1280 × 860, 4× CPU throttling, animations enabled, mocked native IPC. Each value is the median of three independent 90-frame scroll runs. The p95 column is the median of the three within-run frame-time percentiles.

| View | FPS before → after | p95 frame ms before → after | Script ms before → after | Layout ms before → after |
|---|---:|---:|---:|---:|
| history | 58.1 → 57.4 | 16.8 → 16.8 | 897.2 → 958.1 | 192.1 → 198.6 |
| inspect-diff | 43.2 → 58.7 | 33.4 → 16.8 | 408.9 → 263.4 | 232.8 → 169.0 |
| branches | 56.8 → 56.8 | 16.8 → 16.8 | 289.3 → 300.7 | 90.3 → 96.0 |

Reducing overscan from 20 to 6 rows on each side of the visible read-only diff reduced scripting and layout during the full-list sweep. Branch sorting runs on sidebar updates, outside the steady-state scroll measurement. The history and branch scrolling samples show no material improvement.

## Workspace computations

Milliseconds per operation, one warm-up and 15 measured samples per scenario. At this sample size nearest-rank p95 is the slowest sample. Inputs are prepared outside the timer. Word-diff cases highlight 64 line pairs per operation. History graph construction, ancestor traversal and patch parsing are controls. Timing budgets in CI apply to medians.

| Scenario | Median before | Median after | p95 before | p95 after |
|---|---:|---:|---:|---:|
| branches/flat/100 | 0.506 | 0.053 | 0.574 | 0.065 |
| branches/grouped/100 | 0.468 | 0.032 | 0.486 | 0.040 |
| branches/remote/100 | 0.450 | 0.034 | 0.506 | 0.049 |
| branches/flat/1000 | 6.767 | 0.417 | 7.948 | 0.502 |
| branches/grouped/1000 | 6.910 | 0.436 | 7.699 | 0.455 |
| branches/remote/1000 | 6.888 | 0.438 | 7.138 | 0.463 |
| branches/flat/5000 | 43.288 | 2.743 | 44.015 | 2.762 |
| branches/grouped/5000 | 43.088 | 2.575 | 43.940 | 2.932 |
| branches/remote/5000 | 43.469 | 2.765 | 45.351 | 3.091 |
| history/linear/100 | 0.030 | 0.029 | 0.107 | 0.076 |
| ancestors/linear/100 | 0.019 | 0.022 | 0.051 | 0.047 |
| history/merges/100 | 0.028 | 0.026 | 0.039 | 0.035 |
| ancestors/merges/100 | 0.013 | 0.013 | 0.016 | 0.015 |
| history/linear/1000 | 0.196 | 0.199 | 0.789 | 0.618 |
| ancestors/linear/1000 | 0.078 | 0.109 | 0.283 | 0.261 |
| history/merges/1000 | 0.069 | 0.196 | 0.282 | 0.590 |
| ancestors/merges/1000 | 0.065 | 0.071 | 0.075 | 0.079 |
| history/linear/10000 | 0.990 | 0.913 | 2.008 | 1.758 |
| ancestors/linear/10000 | 0.787 | 0.708 | 1.252 | 1.419 |
| history/merges/10000 | 1.082 | 0.630 | 2.032 | 1.669 |
| ancestors/merges/10000 | 0.842 | 0.768 | 1.832 | 1.093 |
| diff/parse-and-flatten/10 | 0.026 | 0.022 | 0.065 | 0.053 |
| diff/parse-and-flatten/100 | 0.164 | 0.198 | 0.467 | 0.222 |
| diff/parse-and-flatten/1000 | 1.135 | 1.048 | 1.583 | 1.546 |
| word-diff/16/edit-at-0 | 0.390 | 0.407 | 0.593 | 0.621 |
| word-diff/16/edit-at-8 | 0.333 | 0.207 | 0.453 | 0.339 |
| word-diff/16/edit-at-15 | 0.339 | 0.158 | 0.460 | 0.231 |
| word-diff/64/edit-at-0 | 3.220 | 3.203 | 3.368 | 3.506 |
| word-diff/64/edit-at-32 | 3.045 | 1.269 | 3.229 | 1.418 |
| word-diff/64/edit-at-63 | 3.141 | 0.593 | 3.691 | 0.870 |
| word-diff/160/edit-at-0 | 15.860 | 16.134 | 16.620 | 17.769 |
| word-diff/160/edit-at-80 | 15.945 | 5.029 | 16.914 | 5.183 |
| word-diff/160/edit-at-159 | 15.696 | 1.267 | 16.154 | 1.382 |

## Startup reference

The shipped German renderer reached its first usable view in 349 ms for an empty workspace, 629 ms for the commit view and 660 ms for history (median of three cold Chromium contexts per view, 4× CPU throttling, mocked IPC). The corresponding paint-ready times were 292, 585 and 588 ms. This measures the final build and excludes native process and WebView launch.

## Native Git operations

The existing Rust integration test measured 25 ms for status on a worktree with 1,000 untracked files and one modified file, and 35 ms to read its 20,000-line diff. The debug test process used 13.1 MiB RSS afterward. These are single-run reference values for the final build.

## Reproduce

```sh
bun run benchmark:workspace
bun run build
STARTUP_RUNS=3 STARTUP_CHECK_BUDGETS=1 bun run benchmark:startup
cargo test --locked --manifest-path src-tauri/Cargo.toml --features headless --test performance_budgets -- --nocapture
SCROLL_BENCHMARK_RUNS=3 SCROLL_BENCHMARK_FRAMES=90 SCROLL_BENCHMARK_VIEWS=branches,history,inspect-diff bun run benchmark:scroll
```
