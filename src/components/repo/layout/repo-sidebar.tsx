import { ListRow } from "@/components/ui/list-row";
import { IslandDock } from "@/components/app/island-dock";
import { NewBranchDialog } from "@/components/repo/branch/new-branch-dialog";
import { BranchTree } from "@/components/repo/layout/branch-tree";
import { SidebarNavItem } from "@/components/repo/layout/sidebar-nav-item";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type Branch } from "@/lib/repo-store";
import { ALL_SIDEBAR_TABS, useSidebarPrefs } from "@/lib/sidebar-prefs";
import { useBranchSidebarHotkeys } from "@/lib/use-branch-hotkeys";
import {
  GRID_SIDEBAR_MAX_WIDTH,
  GRID_SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUiStore,
  type SidebarTab,
} from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AnimatePresence, m } from "motion/react";
import {
  Archive,
  ChevronRight,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  History,
  ListChecks,
  Plus,
  Webhook,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export const REPO_SIDEBAR_ICONS_ENABLED = true;

/** Grid-Sidebar-Breite ab der der Branch-Baum inline statt im Popover gezeigt wird */
const BRANCH_INLINE_MIN_WIDTH = 200;

const RARE_TABS: SidebarTab[] = ["submodules", "worktrees", "hooks", "tools"];

function buildTabIcons(
  tabSize: import("@/lib/sidebar-prefs").TabSize,
  tabLayout: import("@/lib/sidebar-prefs").TabLayout,
): Record<SidebarTab, React.ReactNode> {
  const iconClass =
    tabLayout === "grid"
      ? { compact: "h-3.5 w-3.5", normal: "h-4 w-4", large: "h-5 w-5" }[tabSize]
      : "h-4 w-4";
  return {
    commit: <GitCommitHorizontal className={iconClass} />,
    history: <History className={iconClass} />,
    pr: <GitPullRequest className={iconClass} />,
    ci: <ListChecks className={iconClass} />,
    stash: <Archive className={iconClass} />,
    submodules: <FolderGit2 className={iconClass} />,
    worktrees: <GitFork className={iconClass} />,
    hooks: <Webhook className={iconClass} />,
    tools: <Wrench className={iconClass} />,
  };
}

export function RepoSidebar() {
  const { t, i18n } = useTranslation();
  const activePath = useRepoStore((s) => s.activePath);
  const repo = useRepoStore((s) => (activePath ? s.repos[activePath] : null));
  const deleteBranch = useRepoStore((s) => s.deleteBranch);
  const sidebarWidth = useUiStore((s) => s.sidebarWidth);
  const setSidebarWidth = useUiStore((s) => s.setSidebarWidth);
  const gridSidebarWidth = useUiStore((s) => s.gridSidebarWidth);
  const setGridSidebarWidth = useUiStore((s) => s.setGridSidebarWidth);
  const sidebarTab = useUiStore((s) => s.sidebarTab);
  const setSidebarTab = useUiStore((s) => s.setSidebarTab);

  // Sidebar customization prefs
  const tabOrder = useSidebarPrefs((s) => s.tabOrder);
  const hiddenTabs = useSidebarPrefs((s) => s.hiddenTabs);
  const displayMode = useSidebarPrefs((s) => s.displayMode);
  const tabSize = useSidebarPrefs((s) => s.tabSize);
  const tabLayout = useSidebarPrefs((s) => s.tabLayout);
  const gridColumns = useSidebarPrefs((s) => s.gridColumns);
  const moreTabsExpanded = useSidebarPrefs((s) => s.moreTabsExpanded);
  const setMoreTabsExpanded = useSidebarPrefs((s) => s.setMoreTabsExpanded);

  const pendingCommitCount = useRepoStore((s) => {
    const p = s.activePath;
    if (!p) return 0;
    return s.status[p]?.length ?? 0;
  });
  const worktreeCount = useRepoStore((s) => {
    const p = s.activePath;
    if (!p) return 0;
    const list = s.worktrees[p];
    if (!list) return 0;
    return list.length > 1 ? list.length : 0;
  });
  const activeHookCount = useRepoStore((s) => {
    const p = s.activePath;
    if (!p) return 0;
    return s.gitHooks[p]?.filter((h) => h.is_enabled).length ?? 0;
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
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);
  const [forceDeleteTarget, setForceDeleteTarget] = useState<Branch | null>(null);

  const openNewBranchDialog = useCallback(() => setNewBranchOpen(true), []);

  const onDelete = useCallback(
    async (b: Branch, force: boolean) => {
      if (!activePath) return;
      try {
        await deleteBranch(activePath, b.name, force);
      } catch (e) {
        const msg = String(e);
        if (!force && /not fully merged/i.test(msg)) {
          setForceDeleteTarget(b);
          return;
        }
        toastError(t("sidebar.branchDeleteFailed", { error: msg }));
      }
    },
    [activePath, deleteBranch, t],
  );

  const confirmForceDelete = useCallback(async () => {
    if (!activePath || !forceDeleteTarget) return;
    const b = forceDeleteTarget;
    setForceDeleteTarget(null);
    try {
      await deleteBranch(activePath, b.name, true);
    } catch (e2) {
      toastError(t("sidebar.branchDeleteFailed", { error: String(e2) }));
    }
  }, [activePath, deleteBranch, forceDeleteTarget, t]);

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
      if (tabLayout === "grid") {
        setGridSidebarWidth(e.clientX - left);
      } else {
        setSidebarWidth(e.clientX - left);
      }
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
  }, [isResizing, setSidebarWidth, setGridSidebarWidth, tabLayout]);

  const branches = repo?.branches ?? null;
  const tags = repo?.tags ?? null;
  const totalBranchTagCount = (branches?.length ?? 0) + (tags?.length ?? 0);

  const tabClickHandlers = useMemo(
    () =>
      new Map<SidebarTab, () => void>(
        ALL_SIDEBAR_TABS.map((v) => [v, () => setSidebarTab(v)]),
      ),
    [setSidebarTab],
  );

  // Tab counts per tab id
  const tabCounts = useMemo<Record<SidebarTab, number | undefined>>(
    () => ({
      commit: pendingCommitCount > 0 ? pendingCommitCount : undefined,
      history: undefined,
      pr: prCount > 0 ? prCount : undefined,
      ci: undefined,
      stash: stashCount > 0 ? stashCount : undefined,
      submodules: undefined,
      worktrees: worktreeCount > 0 ? worktreeCount : undefined,
      hooks: activeHookCount > 0 ? activeHookCount : undefined,
      tools: undefined,
    }),
    [pendingCommitCount, prCount, stashCount, worktreeCount, activeHookCount],
  );

  // Tab labels per tab id
  const tabLabels = useMemo<Record<SidebarTab, string>>(
    () => ({
      commit: t("sidebar.tabCommit"),
      history: t("sidebar.tabHistory"),
      pr: t("sidebar.tabPr"),
      ci: t("sidebar.tabCi"),
      stash: t("sidebar.tabStash"),
      submodules: t("sidebar.tabSubmodules"),
      worktrees: t("sidebar.tabWorktrees"),
      hooks: t("sidebar.tabHooks"),
      tools: t("sidebar.tabTools"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  );

  // Visible tabs in user-defined order, common tabs first, rare tabs collapsible
  const { mainTabs, rareTabs } = useMemo(() => {
    const visible = tabOrder.filter((id) => !hiddenTabs.includes(id));
    return {
      mainTabs: visible.filter((id) => !RARE_TABS.includes(id)),
      rareTabs: visible.filter((id) => RARE_TABS.includes(id)),
    };
  }, [tabOrder, hiddenTabs]);

  const rareActive = rareTabs.includes(sidebarTab);
  const showRare = moreTabsExpanded || rareActive;
  const rareCountSum = rareTabs.reduce((sum, id) => sum + (tabCounts[id] ?? 0), 0);

  // Build icons dynamically so they scale with tabSize in grid mode
  const TAB_ICONS = useMemo(
    () => buildTabIcons(tabSize, tabLayout),
    [tabSize, tabLayout],
  );

  useBranchSidebarHotkeys({
    path: activePath ?? "",
    enabled: !!activePath,
    onNewBranch: openNewBranchDialog,
  });

  if (!repo || !activePath) return null;

  // Branches/Tags im Popover wenn die Sidebar zu schmal ist
  const useBranchPopover =
    (tabLayout === "list" && sidebarWidth < BRANCH_INLINE_MIN_WIDTH) ||
    (tabLayout === "grid" && gridSidebarWidth < BRANCH_INLINE_MIN_WIDTH);

  const tabListClass =
    tabLayout === "grid"
      ? {
          2: "grid grid-cols-2 gap-1",
          3: "grid grid-cols-3 gap-1",
          4: "grid grid-cols-4 gap-1",
        }[gridColumns]
      : "space-y-0.5";

  const renderTab = (tabId: SidebarTab) => (
    <li key={tabId}>
      <SidebarNavItem
        isActive={sidebarTab === tabId}
        icon={REPO_SIDEBAR_ICONS_ENABLED ? TAB_ICONS[tabId] : undefined}
        label={tabLabels[tabId]}
        count={tabCounts[tabId]}
        emphasis={tabId === "commit"}
        onClick={tabClickHandlers.get(tabId)!}
        displayMode={displayMode}
        tabSize={tabSize}
        tabLayout={tabLayout}
      />
    </li>
  );

  const newBranchButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
      title={t("sidebar.newBranchTitle")}
      aria-label={t("sidebar.newBranchAria")}
      onClick={() => setNewBranchOpen(true)}
    >
      <Plus className="h-3 w-3" />
    </Button>
  );

  return (
    <aside
      ref={asideRef}
      className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      style={{
        width:
          tabLayout === "grid"
            ? gridSidebarWidth
            : sidebarWidth,
      }}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 justify-center px-2">
          <IslandDock id="sidebar" axis="y" />
        </div>

        <nav
          className="shrink-0 p-2"
          role="tablist"
          aria-label={t("sidebar.navAria")}
        >
          <ul className={tabListClass}>{mainTabs.map(renderTab)}</ul>

          {rareTabs.length > 0 && (
            <>
              <ListRow
                size="xs"
                aria-expanded={showRare}
                onClick={() => setMoreTabsExpanded(!showRare)}
                disabled={rareActive}
                className="mt-1 gap-1 px-2 font-semibold uppercase tracking-[0.08em] hover:bg-sidebar-accent/30"
              >
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 transition-transform duration-200",
                    showRare && "rotate-90",
                  )}
                />
                <span className="min-w-0 flex-1 truncate text-left">
                  {t("sidebar.moreTabs")}
                </span>
                {!showRare && rareCountSum > 0 && (
                  <span className="flex h-[14px] min-w-[14px] shrink-0 items-center justify-center rounded-full bg-muted px-0.5 text-[9px] font-bold tabular-nums text-muted-foreground ring-1 ring-border">
                    {rareCountSum > 9 ? "9+" : rareCountSum}
                  </span>
                )}
              </ListRow>
              <AnimatePresence initial={false}>
                {showRare && (
                  <m.div
                    key="rare-tabs"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="overflow-hidden"
                  >
                    <ul className={cn(tabListClass, "pt-1")}>
                      {rareTabs.map(renderTab)}
                    </ul>
                  </m.div>
                )}
              </AnimatePresence>
            </>
          )}
        </nav>

        <div className="mx-2 h-px shrink-0 bg-sidebar-border/60" />

        {useBranchPopover ? (
          <div className="shrink-0 px-2 py-1.5">
            <Popover open={branchPopoverOpen} onOpenChange={setBranchPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="subtle"
                  size="icon"
                  title={t("sidebar.branchPopoverTitle")}
                  aria-label={t("sidebar.branchPopoverTitle")}
                  className={cn(
                    "relative w-full hover:bg-sidebar-accent/40",
                    branchPopoverOpen &&
                      "bg-sidebar-accent/80 text-sidebar-accent-foreground",
                  )}
                >
                  <GitBranch className="h-4 w-4" />
                  {totalBranchTagCount > 0 && (
                    <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-muted px-0.5 text-[9px] font-bold tabular-nums text-muted-foreground ring-1 ring-border">
                      {totalBranchTagCount > 99 ? "99+" : totalBranchTagCount}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={8}
                className="flex w-80 flex-col gap-0 overflow-hidden p-0"
                style={{ maxHeight: "70vh" }}
              >
                <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
                  <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                    {t("sidebar.branchPopoverTitle")}
                  </span>
                  {newBranchButton}
                </div>
                <BranchTree
                  path={activePath}
                  branches={branches ?? []}
                  tags={tags ?? []}
                  onDelete={onDelete}
                />
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-1.5 px-3 pb-0.5 pt-2">
              <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
              <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {t("sidebar.branchPopoverTitle")}
              </span>
              {newBranchButton}
            </div>
            <BranchTree
              path={activePath}
              branches={branches ?? []}
              tags={tags ?? []}
              onDelete={onDelete}
            />
          </>
        )}
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuemin={tabLayout === "grid" ? GRID_SIDEBAR_MIN_WIDTH : SIDEBAR_MIN_WIDTH}
        aria-valuemax={tabLayout === "grid" ? GRID_SIDEBAR_MAX_WIDTH : SIDEBAR_MAX_WIDTH}
        aria-valuenow={tabLayout === "grid" ? gridSidebarWidth : sidebarWidth}
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

      <NewBranchDialog
        open={newBranchOpen}
        onClose={() => setNewBranchOpen(false)}
        path={activePath}
        branches={repo.branches}
      />

      <AlertDialog open={!!forceDeleteTarget} onOpenChange={(open) => { if (!open) setForceDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sidebar.branchForceDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.branchForceDeleteDesc", { name: forceDeleteTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmForceDelete}
            >
              {t("sidebar.branchForceDeleteVerb")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
