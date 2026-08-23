import { useMemo } from "react";

import { useRepoStore } from "@/lib/repo-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

const EMPTY_PATHS: string[] = [];

export function useInboxPaths(): string[] {
  const workspacePaths = useWorkspaceStore(
    (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.repoPaths ?? EMPTY_PATHS,
  );
  const knownPaths = useRepoStore((s) => s.paths);
  return useMemo(() => {
    const set = new Set<string>();
    for (const p of workspacePaths) set.add(p);
    for (const p of knownPaths) set.add(p);
    return Array.from(set);
  }, [workspacePaths, knownPaths]);
}
