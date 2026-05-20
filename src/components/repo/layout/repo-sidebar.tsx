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
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUiStore,
  type SidebarTab,
} from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import {
  Archive,
  FolderGit2,
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

const ICON_COMMIT = <GitCommitHorizontal className="h-4 w-4" />;
const ICON_HISTORY = <History className="h-4 w-4" />;
const ICON_PR = <GitPullRequest className="h-4 w-4" />;
const ICON_CI = <ListChecks className="h-4 w-4" />;
const ICON_STASH = <Archive className="h-4 w-4" />;
const ICON_SUBMODULES = <FolderGit2 className="h-4 w-4" />;
const ICON_WORKTREES = <GitFork className="h-4 w-4" />;
const ICON_HOOKS = <Webhook className="h-4 w-4" />;

export function RepoSidebar() {
  const { t, i18n } = useTranslation();
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
    const match = (t: TagRef) => !q || t.name.toLowerCase().includes(q);
    return all.filter(match);
  }, [tags, branchQuery]);

  const totalRemoteBranches = useMemo(
    () => (branches ?? []).filter((b) => b.is_remote).length,
    [branches],
  );
  const totalTags = tags?.length ?? 0;

  const tabClickHandlers = useMemo(
    () =>
      new Map<SidebarTab, () => void>(
        (
          ["commit", "history", "pr", "ci", "stash", "submodules", "worktrees", "hooks"] as SidebarTab[]
        ).map((v) => [v, () => setSidebarTab(v)]),
      ),
    [setSidebarTab],
  );

  const tabs = useMemo(
    () => [
      {
        value: "commit" as SidebarTab,
        icon: REPO_SIDEBAR_ICONS_ENABLED ? ICON_COMMIT : undefined,
        label: t("sidebar.tabCommit"),
        count: pendingCommitCount > 0 ? pendingCommitCount : undefined,
      },
      {
        value: "history" as SidebarTab,
        icon: REPO_SIDEBAR_ICONS_ENABLED ? ICON_HISTORY : undefined,
        label: t("sidebar.tabHistory"),
      },
      {
        value: "pr" as SidebarTab,
        icon: REPO_SIDEBAR_ICONS_ENABLED ? ICON_PR : undefined,
        label: t("sidebar.tabPr"),
        count: prCount > 0 ? prCount : undefined,
      },
      {
        value: "ci" as SidebarTab,
        icon: REPO_SIDEBAR_ICONS_ENABLED ? ICON_CI : undefined,
        label: t("sidebar.tabCi"),
      },
      {
        value: "stash" as SidebarTab,
        icon: REPO_SIDEBAR_ICONS_ENABLED ? ICON_STASH : undefined,
        label: t("sidebar.tabStash"),
        count: stashCount > 0 ? stashCount : undefined,
      },
      {
        value: "submodules" as SidebarTab,
        icon: REPO_SIDEBAR_ICONS_ENABLED ? ICON_SUBMODULES : undefined,
        label: t("sidebar.tabSubmodules"),
      },
      {
        value: "worktrees" as SidebarTab,
        icon: REPO_SIDEBAR_ICONS_ENABLED ? ICON_WORKTREES : undefined,
        label: t("sidebar.tabWorktrees"),
        count: worktreeCount > 0 ? worktreeCount : undefined,
      },
      {
        value: "hooks" as SidebarTab,
        icon: REPO_SIDEBAR_ICONS_ENABLED ? ICON_HOOKS : undefined,
        label: t("sidebar.tabHooks"),
        count: activeHookCount > 0 ? activeHookCount : undefined,
      },
    ],
    [pendingCommitCount, prCount, stashCount, worktreeCount, activeHookCount, t, i18n.language],
  );

  if (!repo || !activePath) return null;

  const hasQuery = branchQuery.trim().length > 0;
  const hasAnyMatch =
    localBranches.length + remoteBranches.length + filteredTags.length > 0;

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
          aria-label={t("sidebar.navAria")}
        >
          <ul className="space-y-0.5">
            {tabs.map((tab) => (
              <li key={tab.value}>
                <SidebarNavItem
                  isActive={sidebarTab === tab.value}
                  icon={tab.icon}
                  label={tab.label}
                  count={tab.count}
                  onClick={tabClickHandlers.get(tab.value)!}
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

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ScrollArea className="min-h-0 min-w-0 flex-1">
            <div className="w-full min-w-0 max-w-full overflow-x-hidden px-2 pb-3 pt-1">
              <Accordion
                type="multiple"
                defaultValue={["local", "remote", "tags"]}
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
                        asChild
                        variant="ghost"
                        size="icon-xs"
                        className="h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <span
                          role="button"
                          tabIndex={0}
                          title={t("sidebar.newBranchTitle")}
                          aria-label={t("sidebar.newBranchAria")}
                          onClick={(e) => {
                            e.stopPropagation();
                            setNewBranchOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              setNewBranchOpen(true);
                            }
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </span>
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
