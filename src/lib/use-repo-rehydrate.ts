import { useEffect } from "react";
import { useRepoStore } from "@/lib/repo-store";

export function useRepoRehydrate() {
  useEffect(() => {
    const run = () => {
      const { paths, activePath, reload, ensureFavicons } = useRepoStore.getState();
      const target = activePath ?? paths[0];
      if (target) void reload(target);
      ensureFavicons();
    };
    if (useRepoStore.persist.hasHydrated()) {
      run();
      return;
    }
    return useRepoStore.persist.onFinishHydration(run);
  }, []);
}
