import { useMemo } from "react";
import { create } from "zustand";

import { useRepoStore } from "@/lib/repo-store";
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
  const knownPaths = useRepoStore((state) => state.paths);
  const workspacePaths = useWorkspaceStore(
    (state) =>
      state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.repoPaths ??
      EMPTY_PATHS,
  );
  return useMemo(
    () => [...new Set([...workspacePaths, ...knownPaths])],
    [knownPaths, workspacePaths],
  );
}
