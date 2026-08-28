import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, m } from "motion/react";
import { toast } from "sonner";

import "@/components/agents/agents.css";
import { AgentChatPane } from "@/components/agents/chat/agent-chat-pane";
import { AgentChatSidebar } from "@/components/agents/chat/agent-chat-sidebar";
import { AgentsEmpty } from "@/components/agents/agents-empty";
import { InAppTerminalLayout } from "@/components/repo/layout/in-app-terminal-layout";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useAgentChatStore, chatStoreFor } from "@/lib/agents/active-chat-store";
import { useAgentRepoPaths, useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import type { AgentOverviewEntry } from "@/lib/agents/overview";
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
import { SPRING_LAYOUT } from "@/lib/motion/ease";

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
  // Addons gelten für alle vier CLIs und liegen deshalb neben dem
  // providerspezifischen Capability-Center, nicht darin.
  const [addonsOpen, setAddonsOpen] = useState(false);
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
  const openOverviewEntry = useCallback(
    (entry: AgentOverviewEntry) => {
      setSelectedPath(entry.path);
      setProvider(entry.provider);
      setOverview(false);
      void chatStoreFor(entry.provider)
        .getState()
        .openThread(entry.path, entry.threadId)
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : String(error));
        });
    },
    [setOverview, setProvider, setSelectedPath],
  );

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

  // Codex and Cursor learn about the Jira MCP server through their own config,
  // so the registration has to follow the selected repository and the switches.
  useEffect(() => {
    if (!selectedPath) return;
    void syncJiraExternalRegistration(selectedPath);
  }, [jiraEnabled, jiraRegisterExternal, selectedPath]);

  // Tickets hang off a conversation, but the MCP server Codex and Cursor spawn
  // only knows the repository. Recording which chat is open is how it resolves
  // one to the other.
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
    // Restoring an explicitly selected conversation is useful. Automatically
    // opening the newest history entry is not: it parses a potentially huge
    // transcript before the user has selected it.
    if (!selectedPath || !activeThreadId || !activeThreadIsKnown) return;
    const timer = window.setTimeout(() => void openThread(selectedPath, activeThreadId), 0);
    return () => window.clearTimeout(timer);
  }, [activeThreadId, activeThreadIsKnown, openThread, selectedPath]);

  if (paths.length === 0) return <AgentsEmpty />;

  if (overview) {
    return (
      <div className="ag-stage flex h-full min-h-0 flex-col">
        <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted-foreground">…</div>}>
          <AgentsOverview
            onOpenThread={openOverviewEntry}
            onClose={() => setOverview(false)}
            onRefresh={refreshOverview}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <InAppTerminalLayout path={selectedPath}>
        <ResizablePanelGroup orientation="horizontal" id="agents-chat-split">
          <ResizablePanel
            id="agents-chat-sidebar"
            defaultSize="23%"
            minSize="17%"
            maxSize="32%"
            className="ag-rail min-w-[264px] overflow-hidden"
          >
            <AgentChatSidebar selectedPath={selectedPath} onOpenOverview={() => setOverview(true)} />
          </ResizablePanel>
          <ResizableHandle className="w-px bg-[var(--ag-line)] transition-colors hover:bg-[var(--ag-line-strong)]" />
          <ResizablePanel
            id="agents-chat-main"
            defaultSize="77%"
            minSize="45%"
            className="ag-stage min-w-0 overflow-hidden"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <m.div
                key={addonsOpen ? "addons" : capabilitySection ? `capabilities:${provider}` : "chat"}
                layout
                layoutId="agents-workspace-surface"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={SPRING_LAYOUT}
                className="h-full min-h-0"
              >
                {addonsOpen ? (
                  <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted-foreground">Addon Studio…</div>}>
                    <AgentAddonStudio
                      key={`addons:${selectedPath}`}
                      path={selectedPath}
                      onBack={() => setAddonsOpen(false)}
                    />
                  </Suspense>
                ) : capabilitySection ? (
                  <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted-foreground">Capability Studio…</div>}>
                    {provider === "claude" || provider === "opencode" ? (
                      <ClaudeCapabilityCenter
                        key={`${provider}-capabilities:${selectedPath}`}
                        path={selectedPath}
                        provider={provider}
                        initialSection={capabilitySection}
                        onBack={() => setCapabilitySection(null)}
                      />
                    ) : (
                      <AgentCapabilityCenter
                        key={`codex-capabilities:${selectedPath}`}
                        path={selectedPath}
                        initialSection={capabilitySection}
                        onBack={() => setCapabilitySection(null)}
                      />
                    )}
                  </Suspense>
                ) : (
                  <AgentChatPane
                    key={`${selectedPath}:${activeThreadId ?? "new"}`}
                    path={selectedPath}
                    threadId={activeThreadId}
                    terminalVisible={terminalVisible}
                    onToggleTerminal={handleToggleTerminal}
                    onOpenCapabilities={(section = "skills") => setCapabilitySection(section)}
                    onOpenAddons={() => setAddonsOpen(true)}
                  />
                )}
              </m.div>
            </AnimatePresence>
          </ResizablePanel>
        </ResizablePanelGroup>
      </InAppTerminalLayout>
    </div>
  );
}
