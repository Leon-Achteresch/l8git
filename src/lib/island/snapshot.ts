import {
  agentTabs,
  integrationOf,
  useInstalledAgents,
} from "@/lib/agent-integrations";
import { useIslandWindow } from "@/lib/island/window-store";
import type { IslandSnapshot } from "@/lib/island/types";
import { repoLabel, useRepoStore } from "@/lib/repo-store";
import { useTerminalActivity } from "@/lib/terminal/activity";
import { terminalLeafId } from "@/lib/terminal/leaf-id";
import { useTerminalStore } from "@/lib/terminal-store";

/**
 * The store slices a snapshot is built from. Zustand replaces these
 * immutably, so comparing references tells us whether rebuilding can produce
 * anything new — without touching a single repository.
 */
export type IslandSnapshotInputs = readonly unknown[];

export function islandSnapshotInputs(): IslandSnapshotInputs {
  const repo = useRepoStore.getState();
  return [
    repo.paths,
    repo.activePath,
    repo.repos,
    repo.status,
    repo.upstreamSync,
    useTerminalStore.getState().tabsByPath,
    useTerminalActivity.getState().busy,
    useInstalledAgents.getState().installed,
    useIslandWindow.getState().open,
    useIslandWindow.getState().mainMinimized,
  ];
}

export function sameIslandSnapshotInputs(
  a: IslandSnapshotInputs,
  b: IslandSnapshotInputs,
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

let revision = 0;
// New on every load of this module, so the island can tell a restarted host
// from an out-of-order snapshot.
const session = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Reads the live stores into the flat shape the island renders. */
export function buildIslandSnapshot(): IslandSnapshot {
  const repoState = useRepoStore.getState();
  const tabsByPath = useTerminalStore.getState().tabsByPath;
  const busyLeaves = useTerminalActivity.getState().busy;
  const windowState = useIslandWindow.getState();
  const installed = useInstalledAgents.getState().installed;

  revision += 1;

  return {
    session,
    revision,
    activePath: repoState.activePath,
    installedAgents: installed ? [...installed] : null,
    mainMinimized: windowState.mainMinimized,
    detached: windowState.open,
    repos: repoState.paths.map((path) => {
      const tabs = agentTabs(tabsByPath[path] ?? []);
      const sync = repoState.upstreamSync[path];
      return {
        path,
        label: repoLabel(path),
        branch: repoState.repos[path]?.branch ?? "",
        dirty: repoState.status[path]?.length ?? 0,
        ahead: sync?.ahead ?? 0,
        behind: sync?.behind ?? 0,
        running: [...new Set(tabs.map((tab) => integrationOf(tab)!.id))],
        busy: [
          ...new Set(
            tabs
              .filter((tab) => busyLeaves[terminalLeafId(path, tab.id)])
              .map((tab) => integrationOf(tab)!.id),
          ),
        ],
      };
    }),
  };
}
