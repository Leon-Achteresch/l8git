import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { amAbort, amContinue, amSkip, reloadAmState, usePatchStore } from "@/lib/patches";
import { useRepoStore } from "@/lib/repo-store";
import { AlertTriangle, FastForward, SkipForward, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** Shows a stopped `git am` with continue, skip and abort, like the cherry-pick banner. */
export function AmStatusBanner({ path }: { path: string }) {
  const { t } = useTranslation();
  const state = usePatchStore((s) => s.amState[path]);
  // Status reloads after every change in the repo; re-read the am state with it.
  const statusEntries = useRepoStore((s) => s.status[path]);
  const [busy, setBusy] = useState<null | "continue" | "skip" | "abort">(null);
  const [abortArmed, setAbortArmed] = useState(false);

  useEffect(() => {
    void reloadAmState(path);
  }, [path, statusEntries]);

  if (!state?.in_progress) return null;

  const conflicts = state.conflicted_paths;
  const hasUnstagedConflicts = (statusEntries ?? []).some(
    (e) => e.worktree_status === "U" || e.index_status === "U",
  );

  async function run(kind: "continue" | "skip" | "abort", fn: (path: string) => Promise<string>, successMsg: string) {
    setBusy(kind);
    try {
      const out = await fn(path);
      toast.success(out.trim() || successMsg);
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(null);
      setAbortArmed(false);
    }
  }

  return (
    <div
      className="flex flex-col gap-2 border-b border-git-modified/40 bg-git-modified/10 px-4 py-3 text-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-git-modified" />
        <span className="font-medium">
          {state.step && state.total
            ? t("patches.amPausedStep", { step: state.step, total: state.total })
            : t("patches.amPaused")}
        </span>
        {state.subject ? <span className="truncate text-xs text-muted-foreground">{state.subject}</span> : null}
        <span className="text-xs text-muted-foreground">
          {conflicts.length === 0
            ? t("cherryPick.noConflicts")
            : conflicts.length === 1
              ? t("cherryPick.conflict_one", { count: 1 })
              : t("cherryPick.conflict_other", { count: conflicts.length })}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void run("continue", amContinue, t("patches.amContinueToast"))}
            disabled={busy !== null || (conflicts.length > 0 && hasUnstagedConflicts)}
            title={conflicts.length > 0 ? t("cherryPick.stashHint") : undefined}
          >
            <FastForward className="h-3.5 w-3.5" />
            {busy === "continue" ? t("editRemote.saveBusy") : t("cherryPick.continueVerb")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void run("skip", amSkip, t("patches.amSkipToast"))}
            disabled={busy !== null}
          >
            <SkipForward className="h-3.5 w-3.5" />
            {busy === "skip" ? t("editRemote.saveBusy") : t("cherryPick.skipVerb")}
          </Button>
          {abortArmed ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void run("abort", amAbort, t("patches.amAbortToast"))}
              disabled={busy !== null}
            >
              <X className="h-3.5 w-3.5" />
              {busy === "abort" ? t("editRemote.saveBusy") : t("cherryPick.abortConfirm")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAbortArmed(true)}
              disabled={busy !== null}
              className="text-destructive hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
              {t("cherryPick.abortVerb")}
            </Button>
          )}
        </div>
      </div>
      {conflicts.length > 0 ? (
        <ul className="grid gap-0.5 rounded-md border border-git-modified/30 bg-background/60 p-2 font-mono text-xs">
          {conflicts.map((p) => (
            <li key={p} className="truncate" title={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
