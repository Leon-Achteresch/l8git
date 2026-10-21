# Scrolling in commit details — 2026-10-18

Follow-up to [performance-2026-09-09.md](performance-2026-09-09.md). Scrolling in the
commit details (diff, changed files, history beside them) stuttered on big commits.

## What was actually slow

1. **Monaco's inline diff renders every deleted line eagerly.** Inline mode puts
   deleted lines into view zones, which Monaco does not virtualize: a 3000-line
   diff mounted ~9 700 DOM nodes.
2. **History and commit-panel file rows were keyed by their position in the
   viewport window.** When one row scrolled out, every slot took its neighbour's
   commit or file, so each row boundary re-rendered the whole window (~40 rows).
3. **The shared diff list measured every row.** Rows rendered 19.94 px tall
   against an 18 px estimate, so each newly mounted row triggered a measurement
   and a scroll-offset correction.

## Changes

- Inline diffs in commit details and commit compare render through the
  virtualized `UnifiedDiffBody` (`CommitDiffViewer`). Monaco only loads for
  side-by-side.
- Pooled rows use `useVirtualPoolSlots` (`src/lib/virtual-pool.ts`): a row
  keeps its slot while it stays in the window, and a row entering below the
  staying rows takes over the node of a row that left (later change, FPS loop 3).
- Diff rows are `1.25rem` (leading-4 plus py-0.5), which now matches the
  virtualizer estimate, so row measurement no longer corrects scroll offsets;
  diff line rendering is memoized per row. The commit-details diff shows old/new
  line numbers; the gutter is not sticky, since sticky cost a third of the frame rate.
- Window size changes never remount staying rows. Rows entering above or
  between staying rows get fresh nodes, since reusing one there would make React
  move (re-attach) the staying rows.

Tried and dropped, because they measured worse: virtualizing the changed-files
column (a few hundred plain rows scroll natively faster than a JS-driven window),
and a `translateZ(0)` layer on virtual list content (good with static rows,
worse once rows mount while scrolling).

## Measurements

`scripts/benchmark-scroll.mjs`, production fixture build, 1280 × 860, 400 changed
files, 3000-line diff, 10 000 commits, 40 px per frame. "After" is the median of
three runs; "before" is one run of the same harness on `a541b2c`.

| View | Chromium 4× before → after | WebKit before → after |
| --- | --- | --- |
| Inline diff | 24.0 → 20.3 FPS ¹ | 21.6 → 43.8 FPS |
| Changed-files column | 23.3 → 44.9 FPS | 27.9 → 59.8 FPS |
| History beside details | 8.1 → 13.1 FPS | 17.0 → 18.3 FPS |
| Commit-panel files | 21.5 → 33.1 FPS | 42.4 → 47.9 FPS |
| History | 12.4 → 17.7 FPS | 16.1 → 17.6 FPS |

Unthrottled Chromium now holds 59–60 FPS in every view (before: files column
49.8, history beside details 48.8).

¹ Not comparable one to one: the old figure measured Monaco's own wheel handling,
and the new list also renders a line-number gutter. Unthrottled both hold 60 FPS.

## Still open

- **History in WebKit stays below 20 FPS.** A static clone of the list without
  React scrolls at only ~24 FPS in headless WebKit, so the limit there is
  painting, which headless WebKit does in software. The native app composites
  on the GPU, so this needs a measurement in the real Tauri window before more
  changes.
- **Inline diffs lost Monaco's find (Ctrl+F)**; browser find only sees mounted rows.
- **Side-by-side (Monaco) runs at ~15 FPS in WebKit.** It needs either a
  virtualized side-by-side view of our own or tuning inside Monaco.

## Reproduce

```bash
npx vite build --config vite.ui-test.config.ts
SCROLL_BENCHMARK_PX_PER_FRAME=40 SCROLL_BENCHMARK_VIEWS=inspect-diff,inspect-diff-split,inspect-files,inspect-history node scripts/benchmark-scroll.mjs
SCROLL_BENCHMARK_BROWSER=webkit SCROLL_BENCHMARK_PX_PER_FRAME=40 node scripts/benchmark-scroll.mjs
PROFILE_SCENE=performance-inspect PROFILE_TARGET=diff PROFILE_PX_PER_FRAME=40 node scripts/profile-scroll.mjs
```

`e2e/scroll-performance.spec.ts` pins the causes structurally (no Monaco inline,
bounded diff rows, pooled rows keep their item on a one-row scroll).
