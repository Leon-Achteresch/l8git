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

let revision = 0;

/** Reads the live stores into the flat shape the island renders. */
export function buildIslandSnapshot(): IslandSnapshot {
  const repoState = useRepoStore.getState();
  const tabsByPath = useTerminalStore.getState().tabsByPath;
  const busyLeaves = useTerminalActivity.getState().busy;
  const windowState = useIslandWindow.getState();
  const installed = useInstalledAgents.getState().installed;

  revision += 1;

  return {
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
