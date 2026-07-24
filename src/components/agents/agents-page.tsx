import { useEffect, useMemo, useState } from "react";

import { AgentsChangesPane } from "@/components/agents/agents-changes-pane";
import { AgentsEmpty } from "@/components/agents/agents-empty";
import { AgentsSidebar } from "@/components/agents/agents-sidebar";
import { AgentsTerminalPane } from "@/components/agents/agents-terminal-pane";
import type { AgentsSelection } from "@/components/agents/agents-types";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  agentTabs,
  detectInstalledAgents,
} from "@/lib/agent-integrations";
import { useRepoStore } from "@/lib/repo-store";
import { isDarkMode } from "@/lib/terminal/terminal-theme";
import { useTerminalStore, type TerminalTab } from "@/lib/terminal-store";
import { useWorkspaceStore } from "@/lib/workspace-store";

const EMPTY_TABS: TerminalTab[] = [];

export function AgentsPage() {
  const knownPaths = useRepoStore((s) => s.paths);
  const workspacePaths = useWorkspaceStore(
    (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.repoPaths ?? [],
  );
  const tabsByPath = useTerminalStore((s) => s.tabsByPath);
  const reloadStatus = useRepoStore((s) => s.reloadStatus);

  const allPaths = useMemo(() => {
    const set = new Set<string>([...workspacePaths, ...knownPaths]);
    for (const p of Object.keys(tabsByPath)) {
      if (agentTabs(tabsByPath[p] ?? []).length > 0) set.add(p);
    }
    return [...set];
  }, [workspacePaths, knownPaths, tabsByPath]);

  const [selected, setSelected] = useState<AgentsSelection | null>(null);
  const selectedPath = selected?.path ?? null;

  const [isDark, setIsDark] = useState(() => isDarkMode());
  useEffect(() => {
    const update = () => setIsDark(isDarkMode());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    detectInstalledAgents();
    for (const p of useRepoStore.getState().paths) void reloadStatus(p);
  }, [reloadStatus]);

  useEffect(() => {
    if (!selectedPath) return;
    void reloadStatus(selectedPath);
    const id = window.setInterval(() => void reloadStatus(selectedPath), 5000);
    return () => window.clearInterval(id);
  }, [selectedPath, reloadStatus]);

  useEffect(() => {
    if (selected?.tabId) {
      const tabs = tabsByPath[selected.path] ?? EMPTY_TABS;
      if (tabs.some((tab) => tab.id === selected.tabId)) return;
      setSelected({ path: selected.path });
      return;
    }
    if (selected) return;
    for (const p of allPaths) {
      const first = agentTabs(tabsByPath[p] ?? EMPTY_TABS)[0];
      if (first) {
        setSelected({ path: p, tabId: first.id });
        return;
      }
    }
    if (allPaths[0]) setSelected({ path: allPaths[0] });
  }, [selected, tabsByPath, allPaths]);

  if (allPaths.length === 0) {
    return <AgentsEmpty />;
  }

  return (
    <div className="flex h-full min-h-0 p-2">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl bg-card/30 shadow-sm ring-1 ring-border/50">
        <ResizablePanelGroup orientation="horizontal" id="agents-split">
          <ResizablePanel
            id="agents-sidebar"
            defaultSize="20%"
            minSize="14%"
            maxSize="32%"
            className="min-w-[200px] bg-muted/20"
          >
            <AgentsSidebar
              paths={allPaths}
              selected={selected}
              onSelect={setSelected}
            />
          </ResizablePanel>
          <ResizableHandle className="w-px bg-border/40 transition-colors hover:bg-primary/30" />
          <ResizablePanel
            id="agents-terminal"
            defaultSize="55%"
            minSize="35%"
            className="min-w-0 bg-background"
          >
            <AgentsTerminalPane
              selected={selected}
              isDark={isDark}
              onSelect={setSelected}
            />
          </ResizablePanel>
          <ResizableHandle className="w-px bg-border/40 transition-colors hover:bg-primary/30" />
          <ResizablePanel
            id="agents-changes"
            defaultSize="25%"
            minSize="18%"
            maxSize="40%"
            className="min-w-[220px] bg-muted/15"
          >
            <AgentsChangesPane path={selectedPath} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
