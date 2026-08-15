import { useEffect, useState } from "react";

import { useRepoStore } from "@/lib/repo-store";

export function useDashboardRepoData(path: string | null) {
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const reloadStashes = useRepoStore((s) => s.reloadStashes);
  const reloadWorktrees = useRepoStore((s) => s.reloadWorktrees);
  const reloadBisect = useRepoStore((s) => s.reloadBisect);
  const reloadCherryPickState = useRepoStore((s) => s.reloadCherryPickState);
  const reloadMergeState = useRepoStore((s) => s.reloadMergeState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!path) {
      setReady(false);
      return;
    }
    let cancelled = false;
    setReady(false);
    void Promise.all([
      reloadStatus(path),
      reloadStashes(path),
      reloadWorktrees(path),
      reloadBisect(path),
      reloadCherryPickState(path),
      reloadMergeState(path),
    ]).finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    path,
    reloadStatus,
    reloadStashes,
    reloadWorktrees,
    reloadBisect,
    reloadCherryPickState,
    reloadMergeState,
  ]);

  return ready;
}
