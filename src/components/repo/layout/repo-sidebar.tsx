import { BranchSection } from "@/components/repo/branch/branch-section";
import { NewBranchDialog } from "@/components/repo/branch/new-branch-dialog";
import { SidebarNavItem } from "@/components/repo/layout/sidebar-nav-item";
import { TagSection } from "@/components/repo/tag/tag-section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type Branch, type TagRef } from "@/lib/repo-store";
import { useSidebarPrefs } from "@/lib/sidebar-prefs";
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
import {
  Archive,
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  GitFork,
  GitPullRequest,
  History,
  ListChecks,
  Plus,
  Search,
  Webhook,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export const REPO_SIDEBAR_ICONS_ENABLED = true;

/** Grid-Sidebar-Breite ab der der Branch-Baum inline statt im Popover gezeigt wird */
const BRANCH_INLINE_MIN_WIDTH = 200;

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
  const showBranchFilter = useSidebarPrefs((s) => s.showBranchFilter);
  const defaultOpenSections = useSidebarPrefs((s) => s.defaultOpenSections);

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
  const [branchQuery, setBranchQuery] = useState("");
  const [branchPopoverOpen, setBranchPopoverOpen] = useState(false);

  const onDelete = useCallback(
    async (b: Branch, force: boolean) => {
      if (!activePath) return;
      try {
        await deleteBranch(activePath, b.name, force);
      } catch (e) {
        const msg = String(e);
        if (!force && /not fully merged/i.test(msg)) {
          const ok = window.confirm(t("sidebar.branchDeleteConfirm", { name: b.name }));
          if (ok) {
            try {
              await deleteBranch(activePath, b.name, true);
            } catch (e2) {
              toastError(t("sidebar.branchDeleteFailed", { error: String(e2) }));
            }
          }
          return;
        }
        toastError(t("sidebar.branchDeleteFailed", { error: msg }));
      }
    },
    [activePath, deleteBranch, t],
  );

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

  const { localBranches, remoteBranches } = useMemo(() => {
    const all = branches ?? [];
    const q = branchQuery.trim().toLowerCase();
    const match = (b: Branch) => !q || b.name.toLowerCase().includes(q);
    return {
      localBranches: all.filter((b) => !b.is_remote && match(b)),
      remoteBranches: all.filter((b) => b.is_remote && match(b)),
    };
  }, [branches, branchQuery]);

  const filteredTags = useMemo(() => {
    const all = tags ?? [];
    const q = branchQuery.trim().toLowerCase();
    const match = (tg: TagRef) => !q || tg.name.toLowerCase().includes(q);
    return all.filter(match);
  }, [tags, branchQuery]);

  const totalRemoteBranches = useMemo(
    () => (branches ?? []).filter((b) => b.is_remote).length,
    [branches],
  );
  const totalTags = tags?.length ?? 0;
  const totalBranchTagCount = (branches?.length ?? 0) + totalTags;

  const tabClickHandlers = useMemo(
    () =>
      new Map<SidebarTab, () => void>(
        (
          ["commit", "history", "pr", "ci", "stash", "submodules", "worktrees", "hooks"] as SidebarTab[]
        ).map((v) => [v, () => setSidebarTab(v)]),
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
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language],
  );

  // Visible tabs in user-defined order
  const visibleTabs = useMemo(
    () => tabOrder.filter((id) => !hiddenTabs.includes(id)),
    [tabOrder, hiddenTabs],
  );

  // Build icons dynamically so they scale with tabSize in grid mode
  const TAB_ICONS = useMemo(
    () => buildTabIcons(tabSize, tabLayout),
    [tabSize, tabLayout],
  );

  if (!repo || !activePath) return null;

  const hasQuery = branchQuery.trim().length > 0;
  const hasAnyMatch =
    localBranches.length + remoteBranches.length + filteredTags.length > 0;

  // Branches/Tags im Popover wenn die Sidebar zu schmal ist
  const useBranchPopover =
    displayMode === "icons_only" ||
    (tabLayout === "grid" && gridSidebarWidth < BRANCH_INLINE_MIN_WIDTH);

  return (
    <aside
      ref={asideRef}
      className="relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm"
      style={{
        width:
          tabLayout === "grid"
            ? gridSidebarWidth
            : tabLayout === "list" && displayMode === "icons_only"
              ? Math.min(sidebarWidth, 56)
              : sidebarWidth,
      }}
    >
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <nav
          className="shrink-0 p-2"
          role="tablist"
          aria-label={t("sidebar.navAria")}
        >
          <ul
            className={cn(
              tabLayout === "grid"
                ? {
                    2: "grid grid-cols-2 gap-1",
                    3: "grid grid-cols-3 gap-1",
                    4: "grid grid-cols-4 gap-1",
                  }[gridColumns]
                : "space-y-0.5",
            )}
          >
            {visibleTabs.map((tabId) => (
              <li key={tabId}>
                <SidebarNavItem
                  isActive={sidebarTab === tabId}
                  icon={REPO_SIDEBAR_ICONS_ENABLED ? TAB_ICONS[tabId] : undefined}
                  label={tabLabels[tabId]}
                  count={tabCounts[tabId]}
                  onClick={tabClickHandlers.get(tabId)!}
                  displayMode={displayMode}
                  tabSize={tabSize}
                  tabLayout={tabLayout}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* Branch/Tag tree — popover in icons-only mode, inline otherwise */}
        {displayMode === "icons_only" ? (
          <>
            <div className="mx-3 h-px shrink-0 bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />
            <div className="shrink-0 px-2 py-1">
              <Popover open={branchPopoverOpen} onOpenChange={setBranchPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title={t("sidebar.branchPopoverTitle")}
                    aria-label={t("sidebar.branchPopoverTitle")}
                    className={cn(
                      "relative flex h-8 w-full items-center justify-center rounded-md outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/60",
                      branchPopoverOpen
                        ? "bg-sidebar-accent/80 text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground",
                    )}
                  >
                    <GitBranch className="h-4 w-4" />
                    {totalBranchTagCount > 0 && (
                      <span className="pointer-events-none absolute right-0.5 top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold tabular-nums text-primary-foreground">
                        {totalBranchTagCount > 99 ? "99+" : totalBranchTagCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="right"
                  align="start"
                  sideOffset={8}
                  className="flex w-80 flex-col gap-0 overflow-hidden p-0"
                  style={{ maxHeight: "70vh" }}
                >
                  {/* Header */}
                  <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
                    <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-semibold">{t("sidebar.branchPopoverTitle")}</span>
                  </div>

                  {/* Branch filter */}
                  {showBranchFilter && (
                    <div className="shrink-0 px-2 pt-2 pb-1">
                      <label className="group relative flex items-center">
                        <Search
                          aria-hidden
                          className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground/70 transition-colors group-focus-within:text-foreground"
                        />
                        <input
                          type="search"
                          value={branchQuery}
                          onChange={(e) => setBranchQuery(e.target.value)}
                          placeholder={t("sidebar.filterPlaceholder")}
                          aria-label={t("sidebar.filterAria")}
                          className="h-7 w-full rounded-md border border-transparent bg-muted/50 pl-7 pr-7 text-xs text-foreground placeholder:text-muted-foreground/80 outline-none transition-[background,border-color] focus:border-ring focus:bg-background [&::-webkit-search-cancel-button]:hidden"
                        />
                        {hasQuery && (
                          <button
                            type="button"
                            onClick={() => setBranchQuery("")}
                            aria-label={t("sidebar.resetFilterAria")}
                            className="absolute right-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </label>
                    </div>
                  )}

                  {/* Branch / Tag accordion */}
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="px-2 pb-3 pt-1">
                      <Accordion
                        type="multiple"
                        defaultValue={defaultOpenSections}
                        className="w-full min-w-0"
                      >
                        <AccordionItem value="local" className="min-w-0 border-0">
                          <AccordionTrigger className="group/trigger my-px flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:no-underline hover:bg-sidebar-accent/30 [&>svg]:shrink-0 [&>svg]:text-muted-foreground/70">
                            <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground group-data-[state=open]/trigger:text-foreground">
                              {t("sidebar.local")}
                            </span>
                            <span className="flex h-[18px] min-w-[20px] shrink-0 items-center justify-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                              {localBranches.length}
                            </span>
                            {!hasQuery && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                                title={t("sidebar.newBranchTitle")}
                                aria-label={t("sidebar.newBranchAria")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNewBranchOpen(true);
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            )}
                          </AccordionTrigger>
                          <AccordionContent className="pb-0 pt-0 [&>div]:pb-1 [&>div]:pt-0.5">
                            <BranchSection
                              path={activePath}
                              title={t("sidebar.local")}
                              branches={localBranches}
                              emptyLabel={hasQuery ? t("common.noResults") : t("sidebar.noLocalBranches")}
                              onDelete={onDelete}
                              hideHeader
                            />
                          </AccordionContent>
                        </AccordionItem>

                        {totalRemoteBranches > 0 && (
                          <AccordionItem value="remote" className="min-w-0 border-0">
                            <AccordionTrigger className="group/trigger my-px flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:no-underline hover:bg-sidebar-accent/30 [&>svg]:shrink-0 [&>svg]:text-muted-foreground/70">
                              <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground group-data-[state=open]/trigger:text-foreground">
                                {t("sidebar.remote")}
                              </span>
                              <span className="flex h-[18px] min-w-[20px] shrink-0 items-center justify-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                                {remoteBranches.length}
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-0 pt-0 [&>div]:pb-1 [&>div]:pt-0.5">
                              <BranchSection
                                path={activePath}
                                title={t("sidebar.remote")}
                                branches={remoteBranches}
                                emptyLabel={t("common.noResults")}
                                hideHeader
                              />
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {totalTags > 0 && (
                          <AccordionItem value="tags" className="min-w-0 border-0">
                            <AccordionTrigger className="group/trigger my-px flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:no-underline hover:bg-sidebar-accent/30 [&>svg]:shrink-0 [&>svg]:text-muted-foreground/70">
                              <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground group-data-[state=open]/trigger:text-foreground">
                                {t("sidebar.tags")}
                              </span>
                              <span className="flex h-[18px] min-w-[20px] shrink-0 items-center justify-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                                {filteredTags.length}
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-0 pt-0 [&>div]:pb-1 [&>div]:pt-0.5">
                              <TagSection
                                path={activePath}
                                title={t("sidebar.tags")}
                                tags={filteredTags}
                                emptyLabel={hasQuery ? t("common.noResults") : t("sidebar.noTags")}
                                hideHeader
                              />
                            </AccordionContent>
                          </AccordionItem>
                        )}
                      </Accordion>

                      {hasQuery && !hasAnyMatch && (
                        <div className="mx-1 rounded-md border border-dashed border-sidebar-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                          {t("sidebar.noBranchesForQuery", { query: branchQuery.trim() })}
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
                </PopoverContent>
              </Popover>
            </div>
          </>
        ) : (
          <>
            <div className="mx-3 h-px shrink-0 bg-gradient-to-r from-transparent via-sidebar-border to-transparent" />

            {showBranchFilter && (
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
                    placeholder={t("sidebar.filterPlaceholder")}
                    aria-label={t("sidebar.filterAria")}
                    className={cn(
                      "h-7 w-full rounded-md border border-transparent bg-muted/50 pr-7 text-xs text-foreground placeholder:text-muted-foreground/80 outline-none transition-[background,border-color] focus:border-ring focus:bg-background [&::-webkit-search-cancel-button]:hidden",
                      REPO_SIDEBAR_ICONS_ENABLED ? "pl-7" : "pl-2",
                    )}
                  />
                  {hasQuery && (
                    <button
                      type="button"
                      onClick={() => setBranchQuery("")}
                      aria-label={t("sidebar.resetFilterAria")}
                      className="absolute right-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </label>
              </div>
            )}

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <ScrollArea className="min-h-0 min-w-0 flex-1">
                <div className="w-full min-w-0 max-w-full overflow-x-hidden px-2 pb-3 pt-1">
                  <Accordion
                    type="multiple"
                    defaultValue={defaultOpenSections}
                    className="w-full min-w-0"
                  >
                    <AccordionItem value="local" className="min-w-0 border-0">
                      <AccordionTrigger className="group/trigger my-px flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:no-underline hover:bg-sidebar-accent/30 [&>svg]:shrink-0 [&>svg]:text-muted-foreground/70">
                        <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground group-data-[state=open]/trigger:text-foreground">
                          {t("sidebar.local")}
                        </span>
                        <span className="flex h-[18px] min-w-[20px] shrink-0 items-center justify-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                          {localBranches.length}
                        </span>
                        {!hasQuery && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                            title={t("sidebar.newBranchTitle")}
                            aria-label={t("sidebar.newBranchAria")}
                            onClick={(e) => {
                              e.stopPropagation();
                              setNewBranchOpen(true);
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        )}
                      </AccordionTrigger>
                      <AccordionContent className="pb-0 pt-0 [&>div]:pb-1 [&>div]:pt-0.5">
                        <BranchSection
                          path={activePath}
                          title={t("sidebar.local")}
                          branches={localBranches}
                          emptyLabel={hasQuery ? t("common.noResults") : t("sidebar.noLocalBranches")}
                          onDelete={onDelete}
                          hideHeader
                        />
                      </AccordionContent>
                    </AccordionItem>

                    {totalRemoteBranches > 0 && (
                      <AccordionItem value="remote" className="min-w-0 border-0">
                        <AccordionTrigger className="group/trigger my-px flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:no-underline hover:bg-sidebar-accent/30 [&>svg]:shrink-0 [&>svg]:text-muted-foreground/70">
                          <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground group-data-[state=open]/trigger:text-foreground">
                            {t("sidebar.remote")}
                          </span>
                          <span className="flex h-[18px] min-w-[20px] shrink-0 items-center justify-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                            {remoteBranches.length}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0 pt-0 [&>div]:pb-1 [&>div]:pt-0.5">
                          <BranchSection
                            path={activePath}
                            title={t("sidebar.remote")}
                            branches={remoteBranches}
                            emptyLabel={t("common.noResults")}
                            hideHeader
                          />
                        </AccordionContent>
                      </AccordionItem>
                    )}

                    {totalTags > 0 && (
                      <AccordionItem value="tags" className="min-w-0 border-0">
                        <AccordionTrigger className="group/trigger my-px flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left hover:no-underline hover:bg-sidebar-accent/30 [&>svg]:shrink-0 [&>svg]:text-muted-foreground/70">
                          <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground group-data-[state=open]/trigger:text-foreground">
                            {t("sidebar.tags")}
                          </span>
                          <span className="flex h-[18px] min-w-[20px] shrink-0 items-center justify-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                            {filteredTags.length}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0 pt-0 [&>div]:pb-1 [&>div]:pt-0.5">
                          <TagSection
                            path={activePath}
                            title={t("sidebar.tags")}
                            tags={filteredTags}
                            emptyLabel={hasQuery ? t("common.noResults") : t("sidebar.noTags")}
                            hideHeader
                          />
                        </AccordionContent>
                      </AccordionItem>
                    )}
                  </Accordion>

                  {hasQuery && !hasAnyMatch && (
                    <div className="mx-1 rounded-md border border-dashed border-sidebar-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("sidebar.noBranchesForQuery", { query: branchQuery.trim() })}
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
    </aside>
  );
}
