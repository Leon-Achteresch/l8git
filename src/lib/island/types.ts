/** Shared vocabulary between the island UI and the app that hosts it. */

export type IslandAgentState = {
  /** Agent integration ids with an open tab in this repository. */
  running: string[];
  /** Agent integration ids that are currently producing output. */
  busy: string[];
};

export type IslandRepoSnapshot = {
  path: string;
  label: string;
  branch: string;
  /** Number of entries in `git status`. */
  dirty: number;
  ahead: number;
  behind: number;
} & IslandAgentState;

/** Everything the island renders, flattened so it can travel across windows. */
export type IslandSnapshot = {
  /**
   * Identifies the host that produced this snapshot. A reload restarts the
   * revision counter, so without this the island would reject every snapshot
   * until the new counter caught up with the old one.
   */
  session: string;
  /** Bumped by the host on every publish so stale payloads can be dropped. */
  revision: number;
  repos: IslandRepoSnapshot[];
  activePath: string | null;
  /** Integration ids known to be installed, or null while detection runs. */
  installedAgents: string[] | null;
  mainMinimized: boolean;
  detached: boolean;
};

export const EMPTY_ISLAND_SNAPSHOT: IslandSnapshot = {
  session: "",
  revision: 0,
  repos: [],
  activePath: null,
  installedAgents: null,
  mainMinimized: false,
  detached: false,
};

export type IslandActionArgs = Record<string, string | boolean | number>;

export type IslandRequest = {
  actionId: string;
  /** Defaults to the active repository when omitted. */
  path?: string;
  args?: IslandActionArgs;
};

export type IslandResult = {
  ok: boolean;
  /** Human readable outcome, already translated. */
  message: string;
  /** Structured payload for read-only actions. */
  data?: unknown;
};

/** True when `next` carries state at least as recent as `prev`. */
export function acceptsIslandSnapshot(
  prev: IslandSnapshot,
  next: IslandSnapshot,
): boolean {
  return next.session !== prev.session || next.revision >= prev.revision;
}

/**
 * Structural equality for the island's view of the app. Cheaper than
 * serializing: the island sits on stores that churn for reasons it does not
 * care about (commit pages, PR lists, terminal output), and this decides
 * whether any of that actually reached the island.
 */
export function sameIslandSnapshot(a: IslandSnapshot, b: IslandSnapshot): boolean {
  if (
    a.activePath !== b.activePath ||
    a.mainMinimized !== b.mainMinimized ||
    a.detached !== b.detached ||
    a.repos.length !== b.repos.length
  ) {
    return false;
  }
  if (!sameIds(a.installedAgents, b.installedAgents)) return false;
  for (let i = 0; i < a.repos.length; i++) {
    const x = a.repos[i];
    const y = b.repos[i];
    if (
      x.path !== y.path ||
      x.label !== y.label ||
      x.branch !== y.branch ||
      x.dirty !== y.dirty ||
      x.ahead !== y.ahead ||
      x.behind !== y.behind ||
      !sameIds(x.running, y.running) ||
      !sameIds(x.busy, y.busy)
    ) {
      return false;
    }
  }
  return true;
}

function sameIds(a: string[] | null, b: string[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function findRepo(
  snapshot: IslandSnapshot,
  path: string | null,
): IslandRepoSnapshot | null {
  if (!path) return null;
  return snapshot.repos.find((repo) => repo.path === path) ?? null;
}

export function activeRepoOf(snapshot: IslandSnapshot): IslandRepoSnapshot | null {
  return findRepo(snapshot, snapshot.activePath);
}
