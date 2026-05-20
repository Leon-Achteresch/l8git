import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

import { CommitHistoryPanel } from "@/components/repo/commit/commit-history-panel";
import { RepoRemoteToolbar } from "@/components/repo/remote/repo-remote-toolbar";
import { RepoTerminalPanel } from "@/components/repo/remote/repo-terminal-panel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useTerminalStore } from "@/lib/terminal-store";
import { useRepoStore } from "@/lib/repo-store";

export function RepoDetails() {
  const { t } = useTranslation();
  const activePath = useRepoStore((s) => s.activePath);
  const repo = useRepoStore((s) => (activePath ? s.repos[activePath] : null));
  const loading = useRepoStore((s) =>
    activePath ? !!s.loading[activePath] : false,
  );
  const terminalVisible = useTerminalStore((s) =>
    repo ? !!s.visibleByPath[repo.path] : false,
  );
  const panelHeight = useTerminalStore((s) => s.panelHeight);
  const setPanelHeight = useTerminalStore((s) => s.setPanelHeight);
  const toggleVisible = useTerminalStore((s) => s.toggleVisible);

  useEffect(() => {
    if (!repo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && e.key === "`") {
        e.preventDefault();
        toggleVisible(repo.path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [repo, toggleVisible]);

  if (repo) {
    const totalHeightHint =
      typeof window !== "undefined" ? window.innerHeight || 800 : 800;
    const terminalPct = Math.max(
      10,
      Math.min(70, Math.round((panelHeight / totalHeightHint) * 100)),
    );

    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
        <RepoRemoteToolbar path={repo.path} />
        <div className="min-h-0 flex-1 overflow-hidden">
          {terminalVisible ? (
            <ResizablePanelGroup
              orientation="vertical"
              id="repo-details-vertical"
              className="h-full w-full flex-col"
              defaultLayout={{
                "history-area": 100 - terminalPct,
                "terminal-area": terminalPct,
              }}
              onLayoutChanged={(layout) => {
                const pct = layout["terminal-area"];
                if (typeof pct !== "number") return;
                const next = Math.round((pct / 100) * totalHeightHint);
                if (Math.abs(next - panelHeight) > 4) {
                  setPanelHeight(next);
                }
              }}
            >
              <ResizablePanel
                id="history-area"
                defaultSize={`${100 - terminalPct}%`}
                minSize="20%"
                className="min-h-0"
              >
                <div className="h-full min-h-0 overflow-hidden px-4 rounded-4xl">
                  <CommitHistoryPanel path={repo.path} commits={repo.commits} />
                </div>
              </ResizablePanel>
              <ResizableHandle
                withHandle
                className="bg-border/50 transition-colors hover:bg-primary/20"
              />
              <ResizablePanel
                id="terminal-area"
                defaultSize={`${terminalPct}%`}
                minSize="10%"
                maxSize="70%"
                className="min-h-0"
              >
                <RepoTerminalPanel path={repo.path} />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="h-full min-h-0 overflow-hidden px-4 rounded-4xl">
              <CommitHistoryPanel path={repo.path} commits={repo.commits} />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("repoDetails.loading")}
      </p>
    );
  }

  return null;
}
