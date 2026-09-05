import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { AgentChatPane } from "@/components/agents/chat/agent-chat-pane";
import { AgentsEmpty } from "@/components/agents/agents-empty";
import {
  AgentProfileShell,
  type ProfileSection,
} from "@/components/agents/profile/AgentProfileShell";
import { AgentProfileView } from "@/components/agents/profile/AgentProfileView";
import { InAppTerminalLayout } from "@/components/repo/layout/in-app-terminal-layout";
import { useAgentChatStore, chatStoreFor } from "@/lib/agents/active-chat-store";
import { useAgentRepoPaths, useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import type { AgentOverviewEntry } from "@/lib/agents/overview";
import { useActiveAgentCount } from "@/lib/agents/use-agent-overview";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import { agentProviderMeta, providerSupportsCapabilityCenter } from "@/lib/agents/provider-meta";
import { refreshProviderThreads } from "@/lib/agents/thread-refresh";
import { armTurnAttention } from "@/lib/agents/turn-attention";
import { armUsageLedger } from "@/lib/agents/usage-ledger";
import type { AgentThreadSummary } from "@/lib/agents/types";
import type { AgentCapabilitySection } from "@/lib/agents/capability-types";
import { jiraThreadKey, useJiraStore } from "@/lib/jira/jira-store";
import { syncJiraExternalRegistration } from "@/lib/jira/jira-sync";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalStore } from "@/lib/terminal-store";

const EMPTY_THREADS: AgentThreadSummary[] = [];
const AGENT_PROVIDERS = ["codex", "claude", "cursor", "opencode"] as const;
const AgentsOverview = lazy(() => import("@/components/agents/overview/agents-overview").then(
  (module) => ({ default: module.AgentsOverview }),
));
const AgentCapabilityCenter = lazy(() => import("@/components/agents/capabilities/agent-capability-center").then(
  (module) => ({ default: module.AgentCapabilityCenter }),
));
const ClaudeCapabilityCenter = lazy(() => import("@/components/agents/capabilities/claude-capability-center").then(
  (module) => ({ default: module.ClaudeCapabilityCenter }),
));
const AgentAddonStudio = lazy(() => import("@/components/agents/capabilities/agent-addon-studio").then(
  (module) => ({ default: module.AgentAddonStudio }),
));

export type AgentsView = "overview" | Exclude<ProfileSection, "threads">;

function AgentsLoading() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-label={t("agentChat.loadingConversations")} className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-6 motion-safe:animate-pulse">
      <div className="h-7 w-40 rounded-md bg-[var(--ag-selected)]" />
      <div className="h-10 rounded-lg bg-[var(--ag-selected)]" />
      {[0, 1, 2, 3].map((index) => <div key={index} className="h-20 rounded-xl bg-[var(--ag-surface)]" />)}
    </div>
  );
}

