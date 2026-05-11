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
  const worktreeRemove = useRepoStore((s) => s.worktreeRemove);
  const worktreeUnlock = useRepoStore((s) => s.worktreeUnlock);
  const [busy, setBusy] = useState(false);

  const { name, parent } = pathParts(entry.path);

  const handleRemove = async () => {
    const ok = window.confirm(`Worktree „${name}" entfernen?\n\n${entry.path}`);
    if (!ok) return;
    setBusy(true);
    try {
      await worktreeRemove(path, entry.path, false);
      toast.success("Worktree entfernt.");
      onClose();
    } catch (e) {
      const msg = String(e);
      if (/dirty|modified|changes/i.test(msg)) {
        const force = window.confirm(
          `Der Worktree enthält Änderungen. Trotzdem entfernen (force)?`,
        );
        if (force) {
          try {
            await worktreeRemove(path, entry.path, true);
            toast.success("Worktree entfernt (force).");
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
    const ok = window.confirm(`Worktree „${name}" entsperren?`);
    if (!ok) return;
    setBusy(true);
    try {
      await worktreeUnlock(path, entry.path);
      toast.success("Worktree entsperrt.");
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
      {/* Header */}
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
          aria-label="Schließen"
          className="shrink-0"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Info block */}
      <div className="shrink-0 space-y-3 p-3">
        <InfoRow label="Pfad">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
              {entry.path}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(entry.path).catch(() => {});
                toast.success("Pfad kopiert.");
              }}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Pfad kopieren"
            >
              <Copy className="h-3 w-3" />
            </button>
          </div>
        </InfoRow>

        {entry.branch && (
          <InfoRow label="Branch">
            <span className="flex items-center gap-1 text-[11px] font-medium text-[oklch(0.65_0.14_250)]">
              <GitBranch className="h-3 w-3" />
              {entry.branch}
            </span>
          </InfoRow>
        )}

        {entry.head && (
          <InfoRow label="HEAD">
            <span className="font-mono text-[11px] text-muted-foreground">
              {entry.head}
            </span>
          </InfoRow>
        )}

        {entry.is_locked && (
          <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 px-2.5 py-2 text-[11px]">
            <p className="font-semibold text-amber-600 dark:text-amber-400">
              Gesperrt
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
              <p className="font-semibold text-destructive">Prunable</p>
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
            Haupt-Worktree — kann nicht entfernt werden.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="shrink-0 space-y-1.5 px-3 pb-3">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Aktionen
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
          Im Finder öffnen
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
          In Terminal öffnen
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
                Verschieben …
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
                Entsperren
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
                Sperren …
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
              Entfernen
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
