import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type GitHookEntry } from "@/lib/repo-store";
import { Eye, EyeOff, Loader2, Save, Trash2, Webhook, X } from "lucide-react";
import { motion } from "motion/react";
import { Suspense, lazy, useState } from "react";
import { toast } from "sonner";
import { HOOK_DESCRIPTIONS } from "./git-hooks-card";
import { GitHookStatusBadge } from "./git-hooks-status-badge";

const LazyGitHookEditor = lazy(() =>
  import("./git-hook-editor").then((m) => ({ default: m.GitHookEditor })),
);

export const HOOK_CAN_ABORT = new Set([
  "pre-commit",
  "commit-msg",
  "pre-merge-commit",
  "applypatch-msg",
  "pre-applypatch",
  "pre-rebase",
  "pre-push",
  "pre-receive",
  "update",
]);

const SERVER_HOOKS = new Set([
  "pre-receive",
  "update",
  "proc-receive",
  "post-receive",
  "post-update",
  "push-to-checkout",
]);

export function GitHooksDetail({
  path,
  entry,
  editorContent,
  onEditorChange,
  onClose,
}: {
  path: string;
  entry: GitHookEntry;
  editorContent: string;
  onEditorChange: (val: string) => void;
  onClose: () => void;
}) {
  const saveGitHook = useRepoStore((s) => s.saveGitHook);
  const deleteGitHook = useRepoStore((s) => s.deleteGitHook);
  const toggleGitHook = useRepoStore((s) => s.toggleGitHook);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  const isServer = SERVER_HOOKS.has(entry.name);
  const canAbort = HOOK_CAN_ABORT.has(entry.name);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveGitHook(path, entry.name, editorContent);
      toast.success(`Hook "${entry.name}" gespeichert.`);
    } catch (e) {
      toastError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm(
      `Hook "${entry.name}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteGitHook(path, entry.name);
      toast.success(`Hook "${entry.name}" gelöscht.`);
      onClose();
    } catch (e) {
      toastError(String(e));
    } finally {
      setDeleting(false);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      await toggleGitHook(path, entry.name, !entry.is_enabled);
      toast.success(
        entry.is_enabled
          ? `Hook "${entry.name}" deaktiviert.`
          : `Hook "${entry.name}" aktiviert.`,
      );
    } catch (e) {
      toastError(String(e));
    } finally {
      setToggling(false);
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
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted/60">
            <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-[12px] font-semibold leading-none">
              {entry.name}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground/60">
              {HOOK_DESCRIPTIONS[entry.name] ?? "Git-Hook"}
            </p>
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={onClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Schließen</TooltipContent>
        </Tooltip>
      </div>

      {/* Meta bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <GitHookStatusBadge entry={entry} isServer={isServer} />
        {canAbort && (
          <span className="inline-flex items-center rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
            Kann abbrechen
          </span>
        )}
        {entry.exists && !isServer && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-6 gap-1 px-2 text-[11px]"
            disabled={toggling}
            onClick={() => void handleToggle()}
          >
            {entry.is_enabled ? (
              <>
                <EyeOff className="h-3 w-3" />
                Deaktivieren
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                Aktivieren
              </>
            )}
          </Button>
        )}
      </div>

      {/* Monaco editor */}
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <LazyGitHookEditor
            value={editorContent}
            onChange={onEditorChange}
            readOnly={isServer}
          />
        </Suspense>
      </div>

      {/* Footer */}
      {!isServer && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
          {entry.exists && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-destructive/30 px-2.5 text-[11px] text-destructive hover:bg-destructive/10"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              <Trash2 className="h-3 w-3" />
              Löschen
            </Button>
          )}
          <Button
            size="sm"
            className="ml-auto h-7 gap-1.5 px-2.5 text-[11px]"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            Speichern
          </Button>
        </div>
      )}
    </motion.div>
  );
}
