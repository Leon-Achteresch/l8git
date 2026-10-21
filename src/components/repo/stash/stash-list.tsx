import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StashEntry } from "@/lib/repo-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, Loader2, Plus, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StashRow } from "./stash-row";
import { SpinIcon, StaggerItem } from "@/components/motion/kit";
import { WorkflowHelpLink } from '@/components/help/workflow-help-link';

export function StashList({
  path,
  stashes,
  loading,
  selectedIndex,
  onSelectIndex,
  onRefresh,
  onOpenCreate,
  onOpenBranch,
}: {
  path: string;
  stashes: StashEntry[];
  loading: boolean;
  selectedIndex: number | null;
  onSelectIndex: (index: number) => void;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onOpenBranch: (index: number) => void;
}) {
  const { t } = useTranslation();
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    setScroller(node?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null);
  }, []);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Archive className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              {t("stash.listTitle")}
            </h2>
            <p className="text-[0.6875rem] text-muted-foreground">
              {t("stash.entries", { count: stashes.length })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <WorkflowHelpLink guideId="stash-work" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8"
            title={t("stash.createAria")}
            aria-label={t("stash.createAria")}
            onClick={() => onOpenCreate()}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8"
            title={t("worktree.reloadTooltip")}
            aria-label={t("worktree.reloadTooltip")}
            disabled={loading}
            onClick={() => onRefresh()}
          >
            <SpinIcon icon={RefreshCw} active={loading} 
              className={`h-4 w-4`}
            />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div ref={contentRef} className="p-2">
          {loading && stashes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <SpinIcon icon={Loader2} className="h-8 w-8 opacity-40" />
              <span className="text-sm font-medium">{t("stash.loading")}</span>
            </div>
          ) : stashes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <Archive className="h-10 w-10 opacity-20" />
              <span className="text-sm font-medium">{t("stash.none")}</span>
              <span className="max-w-[240px] text-xs opacity-80">
                {t("stash.emptyHint")}
              </span>
            </div>
          ) : (
            <StashVirtualRows
              scroller={scroller}
              path={path}
              stashes={stashes}
              selectedIndex={selectedIndex}
              onSelectIndex={onSelectIndex}
              onOpenBranch={onOpenBranch}
            />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function StashVirtualRows({
  scroller,
  path,
  stashes,
  selectedIndex,
  onSelectIndex,
  onOpenBranch,
}: {
  scroller: HTMLElement | null;
  path: string;
  stashes: StashEntry[];
  selectedIndex: number | null;
  onSelectIndex: (index: number) => void;
  onOpenBranch: (index: number) => void;
}) {
  const virtualizer = useVirtualizer({
    count: stashes.length,
    getScrollElement: () => scroller,
    estimateSize: () => 72,
    overscan: 4,
    getItemKey: (i) => stashes[i]?.refname ?? i,
  });
  const items = virtualizer.getVirtualItems();
  // Only the rows shown when the list appears stagger in, not rows scrolled into view later.
  // The first pass has no scroll element yet, so it renders no rows.
  const [entered, setEntered] = useState(false);
  const shown = items.length > 0;
  useEffect(() => { if (shown) setEntered(true); }, [shown]);
  return (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {items.map((vi) => {
        const e = stashes[vi.index];
        if (!e) return null;
        return (
          <div
            key={vi.key}
            data-index={vi.index}
            ref={virtualizer.measureElement}
            className={vi.index < stashes.length - 1 ? "pb-0.5" : undefined}
            style={{ position: "absolute", top: 0, left: 0, right: 0, transform: `translateY(${vi.start}px)` }}
          >
            <StaggerItem index={entered ? Number.POSITIVE_INFINITY : vi.index}>
              <StashRow
                path={path}
                entry={e}
                selected={selectedIndex === e.index}
                onSelect={() => onSelectIndex(e.index)}
                onOpenBranch={() => onOpenBranch(e.index)}
              />
            </StaggerItem>
          </div>
        );
      })}
    </div>
  );
}
