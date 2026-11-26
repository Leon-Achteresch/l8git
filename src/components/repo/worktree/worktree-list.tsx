import { ListRow } from "@/components/ui/list-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type WorktreeEntry } from "@/lib/repo-store";
import {
  ChevronDown,
  ChevronRight,
  GitFork,
  Info,
  Plus,
  RefreshCw,
  Scissors,
} from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { WorktreeCard } from "./worktree-card";
import { PulseIcon, SpinIcon } from "@/components/motion/kit";
import { WorkflowHelpLink } from '@/components/help/workflow-help-link';

const EMPTY: WorktreeEntry[] = [];
export const WORKTREE_PAGE_SIZE = 60;

export function WorktreeList({
  path,
  query,
  onQueryChange,
  limit,
  onShowMore,
  selectedPath,
  onSelectPath,
  onOpenAdd,
  onRefresh,
  onPrune,
  onRequestMove,
  onRequestLock,
}: {
  path: string;
  query: string;
  onQueryChange: (value: string) => void;
  limit: number;
  onShowMore: () => void;
  selectedPath: string | null;
  onSelectPath: (p: string | null) => void;
  onOpenAdd: () => void;
  onRefresh: () => void;
  onPrune: () => void;
  onRequestMove: (entry: WorktreeEntry) => void;
  onRequestLock: (entry: WorktreeEntry) => void;
}) {
  const { t, i18n } = useTranslation();
  const worktrees = useRepoStore((s) => s.worktrees[path] ?? EMPTY);
  const loading = useRepoStore((s) => !!s.worktreesLoading[path]);
  const check = useRepoStore((s) => s.worktreeChecks[path]);
  const worktreePrune = useRepoStore((s) => s.worktreePrune);
  const [hintOpen, setHintOpen] = useState(false);
  const [pruning, setPruning] = useState(false);
  const rowsRef = useRef<HTMLDivElement>(null);
  const nextFocus = useRef<string | null>(null);
  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/);
    if (!words[0]) return worktrees;
    return worktrees.filter(entry => {
      const fields = [entry.path, entry.branch, entry.head_oid ?? entry.head, entry.lock_reason, entry.prunable_reason];
      if (entry.is_main) fields.push(t("worktree.badgeMain"));
      if (entry.is_bare) fields.push(t("worktree.bareRepository"));
      if (entry.is_locked) fields.push(t("worktree.badgeLocked"));
      if (entry.is_prunable) fields.push(t("worktree.badgePrunable"));
      if (!entry.branch && entry.head) fields.push(t("worktree.detachedHead"));
      const text = fields.join("\n").toLowerCase();
      return words.every(word => text.includes(word));
    });
  }, [query, t, worktrees]);
  useLayoutEffect(() => {
    if (!nextFocus.current) return;
    for (const row of rowsRef.current?.querySelectorAll<HTMLButtonElement>('[data-worktree-path]') ?? []) {
      if (row.dataset.worktreePath === nextFocus.current) {
        row.focus();
        break;
      }
    }
    nextFocus.current = null;
  }, [limit]);

  const handlePrune = async () => {
    setPruning(true);
    try {
      const out = await worktreePrune(path);
      toast.success(out || t("worktree.cardPrunedFallback"));
      onPrune();
    } catch (e) {
      toastError(String(e));
    } finally {
      setPruning(false);
    }
  };

  const linkedCount = worktrees.length > 1 ? worktrees.length - 1 : 0;
  const emptyUnknown = worktrees.length === 0 && (!check || check.failed);
  const summarySub =
    emptyUnknown
      ? null
      : worktrees.length === 0
      ? t("worktree.summaryNone")
      : worktrees.length === 1
        ? t("worktree.summaryMainOne")
        : t("worktree.summaryMany", { count: worktrees.length, linked: linkedCount });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-git-branch/12 text-git-branch">
            <GitFork className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              {t("worktree.introTitle")}
            </h2>
            {summarySub && <p className="text-[0.6875rem] text-muted-foreground">{summarySub}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <WorkflowHelpLink guideId="parallel-work" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                disabled={pruning || loading}
                aria-label={t("worktree.pruneStaleTooltip")}
                onClick={() => void handlePrune()}
              >
                <PulseIcon icon={Scissors} active={pruning} className={`h-4 w-4`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              {t("worktree.pruneStaleTooltip")}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                onClick={onOpenAdd}
                aria-label={t("worktree.add")}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{t("worktree.add")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                disabled={loading}
                aria-label={t("worktree.reloadTooltip")}
                onClick={onRefresh}
              >
                <SpinIcon icon={RefreshCw} active={loading} 
                  className={`h-4 w-4`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{t("worktree.reloadTooltip")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {(check?.failed || check?.checkedAt) && (
        <p
          role={check.failed ? "alert" : undefined}
          className="shrink-0 border-b border-border/40 px-3 py-1 text-[0.6875rem] text-muted-foreground"
        >
          {check.failed
            ? t("worktree.catalogRefreshFailed")
            : t("worktree.catalogCheckedAt", {
                time: new Intl.DateTimeFormat(i18n.language, { timeStyle: "medium" }).format(check.checkedAt),
              })}
        </p>
      )}

      <ListRow
        size="sm"
        onClick={() => setHintOpen((v) => !v)}
        aria-expanded={hintOpen}
        className="gap-1.5 rounded-none border-b border-border/40 bg-muted/30 px-3 py-2"
      >
        <Info className="text-git-branch" />
        <span className="font-medium">{t("worktree.whatAreWorktrees")}</span>
        {hintOpen ? (
          <ChevronDown className="ml-auto" />
        ) : (
          <ChevronRight className="ml-auto" />
        )}
      </ListRow>
      {hintOpen && (
        <div className="shrink-0 border-b border-border/40 bg-muted/20 px-3 py-2.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
          <p className="mb-1.5">{t("worktree.helpP1")}</p>
          <ul className="ml-3 list-disc space-y-1">
            <li>{t("worktree.helpLine1")}</li>
            <li>{t("worktree.helpLine2")}</li>
            <li>{t("worktree.helpLine3")}</li>
            <li>{t("worktree.helpLine4")}</li>
          </ul>
        </div>
      )}

      {(worktrees.length > 0 || query) && (
        <div className="shrink-0 space-y-1 px-3 pt-2">
          <Input
            type="search" inputSize="sm" value={query} spellCheck={false}
            aria-label={t("worktree.searchCatalog")} placeholder={t("worktree.searchCatalog")}
            onChange={event => onQueryChange(event.target.value)}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || !query) return;
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onQueryChange("");
              } else if (event.key === "Enter" && matches[0] && query.trim()) {
                event.preventDefault();
                onSelectPath(matches[0].path);
              }
            }}
          />
          {(query.trim() || matches.length > limit) && matches.length > 0 && (
            <p role="status" className="text-[0.6875rem] text-muted-foreground">
              {t("worktree.shownMatches", { shown: Math.min(limit, matches.length), total: matches.length })}
            </p>
          )}
        </div>
      )}
      <ScrollArea className="min-h-0 flex-1">
        <div ref={rowsRef} className="space-y-2 p-3">
          {loading && worktrees.length === 0 ? (
            <>
              <Skeleton className="h-[76px] w-full rounded-xl" />
              <Skeleton className="h-[76px] w-full rounded-xl" />
              <Skeleton className="h-[76px] w-full rounded-xl" />
            </>
          ) : emptyUnknown ? null : worktrees.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <GitFork className="h-10 w-10 opacity-20" />
              <span className="text-sm font-medium">{t("worktree.noneInRepoTitle")}</span>
              <span className="max-w-[220px] text-xs opacity-80">
                {t("worktree.noneInRepoBody")}
              </span>
            </div>
          ) : matches.length === 0 ? (
            <div className="grid justify-items-center gap-2 py-6 text-xs text-muted-foreground">
              <span role="status">{t("common.noResults")}</span>
              <Button variant="outline" size="sm" onClick={() => onQueryChange("")}>{t("cmdLog.resetFilter")}</Button>
            </div>
          ) : (
              matches.slice(0, limit).map((entry, i) => (
                <WorktreeCard
                  key={entry.path}
                  path={path}
                  entry={entry}
                  index={i}
                  selected={selectedPath === entry.path}
                  onSelect={() =>
                    onSelectPath(
                      selectedPath === entry.path ? null : entry.path,
                    )
                  }
                  onRequestMove={() => onRequestMove(entry)}
                  onRequestLock={() => onRequestLock(entry)}
                />
              ))
          )}
          {matches.length > limit && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => {
              nextFocus.current = matches[limit].path;
              onShowMore();
            }}>
              {t("blamePage.showMore")}
            </Button>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
