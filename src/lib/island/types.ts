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
