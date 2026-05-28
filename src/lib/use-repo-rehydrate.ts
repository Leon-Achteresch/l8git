import { useEffect } from "react";
import { useRepoStore } from "@/lib/repo-store";

export function useRepoRehydrate() {
  useEffect(() => {
    const run = () => {
      const { paths, activePath, reload } = useRepoStore.getState();
      const target = activePath ?? paths[0];
      if (target) void reload(target);
    };
    if (useRepoStore.persist.hasHydrated()) {
      run();
      return;
    }
    return useRepoStore.persist.onFinishHydration(run);
  }, []);
}
