import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { StashEntry } from "@/lib/repo-store";
import { Archive, Loader2, Plus, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StashRow } from "./stash-row";

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
            <p className="text-[11px] text-muted-foreground">
              {t("stash.entries", { count: stashes.length })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2">
          {loading && stashes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin opacity-40" />
              <span className="text-sm font-medium">{t("stash.loading")}</span>
            </div>
          ) : stashes.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <Archive className="h-10 w-10 opacity-20" />
              <span className="text-sm font-medium">{t("stash.none")}</span>
              <span className="max-w-[220px] text-xs opacity-80">
                {t("stash.pickHint")}
              </span>
            </div>
          ) : (
            stashes.map((e) => (
              <StashRow
                key={e.refname}
                path={path}
                entry={e}
                selected={selectedIndex === e.index}
                onSelect={() => onSelectIndex(e.index)}
                onOpenBranch={() => onOpenBranch(e.index)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
