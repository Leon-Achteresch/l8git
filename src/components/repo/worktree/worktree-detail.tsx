import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type WorktreeEntry } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  Copy,
  FolderOpen,
  GitBranch,
  GitFork,
  Lock,
  LockOpen,
  Move,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

function pathParts(fullPath: string) {
  const segments = fullPath.replace(/\\/g, "/").split("/").filter(Boolean);
  const name = segments.pop() ?? fullPath;
  const parent = segments.length > 0 ? "/" + segments.join("/") + "/" : "/";
  return { name, parent };
}

export function WorktreeDetail({
  path,
  entry,
  onClose,
  onRequestMove,
  onRequestLock,
}: {
  path: string;
  entry: WorktreeEntry;
  onClose: () => void;
  onRequestMove: () => void;
  onRequestLock: () => void;
}) {
  const { t } = useTranslation();
  const worktreeRemove = useRepoStore((s) => s.worktreeRemove);
  const worktreeUnlock = useRepoStore((s) => s.worktreeUnlock);
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
      onClose();
    } catch (e) {
      const msg = String(e);
      if (/dirty|modified|changes/i.test(msg)) {
        const force = window.confirm(t("worktree.cardConfirmForceRemove"));
        if (force) {
          try {
            await worktreeRemove(path, entry.path, true);
            toast.success(t("worktree.cardToastRemovedForce"));
            onClose();
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

  return (
    <motion.div
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="flex h-full min-h-0 flex-col overflow-hidden border-l border-border/50 bg-card"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              entry.is_main
                ? "bg-primary/12 text-primary"
                : "bg-muted/70 text-[oklch(0.65_0.14_250)]",
            )}
          >
            <GitFork className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-[10px] text-muted-foreground/60">
              {parent}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t("dialogs.closeAria")}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="shrink-0 space-y-3 p-3">
        <InfoRow label={t("worktree.detailPathShort")}>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {entry.path}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(entry.path).catch(() => {});
                toast.success(t("worktree.cardPathCopied"));
              }}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={t("worktree.detailAriaCopyPath")}
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </InfoRow>

        {entry.branch && (
          <InfoRow label={t("worktree.detailBranchShort")}>
            <span className="flex items-center gap-1 text-[11px] font-medium text-[oklch(0.65_0.14_250)]">
              <GitBranch className="h-3 w-3" />
              {entry.branch}
            </span>
          </InfoRow>
        )}

        {entry.head && (
          <InfoRow label={t("worktree.detailHeadShort")}>
            <span className="font-mono text-[11px] text-muted-foreground">
              {entry.head}
            </span>
          </InfoRow>
        )}

        {entry.is_locked && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2 text-[11px]">
            <p className="font-semibold text-amber-600 dark:text-amber-400">
              {t("worktree.detailLockedHeading")}
            </p>
            {entry.lock_reason && (
              <p className="mt-0.5 text-muted-foreground">
                {entry.lock_reason}
              </p>
            )}
          </div>
        )}

        {entry.is_prunable && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/8 px-2.5 py-2 text-[11px]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <div>
              <p className="font-semibold text-destructive">{t("worktree.detailPrunableHeading")}</p>
              {entry.prunable_reason && (
                <p className="mt-0.5 text-muted-foreground">
                  {entry.prunable_reason}
                </p>
              )}
            </div>
          </div>
        )}

        {entry.is_main && (
          <div className="rounded-lg border border-primary/20 bg-primary/6 px-2.5 py-2 text-[11px] text-primary">
            {t("worktree.detailMainNoRemove")}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-1.5 px-3 pb-3">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t("worktree.detailActionsHeading")}
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() =>
            void invoke("reveal_repo_folder", { path: entry.path })
          }
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t("worktree.revealFinder")}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() =>
            void invoke("open_repo_terminal", {
              path: entry.path,
              useGitBash: false,
            })
          }
        >
          <Terminal className="h-3.5 w-3.5" />
          {t("worktree.openTerminal")}
        </Button>

        {!entry.is_main && (
          <>
            {!entry.is_locked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                disabled={busy}
                onClick={onRequestMove}
              >
                <Move className="h-3.5 w-3.5" />
                {t("worktree.cardMoveEllipsis")}
              </Button>
            )}

            {entry.is_locked ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                disabled={busy}
                onClick={() => void handleUnlock()}
              >
                <LockOpen className="h-3.5 w-3.5" />
                {t("worktree.cardUnlock")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                disabled={busy}
                onClick={onRequestLock}
              >
                <Lock className="h-3.5 w-3.5" />
                {t("worktree.cardLockEllipsis")}
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy}
              onClick={() => void handleRemove()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("worktree.remove")}
            </Button>
          </>
        )}
      </div>
    </motion.div>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-14 shrink-0 text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
