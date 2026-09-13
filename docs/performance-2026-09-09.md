# Renderer performance — 2026-09-09

Follow-up to [performance-2026-09-07.md](performance-2026-09-07.md). The goal was
60 FPS across the app, including while data is loading. This round profiled the
renderer instead of guessing, so every change below is tied to a measured hot
spot.

## What was actually slow

CPU profiles of a scrolling production build (`scripts/profile-scroll.mjs`)
showed three dominant costs, none of which was the virtualizer:

1. **Motion layout projection — 26.5 % of all CPU samples** in the changed-files
   view, spent in `measureScroll`. The `layout` prop had been applied to the base
   primitives (`Button`, `Card`, `Item`, `TableRow`, `ListRow`, `Accordion`,
   `Collapsible`, `TabsContent`) and to most list rows, so every render commit
   measured the whole layout-projection tree. `checkIsScrollRoot` additionally
   calls `getComputedStyle` per projection node.
2. **A forced synchronous layout per commit row — 24.9 % of samples** in the
   commit-history view. `CommitGraphCell` read `el.clientHeight` inside
   `useLayoutEffect`, so every row the virtualizer mounted flushed layout for the
   whole document.
3. **Eagerly built context menus and dialogs per row.** Each file, folder and
   commit row constructed its full `ContextMenuContent` on every render, and each
   commit row additionally mounted four dialogs plus `useTranslation`. React
   allocated that tree for ~30 rows continuously while scrolling. i18n alone was
   5–6 % of samples.

A fourth, smaller issue: `ROW_ESTIMATE_BASE_PX` in the commit list was 48 px
while rows render at 30 px, so the virtualizer corrected offsets constantly.

## Changes

- Removed the bare `layout` prop from every component that used it. Shared-element
  animations (`layoutId`, the indicator pills, `layout="position"` in the file
  tree) are untouched.
- `CommitGraphCell` observes size with `ResizeObserver` only; the synchronous
  `clientHeight` read is gone and the state update is guarded against no-op
  renders.
- `Spinner`, `SpinIcon`, `PulseIcon`, `Spin` and `Pulse` use CSS animations
  instead of Motion. Loading indicators no longer run a JS animation on the main
  thread while the data they wait for is being processed, and they no longer need
  the lazily loaded Motion feature bundle in order to animate. Reduced motion is
  still honoured — `index.css` already disables CSS animations for
  `prefers-reduced-motion` and `data-animations="off"`.
- File, folder and commit rows build their context-menu content only once the
  menu opens. The commit row's dialogs, store subscriptions, `useExplainSheet`
  and `useTranslation` moved into a `CommitRowActions` child that mounts on first
  open and then stays mounted, so a dialog opened from the menu survives the menu
  closing.
- The commit row renders a plain `div`; the focus pulse is a CSS keyframe
  (`.l8-commit-pulse`) instead of a Motion element per row.
- `ROW_ESTIMATE_BASE_PX` corrected to 30 px. Dynamic measurement via
  `measureElement` stays, so rows that wrap are still positioned correctly —
  removing it measured no faster.

## Measurements

Production build, Chromium, 1280 × 860, deterministic IPC fixtures: 1 000 changed
files and 10 000 commits, 240 frames per view, animations enabled. "Before" is
commit `d85696d` with the same benchmark harness. Runs were interleaved between
the two versions on the same machine.

At a wheel-speed scroll (`SCROLL_BENCHMARK_PX_PER_FRAME=100`, roughly three rows
per frame):

| View | Throttle | FPS before → after | Frames > 33.4 ms | JS time before → after |
| --- | --- | --- | --- | ---: |
| Changed files | none | 60.0 → 60.0 | 0 → 0 | 424 → 234 ms (−45 %) |
| Commit history | none | 60.0 → 60.0 | 0 → 0 | 891 → 535 ms (−40 %) |
| Changed files | 4× | 59.3 → 60.0 | 1 → 0 | 1 497 → 673 ms (−55 %) |
| Commit history | 4× | 42.7 → 38.8 | 46 → 47 | 2 886 → 1 989 ms (−31 %) |

Under the default worst-case workload (the full list swept in 120 frames,
about eight rows per frame — faster than any user scrolls), unthrottled medians
of three interleaved runs:

| View | FPS before → after | Frames > 33.4 ms | JS time before → after |
| --- | --- | --- | ---: |
| Changed files | 60.0 → 60.0 | 0 → 0 | 1 282 → 429 ms (−66 %) |
| Commit history | 30.6 → 36.3 | 87 → 54 | 4 640 → 2 964 ms (−36 %) |

## What this does and does not show

- Both lists hold a locked 60 FPS with no dropped frames at realistic scroll
  speed on an unthrottled renderer.
- **60 FPS is not guaranteed everywhere.** Under 4× CPU throttling the commit
  history still drops to about 39 FPS with ~47 long frames. Its JS time is 31 %
  lower than before, but the remaining cost is React mounting and unmounting
  commit rows (28 DOM nodes each, including an SVG graph cell) and no single
  hot spot is left to remove. Getting that view to 60 FPS on slow hardware needs
  a structural change — a single SVG for the visible graph column and a smaller
  row DOM — not another micro-optimisation.
- FPS numbers on a loaded machine are very noisy; 4×-throttled runs varied by
  more than 2× between rounds on the same build. The `scriptMs` / `layoutMs` /
  `taskMs` counters from `Performance.getMetrics` were consistent and are the
  reliable signal here.
- Nothing was measured in native Tauri/WebKit, nor for process RSS, Git
  subprocess CPU or battery.

## Validation

- 722 unit tests and TypeScript pass.
- `scripts/check-context-menus.mjs` verifies both deferred context menus still
  open on the *first* right-click (the regression risk of mounting menu content
  lazily).

## Reproduce

```sh
bun run benchmark:scroll                              # default worst-case sweep, 4x throttle
SCROLL_BENCHMARK_THROTTLE=1 bun run benchmark:scroll  # unthrottled
SCROLL_BENCHMARK_PX_PER_FRAME=100 bun run benchmark:scroll   # wheel-speed scroll
node scripts/check-context-menus.mjs
npx vite build --config vite.profile.config.ts && node scripts/profile-scroll.mjs
PROFILE_SCENE=performance-history node scripts/profile-scroll.mjs
```

`SCROLL_BENCHMARK_OUT` saves the measurement JSON. Run benchmarks without
simultaneous builds or tests and compare the same browser and hardware.