export function AgentsPage({
  initialPath,
  initialView,
}: {
  initialPath?: string;
  initialView?: AgentsView;
}) {
  const navigate = useNavigate();
  const provider = useAgentProviderStore((state) => state.provider);
  const setProvider = useAgentProviderStore((state) => state.setProvider);
  const activeRepoPath = useRepoStore((state) => state.activePath);
  const retainSurface = useAgentChatStore((state) => state.retainSurface);
  const setVisibleThread = useAgentChatStore((state) => state.setVisibleThread);
  const connect = useAgentChatStore((state) => state.connect);
  const openThread = useAgentChatStore((state) => state.openThread);
  const createThread = useAgentChatStore((state) => state.createThread);

  const paths = useAgentRepoPaths();
  const preferredPath =
    (initialPath && paths.includes(initialPath) ? initialPath : null) ??
    (activeRepoPath && paths.includes(activeRepoPath) ? activeRepoPath : null) ??
    paths[0] ??
    "";
  const selectedPath = useAgentRepoStore((state) => state.path);
  const setSelectedPath = useAgentRepoStore((state) => state.setPath);
  const [capabilitySection, setCapabilitySection] = useState<AgentCapabilitySection | null>(null);
  const newSessionRef = useRef(false);
  const runningCount = useActiveAgentCount();
  const jiraEnabled = useJiraStore((state) => state.enabled);
  const jiraRegisterExternal = useJiraStore((state) => state.registerExternal);
  const setActiveJiraThread = useJiraStore((state) => state.setActiveThread);
  const terminalVisible = useTerminalStore((state) => !!state.visibleByPath[selectedPath]);
  const toggleTerminal = useTerminalStore((state) => state.toggleVisible);
  const activeThreadId = useAgentChatStore(
    (state) => state.activeThreadByPath[selectedPath] ?? null,
  );
  const activeThreadIsKnown = useAgentChatStore((state) => {
    const id = state.activeThreadByPath[selectedPath] ?? null;
    return id !== null && (state.threadsByPath[selectedPath] ?? EMPTY_THREADS).some(
      (thread) => thread.id === id,
    );
  });
  const handleToggleTerminal = useCallback(() => {
    toggleTerminal(selectedPath);
  }, [selectedPath, toggleTerminal]);

  const requestedSection: ProfileSection = initialView === "overview" ? "threads" : initialView ?? "chat";
  const section = requestedSection === "capabilities" && !providerSupportsCapabilityCenter(provider)
    ? "chat" : requestedSection;
  const handleSectionChange = useCallback(
    (next: ProfileSection, nextPath = selectedPath) => {
      void navigate({
        to: "/agents",
        search: {
          path: nextPath || undefined,
          view: next === "threads" ? "overview" : next,
        },
        replace: true,
      });
    },
    [navigate, selectedPath],
  );
  const refreshOverview = useCallback(async () => {
    const results = await Promise.allSettled(AGENT_PROVIDERS.map((id) =>
      chatStoreFor(id).getState().loadThreads(paths),
    ));
    const failures = results.flatMap((result, index) => result.status === "rejected"
      ? [`${agentProviderMeta(AGENT_PROVIDERS[index]).label}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
      : []);
    if (failures.length) {
      throw new Error(failures.join("\n"));
    }
  }, [paths]);

  const appliedInitialPath = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialPath || appliedInitialPath.current === initialPath) return;
    if (!paths.includes(initialPath)) return;
    appliedInitialPath.current = initialPath;
    setSelectedPath(initialPath);
  }, [initialPath, paths, setSelectedPath]);

  useEffect(() => {
    if (!paths.length) return;
    if (!paths.includes(selectedPath)) setSelectedPath(preferredPath || paths[0]);
  }, [paths, preferredPath, selectedPath, setSelectedPath]);

  useEffect(() => {
    return retainSurface();
  }, [retainSurface]);

  useEffect(() => armTurnAttention(), []);
  useEffect(() => armUsageLedger(), []);

  useEffect(() => {
    if (!selectedPath) return;
    void syncJiraExternalRegistration(selectedPath);
  }, [jiraEnabled, jiraRegisterExternal, selectedPath]);

  useEffect(() => {
    if (!selectedPath) return;
    setActiveJiraThread(
      selectedPath,
      activeThreadId ? jiraThreadKey(provider, activeThreadId) : null,
    );
  }, [activeThreadId, provider, selectedPath, setActiveJiraThread]);

  useEffect(() => {
    if (!paths.length) return;
    refreshProviderThreads(provider, paths);
    void connect().catch(() => {});
    const timer = window.setTimeout(() => {
      for (const id of ["codex", "claude", "cursor", "opencode"] as const) {
        if (id === provider) continue;
        refreshProviderThreads(id, paths);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [connect, paths, provider]);

  useEffect(() => {
    setVisibleThread(section === "chat" ? activeThreadId : null);
    return () => setVisibleThread(null);
  }, [activeThreadId, section, setVisibleThread]);

  useEffect(() => {
    if (section !== "chat" || !selectedPath || !activeThreadId || !activeThreadIsKnown) return;
    const timer = window.setTimeout(() => {
      void openThread(selectedPath, activeThreadId).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : String(error));
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeThreadId, activeThreadIsKnown, openThread, section, selectedPath]);

  const openChatEntry = useCallback(
    (entry: AgentOverviewEntry) => {
      setSelectedPath(entry.path);
      setProvider(entry.provider);
      setCapabilitySection(null);
      handleSectionChange("chat", entry.path);
      void chatStoreFor(entry.provider)
        .getState()
        .openThread(entry.path, entry.threadId)
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error));
        });
    },
    [handleSectionChange, setProvider, setSelectedPath],
  );

  const openCapabilities = useCallback((sub: AgentCapabilitySection = "skills") => {
    setCapabilitySection(sub);
    handleSectionChange("capabilities");
  }, [handleSectionChange]);

  const openAddons = useCallback(() => {
    handleSectionChange("addons");
  }, [handleSectionChange]);

  const backToChat = useCallback(() => {
    setCapabilitySection(null);
    handleSectionChange("chat");
  }, [handleSectionChange]);

  const handleNewSession = useCallback(async () => {
    if (!selectedPath || newSessionRef.current) return;
    newSessionRef.current = true;
    try {
      await createThread(selectedPath);
      setCapabilitySection(null);
      handleSectionChange("chat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      newSessionRef.current = false;
    }
  }, [createThread, handleSectionChange, selectedPath]);

  if (paths.length === 0) return <AgentsEmpty />;

  return (
    <div className="isolate flex h-full min-h-0 bg-[var(--ag-canvas)] text-[var(--ag-text)]">
      <InAppTerminalLayout path={selectedPath}>
        <AgentProfileShell
          path={selectedPath}
          provider={provider}
          section={section}
          onSectionChange={handleSectionChange}
          runningCount={runningCount}
          onOpenSettings={() => void navigate({ to: "/settings" })}
        >
          {section === "threads" ? (
            <div className="isolate flex h-full min-h-0 flex-col bg-[var(--ag-canvas)] text-[var(--ag-text)]">
              <Suspense fallback={<AgentsLoading />}>
                <AgentsOverview
                  onOpenThread={openChatEntry}
                  onRefresh={refreshOverview}
                  onNewSession={handleNewSession}
                />
              </Suspense>
            </div>
          ) : section === "profile" ? (
            <AgentProfileView
              path={selectedPath}
              provider={provider}
              onOpenThread={openChatEntry}
              onSeeAllThreads={() => handleSectionChange("threads")}
              onOpenChat={() => void handleNewSession()}
            />
          ) : section === "capabilities" ? (
            <Suspense fallback={<AgentsLoading />}>
              {provider === "claude" || provider === "opencode" ? (
                <ClaudeCapabilityCenter
                  key={`${provider}-capabilities:${selectedPath}`}
                  path={selectedPath}
                  provider={provider}
                  initialSection={capabilitySection ?? "skills"}
                  onBack={backToChat}
                />
              ) : (
                <AgentCapabilityCenter
                  key={`codex-capabilities:${selectedPath}`}
                  path={selectedPath}
                  initialSection={capabilitySection ?? "skills"}
                  onBack={backToChat}
                />
              )}
            </Suspense>
          ) : section === "addons" ? (
            <Suspense fallback={<AgentsLoading />}>
              <AgentAddonStudio
                key={`addons:${selectedPath}`}
                path={selectedPath}
                onBack={backToChat}
              />
            </Suspense>
          ) : (
            <div className="h-full min-h-0 w-full overflow-hidden bg-[var(--ag-stage-bg)]">
              <AgentChatPane
                key={`${selectedPath}:${activeThreadId ?? "new"}`}
                path={selectedPath}
                threadId={activeThreadId}
                terminalVisible={terminalVisible}
                onToggleTerminal={handleToggleTerminal}
                onOpenCapabilities={openCapabilities}
                onOpenAddons={openAddons}
                onOpenThreadsOverview={() => handleSectionChange("threads")}
              />
            </div>
          )}
        </AgentProfileShell>
      </InAppTerminalLayout>
    </div>
  );
}
