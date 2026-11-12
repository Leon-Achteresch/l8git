import { useEffect, useRef } from "react";
import { useRepoStore } from "@/lib/repo-store";
import { isPreviewRepo } from "@/lib/preview-repo";
import { isTauri } from "@tauri-apps/api/core";

let preparedPath: string | null = null;

/** Start native reads alongside the first React render, not in its passive effects. */
export function prepareStartupRepository() {
  const { activePath, setActive, reloadLocalStatus } = useRepoStore.getState();
  if (!activePath || preparedPath === activePath) return;
  preparedPath = activePath;
  setActive(activePath);
  void reloadLocalStatus(activePath);
}

export function useRepoRehydrate() {
  const preparedAtMount = useRef(preparedPath);
  useEffect(() => {
    const run = () => {
      const { activePath, setActive, ensureFavicons } = useRepoStore.getState();
      preparedPath = null;
      // setActive also brings back the workspace of the repo; no active repo means an empty workspace is shown.
      // The ref also covers StrictMode's effect probe; a later route mount refreshes normally.
      if (activePath && activePath !== preparedAtMount.current && (isTauri() || !isPreviewRepo(activePath))) setActive(activePath);
      ensureFavicons();
    };
    if (useRepoStore.persist.hasHydrated()) {
      run();
      return;
    }
    return useRepoStore.persist.onFinishHydration(run);
  }, []);
}
