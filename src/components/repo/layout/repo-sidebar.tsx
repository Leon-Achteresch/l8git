import { MagicPill } from "@/components/motion/magic-pill";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type Branch } from "@/lib/repo-store";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUiStore,
  type SidebarTab,
} from "@/lib/ui-store";
import {
  Archive,
  Cloud,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  ListChecks,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BranchSection } from "@/components/repo/branch/branch-section";
import { NewBranchDialog } from "@/components/repo/branch/new-branch-dialog";

export function RepoSidebar() {
  const activePath = useRepoStore((s) => s.activePath);
  const repo = useRepoStore((s) => (activePath ? s.repos[activePath] : null));
  const deleteBranch = useRepoStore((s) => s.deleteBranch);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);
  const pendingCommitCount = useRepoStore((s) => {
    const p = s.activePath;
    if (!p) return 0;
    return s.status[p]?.length ?? 0;
  });
  const stashCount = useRepoStore((s) => {
    const p = s.activePath;
    if (!p) return 0;
    return s.stashes[p]?.length ?? 0;
  });
  const prCount = useRepoStore((s) => {
    const p = s.activePath;
    if (!p) return 0;
    const list = s.prs[p];
    if (!list) return 0;
    return list.filter((pr) => pr.state === "open" || pr.state === "draft")
      .length;
  });

  const asideRef = useRef<HTMLElement | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const onMove = (e: PointerEvent) => {
      const left = asideRef.current?.getBoundingClientRect().left ?? 0;
      setSidebarWidth(e.clientX - left);
    };
    const onUp = () => setIsResizing(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [isResizing, setSidebarWidth]);

  if (!repo || !activePath) return null;

  const local = repo.branches.filter((b) => !b.is_remote);
  const remote = repo.branches.filter((b) => b.is_remote);

  const onDelete = async (b: Branch, force: boolean) => {
    try {
      await deleteBranch(activePath, b.name, force);
    } catch (e) {
      const msg = String(e);
      if (!force && /not fully merged/i.test(msg)) {
        const ok = window.confirm(
          `Branch "${b.name}" ist nicht gemerged. Trotzdem löschen?`,
        );
        if (ok) await onDelete(b, true);
        return;
      }
      toastError(`Löschen fehlgeschlagen: ${msg}`);
    }
  };

  return (
    <aside
      ref={asideRef}
      className="relative flex min-h-0 shrink-0 flex-col border-r"
      style={{ width: sidebarWidth }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="p-3">
          <Tabs
            orientation="vertical"
            value={sidebarTab}
            onValueChange={(v) => setSidebarTab(v as SidebarTab)}
          >
            <TabsList variant="line" className="w-full">
              <TabsTrigger
                value="commit"
                className="after:!opacity-0"
                title={
                  pendingCommitCount > 0
                    ? `${pendingCommitCount} ausstehende Änderungen`
                    : undefined
                }
              >
                {sidebarTab === "commit" && (
                  <MagicPill
                    layoutId="sidebar-tab-pill"
                    className="pointer-events-none absolute inset-y-1 -right-1 w-0.5 rounded-full bg-foreground"
                  />
                )}
                <GitCommitHorizontal />
                <span className="min-w-0 flex-1 text-left">Commit</span>
                {pendingCommitCount > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px] tabular-nums"
                  >
                    {pendingCommitCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="history" className="after:!opacity-0">
                {sidebarTab === "history" && (
                  <MagicPill
                    layoutId="sidebar-tab-pill"
                    className="pointer-events-none absolute inset-y-1 -right-1 w-0.5 rounded-full bg-foreground"
                  />
                )}
                <History />
                History
              </TabsTrigger>
              <TabsTrigger
                value="pr"
                className="after:!opacity-0"
                title={
                  prCount > 0
                    ? `${prCount} offene Pull Requests`
                    : "Pull Requests"
                }
              >
                {sidebarTab === "pr" && (
                  <MagicPill
                    layoutId="sidebar-tab-pill"
                    className="pointer-events-none absolute inset-y-1 -right-1 w-0.5 rounded-full bg-foreground"
                  />
                )}
                <GitPullRequest />
                <span className="min-w-0 flex-1 text-left">PRs</span>
                {prCount > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px] tabular-nums"
                  >
                    {prCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="ci"
                className="after:!opacity-0"
                title="CI / Pipelines für HEAD"
              >
                {sidebarTab === "ci" && (
                  <MagicPill
                    layoutId="sidebar-tab-pill"
                    className="pointer-events-none absolute inset-y-1 -right-1 w-0.5 rounded-full bg-foreground"
                  />
                )}
                <ListChecks />
                CI
              </TabsTrigger>
              <TabsTrigger
                value="stash"
                className="after:!opacity-0"
                title={
                  stashCount > 0
                    ? `${stashCount} Stash-Einträge`
                    : undefined
                }
              >
                {sidebarTab === "stash" && (
                  <MagicPill
                    layoutId="sidebar-tab-pill"
                    className="pointer-events-none absolute inset-y-1 -right-1 w-0.5 rounded-full bg-foreground"
                  />
                )}
                <Archive />
                <span className="min-w-0 flex-1 text-left">Stash</span>
                {stashCount > 0 ? (
                  <Badge
                    variant="secondary"
                    className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px] tabular-nums"
                  >
                    {stashCount}
                  </Badge>
                ) : null}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Separator />
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-3">
            <BranchSection
              path={activePath}
              title="Lokal"
              icon={<GitBranch className="h-4 w-4" />}
              branches={local}
              onDelete={onDelete}
              showNewBranch
              onNewBranch={() => setNewBranchOpen(true)}
            />
            {remote.length > 0 && (
              <>
                <Separator className="my-3" />
                <BranchSection
                  path={activePath}
                  title="Remote"
                  icon={<Cloud className="h-4 w-4" />}
                  branches={remote}
                />
              </>
            )}
            <NewBranchDialog
              open={newBranchOpen}
              onClose={() => setNewBranchOpen(false)}
              path={activePath}
              branches={repo.branches}
            />
          </div>
        </ScrollArea>
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        onPointerDown={onPointerDown}
        className={`absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize select-none transition-colors hover:bg-accent ${
          isResizing ? "bg-accent" : ""
        }`}
      />
    </aside>
  );
}
