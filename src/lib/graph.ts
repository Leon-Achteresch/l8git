import type { Branch, Commit } from './repo-store';

// 16 visually distinct colors that work on both light and dark backgrounds.
// Ordered so sequential assignment (index 0, 1, 2 …) gives the most
// "natural" mapping: main → blue, dev → green, and so on.
const PALETTE = [
  '#3b82f6', // blue-500    → main / master / trunk
  '#22c55e', // green-500   → dev / develop
  '#f97316', // orange-500
  '#a855f7', // purple-500
  '#ef4444', // red-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#65a30d', // lime-600
  '#f59e0b', // amber-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#ca8a04', // yellow-600
  '#8b5cf6', // violet-500
  '#10b981', // emerald-500
  '#f43f5e', // rose-500
  '#0ea5e9', // sky-500
];

// Default / long-lived branch names – in left-to-right priority order for
// lane pre-seeding. The first matching branch in a repo gets lane 0.
export const DEFAULT_BRANCH_PRIORITY = [
  'main',
  'master',
  'trunk',
  'dev',
  'develop',
  'development',
  'staging',
  'production',
  'release',
] as const;

function fnv1a32(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// ── Normalise git object IDs ──────────────────────────────────────────────
export function normalizeGitOid(oid: string | null | undefined): string {
  return (oid ?? '').trim().toLowerCase();
}

// ── Sidebar / badge colour (deterministic, name-based) ───────────────────
// Used outside the graph build (branch sidebar, tag rows, commit badges).
// Still deterministic so the same branch name always shows the same colour.
export function laneColor(origin: string | null | undefined): string {
  return origin ? PALETTE[fnv1a32(origin) % PALETTE.length] : '#888';
}

// ── GraphRow ─────────────────────────────────────────────────────────────
export type GraphRow = {
  commit: Commit;
  lane: number;
  color: string;
  lanesBefore: (string | null)[];
  lanesAfter: (string | null)[];
  mergedLanes: number[];
  laneOriginsBefore: (string | null)[];
  laneOriginsAfter: (string | null)[];
};

// ── buildGraph ───────────────────────────────────────────────────────────
//
// Builds a swimlane graph from a chronologically-ordered (newest-first)
// commit list.
//
// When `branches` is supplied the algorithm:
//   1. Pre-seeds lanes 0, 1, … with default-branch tips (main → lane 0,
//      master/trunk → lane 1 if a second one exists, etc.).  This ensures
//      long-lived branches always appear on the left.
//   2. Uses a *greedy* palette assignment so no two simultaneously-active
//      lanes ever share the same colour.
//
// Returns the row array, the peak lane count, and an `originColors` Map
// (origin-key → hex colour) that callers should use for rendering so that
// every visual element uses the same colour lookup.
export function buildGraph(
  commits: Commit[],
  branches?: Branch[],
): {
  rows: GraphRow[];
  maxLanes: number;
  originColors: Map<string, string>;
} {
  const lanes: (string | null)[] = [];
  const origins: (string | null)[] = [];
  const rows: GraphRow[] = [];
  let maxLanes = 0;

  // origin-key → palette index (assigned greedily; no active-lane collision)
  const originPaletteIdx = new Map<string, number>();

  /**
   * Assigns a palette colour to `originKey`, choosing the first index not
   * already used by any *currently active* (non-null) lane.  Stores the
   * assignment so the same key always gets the same colour.
   */
  function assignColor(originKey: string): string {
    if (originPaletteIdx.has(originKey)) {
      return PALETTE[originPaletteIdx.get(originKey)!];
    }
    // Collect indices currently in use by non-null lanes
    const usedIdx = new Set<number>();
    for (const o of origins) {
      if (o && originPaletteIdx.has(o)) {
        usedIdx.add(originPaletteIdx.get(o)!);
      }
    }
    // First free palette index
    let idx = 0;
    while (idx < PALETTE.length && usedIdx.has(idx)) idx++;
    if (idx >= PALETTE.length) {
      // All 16 colours are active – wrap around using total assignment count
      idx = originPaletteIdx.size % PALETTE.length;
    }
    originPaletteIdx.set(originKey, idx);
    return PALETTE[idx];
  }

  // ── Pre-seed default branches (left-to-right priority) ─────────────────
  if (branches && branches.length > 0) {
    // Build a map rawHash → rawHash so we can look up the exact string used
    // inside the commits array (avoids case/whitespace mismatches).
    const rawHashByNorm = new Map(
      commits.map((c) => [normalizeGitOid(c.hash), c.hash]),
    );

    const defaultBranches = branches
      .filter((b) => {
        if (b.is_remote || !b.tip) return false;
        const name = b.name.toLowerCase();
        return DEFAULT_BRANCH_PRIORITY.some((p) => p === name);
      })
      .sort((a, b) => {
        const ai = DEFAULT_BRANCH_PRIORITY.indexOf(
          a.name.toLowerCase() as (typeof DEFAULT_BRANCH_PRIORITY)[number],
        );
        const bi = DEFAULT_BRANCH_PRIORITY.indexOf(
          b.name.toLowerCase() as (typeof DEFAULT_BRANCH_PRIORITY)[number],
        );
        return ai - bi;
      });

    for (const branch of defaultBranches) {
      const normTip = normalizeGitOid(branch.tip!);
      const rawTip = rawHashByNorm.get(normTip);
      if (!rawTip) continue; // tip not yet loaded into the commit window
      if (lanes.some((l) => l === rawTip)) continue; // already seeded
      lanes.push(rawTip);
      origins.push(branch.name); // use branch name as origin key
      assignColor(branch.name); // reserve a palette slot now (in priority order)
    }
  }

  const findEmpty = () => lanes.findIndex((h) => h === null);

  // ── Main loop ───────────────────────────────────────────────────────────
  for (const c of commits) {
    const lanesBefore = [...lanes];
    const laneOriginsBefore = [...origins];

    const matching: number[] = [];
    lanes.forEach((h, i) => {
      if (h === c.hash) matching.push(i);
    });

    let myLane: number;
    let myOrigin: string;
    if (matching.length > 0) {
      myLane = matching[0];
      myOrigin = origins[myLane] ?? c.hash;
    } else {
      const empty = findEmpty();
      if (empty === -1) {
        myLane = lanes.length;
        lanes.push(null);
        origins.push(null);
      } else {
        myLane = empty;
      }
      myOrigin = c.hash;
    }

    // Collapse duplicate-matching lanes
    for (const i of matching) {
      if (i !== myLane) {
        lanes[i] = null;
        origins[i] = null;
      }
    }

    const parents = c.parents;
    if (parents.length > 0) {
      lanes[myLane] = parents[0];
      origins[myLane] = myOrigin;
    } else {
      lanes[myLane] = null;
      origins[myLane] = null;
    }

    // Open new lanes for additional parents (merge commits)
    for (let p = 1; p < parents.length; p++) {
      const parent = parents[p];
      const existing = lanes.findIndex((h) => h === parent);
      if (existing !== -1) continue;
      let idx = findEmpty();
      if (idx === -1) {
        idx = lanes.length;
        lanes.push(parent);
        origins.push(parent);
      } else {
        lanes[idx] = parent;
        origins[idx] = parent;
      }
    }

    // Trim trailing nulls
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
      origins.pop();
    }

    const lanesAfter = [...lanes];
    const laneOriginsAfter = [...origins];

    maxLanes = Math.max(maxLanes, lanesBefore.length, lanesAfter.length);

    rows.push({
      commit: c,
      lane: myLane,
      color: assignColor(myOrigin),
      lanesBefore,
      lanesAfter,
      mergedLanes: matching.filter((i) => i !== myLane),
      laneOriginsBefore,
      laneOriginsAfter,
    });
  }

  // Build a plain Map<origin, colour> for the renderers
  const originColors = new Map<string, string>(
    Array.from(originPaletteIdx.entries()).map(([key, idx]) => [
      key,
      PALETTE[idx],
    ]),
  );

  return { rows, maxLanes, originColors };
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function compareBranchesDisplay(a: Branch, b: Branch): number {
  if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
  if (a.is_remote !== b.is_remote) return a.is_remote ? 1 : -1;
  return a.name.localeCompare(b.name);
}

export function computeReachableHashes(
  commits: Commit[],
  startHashes: string[],
): Set<string> {
  const commitMap = new Map(commits.map((c) => [normalizeGitOid(c.hash), c]));
  const visited = new Set<string>();
  const queue = startHashes.map((h) => normalizeGitOid(h));
  while (queue.length > 0) {
    const hash = queue.pop()!;
    if (visited.has(hash)) continue;
    visited.add(hash);
    const commit = commitMap.get(hash);
    if (commit) {
      for (const parent of commit.parents) {
        const p = normalizeGitOid(parent);
        if (!visited.has(p)) queue.push(p);
      }
    }
  }
  return visited;
}

export function branchLaneColorAtTip(
  branches: Branch[],
  oid: string | null | undefined,
): string | null {
  const t = normalizeGitOid(oid);
  if (!t) return null;
  const matches = branches.filter((b) => normalizeGitOid(b.tip) === t);
  if (matches.length === 0) return null;
  matches.sort(compareBranchesDisplay);
  return laneColor(matches[0].name);
}
