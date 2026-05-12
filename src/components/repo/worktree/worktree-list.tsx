import { Button } from "@/components/ui/button";
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
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import { WorktreeCard } from "./worktree-card";

const EMPTY: WorktreeEntry[] = [];

export function WorktreeList({
  path,
  selectedPath,
  onSelectPath,
  onOpenAdd,
  onPrune,
  onRequestMove,
  onRequestLock,
}: {
  path: string;
  selectedPath: string | null;
  onSelectPath: (p: string | null) => void;
  onOpenAdd: () => void;
  onPrune: () => void;
  onRequestMove: (entry: WorktreeEntry) => void;
  onRequestLock: (entry: WorktreeEntry) => void;
}) {
  const worktrees = useRepoStore((s) => s.worktrees[path] ?? EMPTY);
  const loading = useRepoStore((s) => !!s.worktreesLoading[path]);
  const reloadWorktrees = useRepoStore((s) => s.reloadWorktrees);
  const worktreePrune = useRepoStore((s) => s.worktreePrune);
  const [hintOpen, setHintOpen] = useState(false);
  const [pruning, setPruning] = useState(false);

  const handlePrune = async () => {
    setPruning(true);
    try {
      const out = await worktreePrune(path);
      toast.success(out || "Bereinigt.");
      onPrune();
    } catch (e) {
      toastError(String(e));
    } finally {
      setPruning(false);
    }
  };

  const linkedCount = worktrees.length > 1 ? worktrees.length - 1 : 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[oklch(0.65_0.14_250_/_0.12)] text-[oklch(0.65_0.14_250)]">
            <GitFork className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight">
              Worktrees
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {worktrees.length === 0
                ? "Keine Einträge"
                : worktrees.length === 1
                  ? "1 Eintrag (main)"
                  : `${worktrees.length} Einträge · ${linkedCount} verlinkt`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                disabled={pruning || loading}
                onClick={() => void handlePrune()}
              >
                <Scissors className={`h-4 w-4 ${pruning ? "animate-pulse" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              Verwaiste Worktrees bereinigen (prune)
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
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">
              Worktree hinzufügen
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                disabled={loading}
                onClick={() => void reloadWorktrees(path)}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="text-xs">Aktualisieren</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Info hint */}
      <button
        type="button"
        onClick={() => setHintOpen((v) => !v)}
        className="flex shrink-0 items-center gap-1.5 border-b border-border/40 bg-muted/30 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/60"
      >
        <Info className="h-3.5 w-3.5 shrink-0 text-[oklch(0.65_0.14_250_/_0.7)]" />
        <span className="font-medium">Was sind Worktrees?</span>
        {hintOpen ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="ml-auto h-3.5 w-3.5" />
        )}
      </button>
      {hintOpen && (
        <div className="shrink-0 border-b border-border/40 bg-muted/20 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <p className="mb-1.5">
            <strong className="font-semibold text-foreground/80">
              Git Worktrees
            </strong>{" "}
            ermöglichen es, mehrere Branches desselben Repositories gleichzeitig in
            verschiedene Verzeichnisse auszuchecken — ohne Stash oder Branch-Wechsel.
          </p>
          <ul className="ml-3 list-disc space-y-1">
            <li>
              <strong>Main Worktree</strong> — das Hauptverzeichnis des Repositories
            </li>
            <li>
              <strong>Verlinkte Worktrees</strong> — zusätzliche Verzeichnisse mit
              eigenem Branch und HEAD
            </li>
            <li>
              <strong>Sperren</strong> — verhindert, dass{" "}
              <code className="rounded bg-muted px-0.5">git worktree prune</code>{" "}
              den Eintrag entfernt
            </li>
            <li>
              <strong>Prune</strong> — entfernt Metadaten zu nicht mehr existierenden
              Worktrees
            </li>
          </ul>
        </div>
      )}

      {/* List */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-3">
          {loading && worktrees.length === 0 ? (
            <>
              <Skeleton className="h-[76px] w-full rounded-xl" />
              <Skeleton className="h-[76px] w-full rounded-xl" />
              <Skeleton className="h-[76px] w-full rounded-xl" />
            </>
          ) : worktrees.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
              <GitFork className="h-10 w-10 opacity-20" />
              <span className="text-sm font-medium">Keine Worktrees</span>
              <span className="max-w-[220px] text-xs opacity-80">
                Dieses Repository hat keine verlinkten Worktrees. Erstelle
                einen über das + Icon oben.
              </span>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {worktrees.map((entry, i) => (
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
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
