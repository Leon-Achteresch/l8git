import { Button } from "@/components/ui/button";
import { ChunkedList } from "@/components/ui/chunked-list";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StashEntry } from "@/lib/repo-store";
import { Archive, Loader2, Plus, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StashRow } from "./stash-row";
import { SpinIcon, StaggerItem } from "@/components/motion/kit";
import { WorkflowHelpLink } from '@/components/help/workflow-help-link';

// A row and its gap: three text lines, padding and space-y-0.5.
const STASH_ROW_REM = 4.5;

export function StashList({
  path,
  stashes,
  loading,
  selectedIndex,
  onSelectIndex,
  onRefresh,
  onOpenCreate,
  onOpenBranch,
  entered,
  onEntered,
}: {
  path: string;
  stashes: StashEntry[];
  loading: boolean;
  selectedIndex: number | null;
  onSelectIndex: (index: number) => void;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onOpenBranch: (index: number) => void;
  /** Kept by the parent: selecting a stash remounts this list in another layout. */
  entered: boolean;
  onEntered: () => void;
}) {
  const { t } = useTranslation();
  // Only rows of the first list render stagger in, not rows of chunks revealed while scrolling.
  // State, not a ref: rows of chunks revealed later must get the re-rendered props.
  const hasStashes = stashes.length > 0;
  useEffect(() => { if (hasStashes) onEntered(); }, [hasStashes, onEntered]);
  // The commit hash, not stash@{N}, so a new stash doesn't shift every row's identity;
  // a repeat suffix keeps keys unique if the same commit is stored twice.
  const seen = new Map<string, number>();
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
        <div className="p-2">
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
            // Chunks off screen skip style and layout; they render near the viewport or on focus.
            <ChunkedList as="div" className="" rowsClassName="space-y-0.5" gap="0.125rem" rowRem={STASH_ROW_REM}>
            {stashes.map((e, i) => {
              const repeat = seen.get(e.hash) ?? 0;
              seen.set(e.hash, repeat + 1);
              return (
              <StaggerItem key={repeat ? `${e.hash}:${repeat}` : e.hash} index={entered ? Number.POSITIVE_INFINITY : i}>
              <StashRow
                path={path}
                entry={e}
                selected={selectedIndex === e.index}
                onSelect={() => onSelectIndex(e.index)}
                onOpenBranch={() => onOpenBranch(e.index)}
              />
              </StaggerItem>
              );
            })}
            </ChunkedList>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
