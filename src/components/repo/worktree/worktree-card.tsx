import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type WorktreeEntry } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import {
  Copy,
  FolderOpen,
  GitBranch,
  GitFork,
  Lock,
  LockOpen,
  Scissors,
  Terminal,
  Trash2,
  Move,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { WorktreeStatusBadge } from "./worktree-status-badge";

function pathParts(fullPath: string) {
  const segments = fullPath.replace(/\\/g, "/").split("/").filter(Boolean);
  const name = segments.pop() ?? fullPath;
  const parent = segments.length > 0 ? "/" + segments.join("/") : "";
  return { name, parent };
}

export function WorktreeCard({
  path,
  entry,
  index,
  selected,
  onSelect,
  onRequestMove,
  onRequestLock,
}: {
  path: string;
  entry: WorktreeEntry;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onRequestMove: () => void;
  onRequestLock: () => void;
}) {
  const { t } = useTranslation();
  const worktreeRemove = useRepoStore((s) => s.worktreeRemove);
  const worktreeUnlock = useRepoStore((s) => s.worktreeUnlock);
  const worktreePrune = useRepoStore((s) => s.worktreePrune);
  const [busy, setBusy] = useState(false);

  const { name, parent } = pathParts(entry.path);

  const handleRemove = async () => {
    const ok = window.confirm(
      t("worktree.cardConfirmRemove", { name, path: entry.path }),
    );
    if (!ok) return;
    setBusy(true);
    try {
      await worktreeRemove(path, entry.path, false);
      toast.success(t("worktree.cardToastRemoved"));
    } catch (e) {
      const msg = String(e);
      if (/dirty|modified|changes/i.test(msg)) {
        const force = window.confirm(t("worktree.cardConfirmForceRemove"));
        if (force) {
          try {
            await worktreeRemove(path, entry.path, true);
            toast.success(t("worktree.cardToastRemovedForce"));
          } catch (e2) {
            toastError(String(e2));
          }
        }
      } else {
        toastError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    const ok = window.confirm(t("worktree.cardConfirmUnlock", { name }));
    if (!ok) return;
    setBusy(true);
    try {
      await worktreeUnlock(path, entry.path);
      toast.success(t("worktree.cardToastUnlocked"));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handlePrune = async () => {
    setBusy(true);
    try {
      const out = await worktreePrune(path);
      toast.success(out || t("worktree.cardPrunedFallback"));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const inner = (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.96, filter: "blur(4px)" }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 28,
        mass: 0.8,
        delay: index * 0.04,
        filter: { duration: 0.2 },
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={busy}
        className={cn(
          "group relative w-full cursor-pointer overflow-hidden rounded-xl border text-left transition-all duration-150",
          "px-3.5 py-3",
          selected
            ? "border-primary/30 bg-primary/8 shadow-sm ring-1 ring-primary/20"
            : "border-border/60 bg-card shadow-xs hover:border-border hover:shadow-sm",
          entry.is_locked && !selected && "border-l-2 border-l-amber-500/60",
          entry.is_prunable && !selected && "opacity-70",
          entry.is_main &&
            !selected &&
            "bg-[oklch(0.65_0.14_250_/_0.04)] ring-1 ring-[oklch(0.65_0.14_250_/_0.15)]",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              entry.is_main
                ? "bg-primary/12 text-primary"
                : "bg-muted/70 text-[oklch(0.65_0.14_250)]",
            )}
          >
            <GitFork className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-semibold text-foreground/90 text-sm">
                {name}
              </span>
              <WorktreeStatusBadge entry={entry} />
            </div>

            {parent && (
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">
                {parent}
              </p>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
              {entry.branch ? (
                <span className="flex items-center gap-1 text-[11px] font-medium text-[oklch(0.65_0.14_250)]">
                  <GitBranch className="h-3 w-3" />
                  {entry.branch}
                </span>
              ) : (
                <span className="text-[11px] italic text-muted-foreground/60">
                  {t("worktree.detachedHead")}
                </span>
              )}
              {entry.head && (
                <span className="font-mono text-[10px] text-muted-foreground/50">
                  {entry.head}
                </span>
              )}
            </div>
          </div>
        </div>
      </button>
    </motion.div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem
          onSelect={() => void invoke("reveal_repo_folder", { path: entry.path })}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t("worktree.revealFinder")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() =>
            void invoke("open_repo_terminal", {
              path: entry.path,
              useGitBash: false,
            })
          }
        >
          <Terminal className="h-3.5 w-3.5" />
          {t("worktree.openTerminal")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            navigator.clipboard.writeText(entry.path).catch(() => {});
            toast.success(t("worktree.cardPathCopied"));
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {t("worktree.cardCopyPath")}
        </ContextMenuItem>

        {!entry.is_main && (
          <>
            <ContextMenuSeparator />
            {!entry.is_locked && (
              <ContextMenuItem onSelect={onRequestMove}>
                <Move className="h-3.5 w-3.5" />
                {t("worktree.cardMoveEllipsis")}
              </ContextMenuItem>
            )}
            {entry.is_locked ? (
              <ContextMenuItem onSelect={() => void handleUnlock()}>
                <LockOpen className="h-3.5 w-3.5" />
                {t("worktree.cardUnlock")}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={onRequestLock}>
                <Lock className="h-3.5 w-3.5" />
                {t("worktree.cardLockEllipsis")}
              </ContextMenuItem>
            )}
            {entry.is_prunable && (
              <ContextMenuItem onSelect={() => void handlePrune()}>
                <Scissors className="h-3.5 w-3.5" />
                {t("worktree.cardPrune")}
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem
              variant="destructive"
              disabled={busy}
              onSelect={() => void handleRemove()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("worktree.remove")}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
