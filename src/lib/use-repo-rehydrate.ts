import { useEffect } from "react";
import { useRepoStore } from "@/lib/repo-store";
import { isPreviewRepo } from "@/lib/preview-repo";
import { isTauri } from "@tauri-apps/api/core";

export function useRepoRehydrate() {
  useEffect(() => {
    const run = () => {
      const { activePath, setActive, ensureFavicons } = useRepoStore.getState();
      // setActive also brings back the workspace of the repo; no active repo means an empty workspace is shown.
      if (activePath && (isTauri() || !isPreviewRepo(activePath))) setActive(activePath);
      ensureFavicons();
    };
    if (useRepoStore.persist.hasHydrated()) {
      run();
      return;
    }
    return useRepoStore.persist.onFinishHydration(run);
  }, []);
}
