import { useEffect } from "react";
import { useRepoStore } from "@/lib/repo-store";
import { isPreviewRepo } from "@/lib/preview-repo";
import { isTauri } from "@tauri-apps/api/core";

export function useRepoRehydrate() {
  useEffect(() => {
    const run = () => {
      const { paths, activePath, reload, ensureFavicons } = useRepoStore.getState();
      const target = activePath ?? paths[0];
      if (target && (isTauri() || !isPreviewRepo(target))) void reload(target);
      ensureFavicons();
    };
    if (useRepoStore.persist.hasHydrated()) {
      run();
      return;
    }
    return useRepoStore.persist.onFinishHydration(run);
  }, []);
}
