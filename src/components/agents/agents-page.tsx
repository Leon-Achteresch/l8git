import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";

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
import { chatStoreFor, useAgentChatStore } from "@/lib/agents/active-chat-store";
import { useAgentRepoPaths, useAgentRepoStore } from "@/lib/agents/agent-repo-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type { AgentThreadSummary } from "@/lib/agents/types";
import type { AgentCapabilitySection } from "@/lib/agents/capability-types";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalStore } from "@/lib/terminal-store";
import { SPRING_LAYOUT } from "@/lib/motion/ease";

const EMPTY_THREADS: AgentThreadSummary[] = [];
const AgentCapabilityCenter = lazy(() => import("@/components/agents/capabilities/agent-capability-center").then(
  (module) => ({ default: module.AgentCapabilityCenter }),
));
const ClaudeCapabilityCenter = lazy(() => import("@/components/agents/capabilities/claude-capability-center").then(
  (module) => ({ default: module.ClaudeCapabilityCenter }),
));

export function AgentsPage({ initialPath }: { initialPath?: string }) {
  const provider = useAgentProviderStore((state) => state.provider);
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

  useEffect(() => {
    if (!paths.length) return;
    void chatStoreFor(provider).getState().loadThreads(paths).catch(() => {});
    void connect().catch(() => {});
    const timer = window.setTimeout(() => {
      for (const id of ["codex", "claude", "cursor", "opencode"] as const) {
        if (id === provider) continue;
        void chatStoreFor(id).getState().loadThreads(paths).catch(() => {});
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
            <AgentChatSidebar selectedPath={selectedPath} />
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
                key={capabilitySection ? `capabilities:${provider}` : "chat"}
                layout
                layoutId="agents-workspace-surface"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={SPRING_LAYOUT}
                className="h-full min-h-0"
              >
                {capabilitySection ? (
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
