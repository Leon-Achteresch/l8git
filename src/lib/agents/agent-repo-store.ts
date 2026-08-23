import { useMemo, useSyncExternalStore } from "react";
import { create } from "zustand";

import { useAgentWorktreeStore } from "@/lib/agents/agent-worktrees";
import { knownRepoPaths, subscribeKnownRepoPaths } from "@/lib/agents/known-repo-paths";
import { useWorkspaceStore } from "@/lib/workspace-store";

const EMPTY_PATHS: string[] = [];

export const useAgentRepoStore = create<{
  path: string;
  setPath: (path: string) => void;
}>((set) => ({
  path: "",
  setPath: (path) => set({ path }),
}));

export function useAgentRepoPaths() {
  const knownPaths = useSyncExternalStore(subscribeKnownRepoPaths, knownRepoPaths, knownRepoPaths);
  const workspacePaths = useWorkspaceStore(
    (state) =>
      state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.repoPaths ??
      EMPTY_PATHS,
  );
  const worktrees = useAgentWorktreeStore((state) => state.worktrees);
  return useMemo(
    () => [...new Set([...workspacePaths, ...knownPaths, ...Object.keys(worktrees)])],
    [knownPaths, workspacePaths, worktrees],
  );
}
