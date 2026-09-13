import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { useRepoStore } from "@/lib/repo-store";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";

export function useInboxTargets() {
  const navigate = useNavigate();
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);

  const openRepoTab = useCallback(
    (path: string, tab: SidebarTab) => {
      const { paths, setActive, addRepo } = useRepoStore.getState();
      setSidebarTab(tab);
      if (paths.includes(path)) setActive(path);
      else void addRepo(path);
      void navigate({ to: "/" });
    },
    [navigate, setSidebarTab],
  );

  const openPr = useCallback(
    (path: string, number?: number) => {
      if (number != null) useUiStore.getState().requestPrFocus(path, number);
      openRepoTab(path, "pr");
    },
    [openRepoTab],
  );
  const openCi = useCallback((path: string) => openRepoTab(path, "ci"), [openRepoTab]);

  return { openPr, openCi };
}
