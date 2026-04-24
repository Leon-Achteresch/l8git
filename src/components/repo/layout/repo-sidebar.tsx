import { BranchSection } from "@/components/repo/branch/branch-section";
import { NewBranchDialog } from "@/components/repo/branch/new-branch-dialog";
import { SidebarNavItem } from "@/components/repo/layout/sidebar-nav-item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type Branch } from "@/lib/repo-store";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUiStore,
  type SidebarTab,
} from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import {
  Archive,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  ListChecks,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const REPO_SIDEBAR_ICONS_ENABLED = true;

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
  const [branchQuery, setBranchQuery] = useState("");

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsResizing(true);
    },
    [],
  );

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

  const branches = repo?.branches ?? null;

  const { localBranches, remoteBranches } = useMemo(() => {
    const all = branches ?? [];
    const q = branchQuery.trim().toLowerCase();
    const match = (b: Branch) =>
      !q || b.name.toLowerCase().includes(q);
    return {
      localBranches: all.filter((b) => !b.is_remote && match(b)),
      remoteBranches: all.filter((b) => b.is_remote && match(b)),
    };
  }, [branches, branchQuery]);

  if (!repo || !activePath) return null;

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

  const tabs: Array<{
    value: SidebarTab;
    icon?: React.ReactNode;
    label: string;
    count?: number;
  }> = [
    {
      value: "commit",
      ...(REPO_SIDEBAR_ICONS_ENABLED
        ? { icon: <GitCommitHorizontal className="h-4 w-4" /> }
        : {}),
      label: "Commit",
      count: pendingCommitCount > 0 ? pendingCommitCount : undefined,
    },
    {
      value: "history",
      ...(REPO_SIDEBAR_ICONS_ENABLED
        ? { icon: <History className="h-4 w-4" /> }
        : {}),
      label: "History",
    },
    {
      value: "pr",
      ...(REPO_SIDEBAR_ICONS_ENABLED
        ? { icon: <GitPullRequest className="h-4 w-4" /> }
        : {}),
      label: "Pull Requests",
      count: prCount > 0 ? prCount : undefined,
    },
    {
      value: "ci",
      ...(REPO_SIDEBAR_ICONS_ENABLED
        ? { icon: <ListChecks className="h-4 w-4" /> }
        : {}),
      label: "CI",
    },
    {
      value: "stash",
      ...(REPO_SIDEBAR_ICONS_ENABLED
        ? { icon: <Archive className="h-4 w-4" /> }
        : {}),
      label: "Stash",
      count: stashCount > 0 ? stashCount : undefined,
    },
  ];

  const hasQuery = branchQuery.trim().length > 0;
  const hasAnyMatch = localBranches.length + remoteBranches.length > 0;

  return (
    <aside
      ref={asideRef}
      className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm"
      style={{ width: sidebarWidth }}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <nav
          className="shrink-0 p-2"
          role="tablist"
          aria-label="Sidebar Navigation"
        >
          <ul className="space-y-0.5">
            {tabs.map((tab) => (
              <li key={tab.value}>
                <SidebarNavItem
                  isActive={sidebarTab === tab.value}
                  icon={tab.icon}
                  label={tab.label}
                  count={tab.count}
                  onClick={() => setSidebarTab(tab.value)}
                />
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-3 h-px shrink-0 bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />

        <div className="shrink-0 px-2 pt-2 pb-1">
          <label className="group relative flex items-center">
            {REPO_SIDEBAR_ICONS_ENABLED ? (
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground/70 transition-colors group-focus-within:text-foreground"
              />
            ) : null}
            <input
              type="search"
              value={branchQuery}
              onChange={(e) => setBranchQuery(e.target.value)}
              placeholder="Branches filtern …"
              aria-label="Branches filtern"
              className={cn(
                "h-7 w-full rounded-md border border-transparent bg-muted/50 pr-7 text-xs text-foreground placeholder:text-muted-foreground/80 outline-none transition-[background,border-color] focus:border-ring focus:bg-background [&::-webkit-search-cancel-button]:hidden",
                REPO_SIDEBAR_ICONS_ENABLED ? "pl-7" : "pl-2",
              )}
            />
            {hasQuery && (
              <button
                type="button"
                onClick={() => setBranchQuery("")}
                aria-label="Filter zurücksetzen"
                className="absolute right-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </label>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="min-h-0 min-w-0 flex-1">
            <div className="w-full min-w-0 max-w-full overflow-x-hidden px-2 pb-3 pt-2">
              <BranchSection
                path={activePath}
                title="Lokal"
                
                branches={localBranches}
                emptyLabel={
                  hasQuery
                    ? "Keine Treffer"
                    : "Keine lokalen Branches"
                }
                onDelete={onDelete}
                showNewBranch={!hasQuery}
                onNewBranch={() => setNewBranchOpen(true)}
              />
              {remoteBranches.length > 0 && (
                <>
                  <div
                    aria-hidden
                    className="mx-1 my-3 h-px bg-gradient-to-r from-transparent via-sidebar-border to-transparent"
                  />
                  <BranchSection
                    path={activePath}
                    title="Remote"
                    branches={remoteBranches}
                    emptyLabel="Keine Remote-Branches"
                  />
                </>
              )}
              {hasQuery && !hasAnyMatch && (
                <div className="mx-1 rounded-md border border-dashed border-sidebar-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                  Keine Branches für „{branchQuery.trim()}“
                </div>
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
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        aria-valuenow={sidebarWidth}
        onPointerDown={onPointerDown}
        className="group absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize select-none"
      >
        <div
          className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full transition-colors duration-150",
            isResizing
              ? "bg-primary"
              : "bg-transparent group-hover:bg-primary/60",
          )}
        />
      </div>
    </aside>
  );
}
