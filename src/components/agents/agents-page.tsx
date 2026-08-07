import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
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
import { useAgentChatStore } from "@/lib/agents/active-chat-store";
import { useAgentProviderStore } from "@/lib/agents/provider-store";
import type { AgentThreadSummary } from "@/lib/agents/types";
import type { AgentCapabilitySection } from "@/lib/agents/capability-types";
import { useRepoStore } from "@/lib/repo-store";
import { useTerminalStore } from "@/lib/terminal-store";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { SPRING_LAYOUT } from "@/lib/motion/ease";

const EMPTY_PATHS: string[] = [];
const EMPTY_THREADS: AgentThreadSummary[] = [];
const AgentCapabilityCenter = lazy(() => import("@/components/agents/capabilities/agent-capability-center").then(
  (module) => ({ default: module.AgentCapabilityCenter }),
));
const ClaudeCapabilityCenter = lazy(() => import("@/components/agents/capabilities/claude-capability-center").then(
  (module) => ({ default: module.ClaudeCapabilityCenter }),
));

export function AgentsPage({ initialPath }: { initialPath?: string }) {
  const provider = useAgentProviderStore((state) => state.provider);
  const knownPaths = useRepoStore((state) => state.paths);
  const activeRepoPath = useRepoStore((state) => state.activePath);
  const workspacePaths = useWorkspaceStore(
    (state) =>
      state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId)?.repoPaths ?? EMPTY_PATHS,
  );
  const retainSurface = useAgentChatStore((state) => state.retainSurface);
  const setVisibleThread = useAgentChatStore((state) => state.setVisibleThread);
  const connect = useAgentChatStore((state) => state.connect);
  const loadThreads = useAgentChatStore((state) => state.loadThreads);
  const openThread = useAgentChatStore((state) => state.openThread);

  const paths = useMemo(
    () => [...new Set([...workspacePaths, ...knownPaths])],
    [knownPaths, workspacePaths],
  );
  const preferredPath =
    (initialPath && paths.includes(initialPath) ? initialPath : null) ??
    (activeRepoPath && paths.includes(activeRepoPath) ? activeRepoPath : null) ??
    paths[0] ??
    "";
  const [selectedPath, setSelectedPath] = useState(preferredPath);
  const [capabilitySection, setCapabilitySection] = useState<AgentCapabilitySection | null>(null);
  const terminalVisible = useTerminalStore((state) => !!state.visibleByPath[selectedPath]);
  const toggleTerminal = useTerminalStore((state) => state.toggleVisible);
  const selectedThreads = useAgentChatStore((state) => state.threadsByPath[selectedPath] ?? EMPTY_THREADS);
  const activeThreadId = useAgentChatStore(
    (state) => state.activeThreadByPath[selectedPath] ?? null,
  );
  const activeThreadIsKnown = activeThreadId !== null && selectedThreads.some(
    (thread) => thread.id === activeThreadId,
  );
  const handleToggleTerminal = useCallback(() => {
    toggleTerminal(selectedPath);
  }, [selectedPath, toggleTerminal]);

  useEffect(() => {
    if (initialPath && paths.includes(initialPath) && initialPath !== selectedPath) {
      setSelectedPath(initialPath);
    }
  }, [initialPath, paths, selectedPath]);

  useEffect(() => {
    if (!paths.length) return;
    if (!paths.includes(selectedPath)) setSelectedPath(preferredPath || paths[0]);
  }, [paths, preferredPath, selectedPath]);

  useEffect(() => {
    return retainSurface();
  }, [retainSurface]);

  useEffect(() => {
    if (!paths.length) return;
    void loadThreads(paths);
    void connect().catch(() => {});
  }, [connect, loadThreads, paths]);

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
    <div className="agents-shell flex h-full min-h-0">
      <InAppTerminalLayout path={selectedPath}>
        <ResizablePanelGroup
          orientation="horizontal"
          id="agents-chat-split"
          className="agents-frame"
        >
          <ResizablePanel
            id="agents-chat-sidebar"
            defaultSize="22%"
            minSize="16%"
            maxSize="31%"
            className="agents-sidebar-surface min-w-[252px] overflow-hidden"
          >
            <AgentChatSidebar
              paths={paths}
              selectedPath={selectedPath}
              onSelectPath={setSelectedPath}
              capabilityStudioOpen={capabilitySection !== null}
              onOpenCapabilities={() => setCapabilitySection("skills")}
            />
          </ResizablePanel>
          <ResizableHandle className="w-1 bg-transparent transition-colors hover:bg-[var(--agents-accent-soft)]" />
          <ResizablePanel
            id="agents-chat-main"
            defaultSize="78%"
            minSize="45%"
            className="agents-main-surface min-w-0 overflow-hidden"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <m.div
                key={capabilitySection ? `capabilities:${provider}` : "chat"}
                layout
                layoutId="agents-workspace-surface"
                initial={{ opacity: 0, scale: 0.992, clipPath: "inset(0 0 0 3% round 18px)" }}
                animate={{ opacity: 1, scale: 1, clipPath: "inset(0 0 0 0% round 18px)" }}
                exit={{ opacity: 0, scale: 0.995, clipPath: "inset(0 3% 0 0 round 18px)" }}
                transition={SPRING_LAYOUT}
                className="h-full min-h-0"
              >
                {capabilitySection ? (
                  <Suspense fallback={<div className="grid h-full place-items-center text-xs text-muted-foreground">Capability Studio…</div>}>
                    {provider === "claude" ? (
                      <ClaudeCapabilityCenter
                        key={`claude-capabilities:${selectedPath}`}
                        path={selectedPath}
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
