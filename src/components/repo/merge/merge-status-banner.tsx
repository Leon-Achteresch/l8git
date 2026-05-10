import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { AlertTriangle, GitMerge, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function MergeStatusBanner({ path }: { path: string }) {
  const openMergeEditor = useUiStore((s) => s.openMergeEditor);
  const state = useRepoStore((s) => s.mergeState[path]);
  const [busy, setBusy] = useState(false);
  const [abortArmed, setAbortArmed] = useState(false);

  useEffect(() => {
    void useRepoStore.getState().reloadMergeState(path);
  }, [path]);

  if (!state?.in_progress) return null;

  const conflicts = state.conflicted_paths;
  const conflictLabel =
    conflicts.length === 1 ? "1 Konflikt" : `${conflicts.length} Konflikte`;

  async function handleAbort() {
    setBusy(true);
    try {
      const out = await useRepoStore.getState().mergeAbort(path);
      toast.success(out.trim() || "Merge abgebrochen.");
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(false);
      setAbortArmed(false);
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-blue-500/40 bg-blue-500/10 px-4 py-3 text-sm",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <GitMerge className="h-4 w-4 text-blue-500" />
        <span className="font-medium">Merge unterbrochen</span>
        {conflicts.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-500" />
            {conflictLabel}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            Keine offenen Konflikte
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {conflicts.length > 0 && (
            <Button
              type="button"
              size="sm"
              onClick={() => openMergeEditor(path)}
              disabled={busy}
            >
              <GitMerge className="mr-1 h-3.5 w-3.5" />
              Konflikte auflösen
            </Button>
          )}
          {abortArmed ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void handleAbort()}
              disabled={busy}
            >
              <X className="h-3.5 w-3.5" />
              {busy ? "…" : "Wirklich abbrechen"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAbortArmed(true)}
              disabled={busy}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
              Abort
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
