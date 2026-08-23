import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";

import { chatStoreFor } from "@/lib/agents/active-chat-store";
import { useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import type { AgentOverviewEntry } from "@/lib/agents/overview";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore, type SidebarTab } from "@/lib/ui-store";

export function useInboxTargets() {
  const navigate = useNavigate();
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const setSelectedAgentPath = useAgentRepoStore((s) => s.setPath);
  const setAgentProvider = useAgentProviderStore((s) => s.setProvider);

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

  const openAgentThread = useCallback(
    (entry: AgentOverviewEntry) => {
      setAgentProvider(entry.provider);
      setSelectedAgentPath(entry.path);
      void chatStoreFor(entry.provider)
        .getState()
        .openThread(entry.path, entry.threadId)
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error));
        });
      void navigate({ to: "/agents", search: { path: entry.path, view: undefined } });
    },
    [navigate, setAgentProvider, setSelectedAgentPath],
  );

  return { openPr, openCi, openAgentThread };
}
