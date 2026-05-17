import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { useRepoStore } from "@/lib/repo-store";
import { cn } from "@/lib/utils";
import { AlertTriangle, FastForward, SkipForward, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

export function CherryPickStatusBanner({ path }: { path: string }) {
  const { t } = useTranslation();
  const state = useRepoStore((s) => s.cherryPickState[path]);
  const statusEntries = useRepoStore((s) => s.status[path]);

  const [busy, setBusy] = useState<null | "continue" | "skip" | "abort">(null);
  const [abortArmed, setAbortArmed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    void useRepoStore.getState().reloadCherryPickState(path);
  }, [path]);

  if (!state?.in_progress) return null;

  const headShort = state.head ? state.head.slice(0, 7) : "?";
  const conflicts = state.conflicted_paths;
  const hasUnstagedConflicts = (statusEntries ?? []).some(
    (e) => e.worktree_status === "U" || e.index_status === "U",
  );
  const continueDisabled =
    busy !== null || (conflicts.length > 0 && hasUnstagedConflicts);

  async function run(
    kind: "continue" | "skip" | "abort",
    fn: () => Promise<string>,
    successMsg: string,
  ) {
    setBusy(kind);
    try {
      const out = await fn();
      toast.success(out.trim() || successMsg);
    } catch (err) {
      toastError(String(err));
    } finally {
      setBusy(null);
      setAbortArmed(false);
    }
  }

  const store = useRepoStore.getState();
  const conflictLabel =
    conflicts.length === 1
      ? t("cherryPick.conflict_one", { count: conflicts.length })
      : t("cherryPick.conflict_other", { count: conflicts.length });

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm",
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <span className="font-medium">
          {t("cherryPick.pausedAt")}{" "}
          <code className="rounded bg-amber-500/20 px-1 py-0.5 font-mono text-xs">
            {headShort}
          </code>
        </span>
        {conflicts.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
          >
            {conflictLabel}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{t("cherryPick.noConflicts")}</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() =>
              void run(
                "continue",
                () => store.cherryPickContinue(path),
                t("cherryPick.continueToast"),
              )
            }
            disabled={continueDisabled}
            title={
              continueDisabled && conflicts.length > 0 ? t("cherryPick.stashHint") : undefined
            }
          >
            <FastForward className="h-3.5 w-3.5" />
            {busy === "continue" ? t("editRemote.saveBusy") : t("cherryPick.continueVerb")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              void run(
                "skip",
                () => store.cherryPickSkip(path),
                t("cherryPick.skipToast"),
              )
            }
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
              onClick={() =>
                void run(
                  "abort",
                  () => store.cherryPickAbort(path),
                  t("cherryPick.abortToast"),
                )
              }
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
      {expanded && conflicts.length > 0 ? (
        <ul className="grid gap-0.5 rounded-md border border-amber-500/30 bg-background/60 p-2 font-mono text-xs">
          {conflicts.map((p) => (
            <li key={p} className="truncate" title={p}>
              {p}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}