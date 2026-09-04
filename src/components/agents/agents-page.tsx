import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

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

export function AgentsPage({
  initialPath,
  initialView,
}: {
  initialPath?: string;
  initialView?: "overview";
}) {
  const navigate = useNavigate();
  const provider = useAgentProviderStore((state) => state.provider);
  const setProvider = useAgentProviderStore((state) => state.setProvider);
  const activeRepoPath = useRepoStore((state) => state.activePath);
  const retainSurface = useAgentChatStore((state) => state.retainSurface);
  const setVisibleThread = useAgentChatStore((state) => state.setVisibleThread);
  const connect = useAgentChatStore((state) => state.connect);
  const openThread = useAgentChatStore((state) => state.openThread);

  const paths = useAgentRepoPaths();
  const preferredPath =
    (initialPath && paths.includes(initialPath) ? initialPath : null) ??
    (activeRepoPath && paths.includes(activeRepoPath) ? activeRepoPath : null) ??
    paths[0] ??
    "";
  const selectedPath = useAgentRepoStore((state) => state.path);
  const setSelectedPath = useAgentRepoStore((state) => state.setPath);
  const [capabilitySection, setCapabilitySection] = useState<AgentCapabilitySection | null>(null);
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [profileSection, setProfileSection] = useState<ProfileSection | null>(null);
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

  const overview = initialView === "overview";
  const setOverview = useCallback(
    (value: boolean) => {
      void navigate({
        to: "/agents",
        search: { path: initialPath, view: value ? ("overview" as const) : undefined },
        replace: true,
      });
    },
    [initialPath, navigate],
  );
  const refreshOverview = useCallback(() => {
    for (const id of AGENT_PROVIDERS) {
      void chatStoreFor(id).getState().loadThreads(paths).catch(() => {});
    }
  }, [paths]);

  const appliedInitialPath = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!initialPath || appliedInitialPath.current === initialPath) return;
    if (!paths.includes(initialPath)) return;
    appliedInitialPath.current = initialPath;
    setSelectedPath(initialPath);
  }, [initialPath, paths]);

  useEffect(() => {
    if (!paths.length) return;
    if (!paths.includes(selectedPath)) setSelectedPath(preferredPath || paths[0]);
  }, [paths, preferredPath, selectedPath]);

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
    setVisibleThread(activeThreadId);
    return () => setVisibleThread(null);
  }, [activeThreadId, setVisibleThread]);

  useEffect(() => {
    if (!selectedPath || !activeThreadId || !activeThreadIsKnown) return;
    const timer = window.setTimeout(() => void openThread(selectedPath, activeThreadId), 0);
    return () => window.clearTimeout(timer);
  }, [activeThreadId, activeThreadIsKnown, openThread, selectedPath]);

  const handleSectionChange = useCallback(
    (next: ProfileSection) => {
      setProfileSection(next);
      if (next === "threads") {
        if (!overview) setOverview(true);
      } else if (overview) {
        setOverview(false);
      }
      if (next !== "addons" && addonsOpen) setAddonsOpen(false);
      if (next === "addons" && !addonsOpen) setAddonsOpen(true);
      if (next !== "capabilities" && capabilitySection) setCapabilitySection(null);
      if (next === "capabilities" && !capabilitySection) setCapabilitySection("skills");
    },
    [addonsOpen, capabilitySection, overview, setOverview],
  );

  const openChatEntry = useCallback(
    (entry: AgentOverviewEntry) => {
      setSelectedPath(entry.path);
      setProvider(entry.provider);
      if (overview) setOverview(false);
      setAddonsOpen(false);
      setCapabilitySection(null);
      setProfileSection("chat");
      void chatStoreFor(entry.provider)
        .getState()
        .openThread(entry.path, entry.threadId)
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error));
        });
    },
    [overview, setOverview, setProvider, setSelectedPath],
  );

  const openCapabilities = useCallback((sub: AgentCapabilitySection = "skills") => {
    setCapabilitySection(sub);
    setProfileSection("capabilities");
  }, []);

  const openAddons = useCallback(() => {
    setAddonsOpen(true);
    setProfileSection("addons");
  }, []);

  const backToChat = useCallback(() => {
    setAddonsOpen(false);
    setCapabilitySection(null);
    setProfileSection("chat");
  }, []);

  if (paths.length === 0) return <AgentsEmpty />;

  const section: ProfileSection =
    profileSection ??
    (overview ? "threads" : addonsOpen ? "addons" : capabilitySection ? "capabilities" : "chat");

  return (
    <div className="isolate flex h-full min-h-0 bg-[var(--ag-canvas)] text-[var(--ag-text)]">
      <InAppTerminalLayout path={selectedPath}>
        <AgentProfileShell
          path={selectedPath}
          provider={provider}
          section={section}
          onSectionChange={handleSectionChange}
          runningCount={runningCount}
        >
          {section === "threads" ? (
            <div className="isolate flex h-full min-h-0 flex-col bg-[radial-gradient(900px_420px_at_88%_-8%,color-mix(in_oklab,var(--git-branch)_9%,transparent),transparent_62%),var(--ag-stage-bg)] text-[var(--ag-text)]">
              <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted-foreground">…</div>}>
                <AgentsOverview
                  onOpenThread={openChatEntry}
                  onClose={() => handleSectionChange("chat")}
                  onRefresh={refreshOverview}
                />
              </Suspense>
            </div>
          ) : section === "profile" ? (
            <AgentProfileView
              path={selectedPath}
              provider={provider}
              onOpenThread={openChatEntry}
              onSeeAllThreads={() => handleSectionChange("threads")}
              onOpenChat={() => handleSectionChange("chat")}
            />
          ) : section === "capabilities" ? (
            <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted-foreground">Capability Studio…</div>}>
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
            <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted-foreground">Addon Studio…</div>}>
              <AgentAddonStudio
                key={`addons:${selectedPath}`}
                path={selectedPath}
                onBack={backToChat}
              />
            </Suspense>
          ) : (
            <div className="h-full min-h-0 w-full overflow-hidden bg-[radial-gradient(900px_420px_at_88%_-8%,color-mix(in_oklab,var(--git-branch)_9%,transparent),transparent_62%),var(--ag-stage-bg)]">
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
