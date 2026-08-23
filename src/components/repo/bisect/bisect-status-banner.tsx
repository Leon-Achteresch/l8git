import { Button } from "@/components/ui/button";
import { useRepoStore } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { AlertTriangle, CheckCircle2, CircleDot, RotateCcw, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PulseIcon } from "@/components/motion/kit";

export function BisectStatusBanner({ path }: { path: string }) {
  const { t } = useTranslation();
  const bisect = useRepoStore(s => s.bisect[path]);
  const bisectReset = useRepoStore(s => s.bisectReset);
  const bisectVisible = useUiStore(s => s.bisectVisible);
  const bisectPending = useUiStore(s => s.bisectPending[path]);

  if (!bisectVisible) return null;

  const hasPendingBad = !!bisectPending?.bad;
  const hasPendingGood = !!bisectPending?.good;
  const showPending = !bisect?.active && (hasPendingBad || hasPendingGood);

  if (!bisect?.active && !showPending) return null;

  async function handleReset() {
    try {
      await bisectReset(path);
      toast.success(t("bisect.ended"));
    } catch {}
  }

  if (bisect?.done) {
    return (
      <div className="flex items-center gap-2 border-b border-git-modified/30 bg-git-modified/10 px-3 py-2 text-xs">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-git-modified" />
        <span className="font-medium text-git-modified">{t("bisect.foundBad")}</span>
        <code className="font-mono text-git-modified">
          {bisect.result_hash?.slice(0, 8)}
        </code>
        {bisect.result_subject && (
          <span className="min-w-0 flex-1 truncate text-git-modified/80">
            {bisect.result_subject}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 gap-1 px-2 text-xs text-git-modified hover:bg-git-modified/15 hover:text-git-modified"
          onClick={() => void handleReset()}
        >
          <RotateCcw className="h-3 w-3" />
          {t("bisect.finish")}
        </Button>
      </div>
    );
  }

  if (bisect?.active) {
    const n = bisect.steps_remaining ?? 0;
    const stepsHint =
      bisect.steps_remaining != null
        ? n === 1
          ? t("bisect.stepsOne", { count: n })
          : t("bisect.stepsOther", { count: n })
        : "";
    return (
      <div className="flex items-center gap-2 border-b border-git-branch/30 bg-git-branch/10 px-3 py-2 text-xs">
        <PulseIcon icon={CircleDot} className="h-3.5 w-3.5 shrink-0 text-git-branch" />
        <span className="font-medium text-git-branch">{t("bisect.running")}</span>
        {stepsHint !== "" ? (
          <span className="text-git-branch/70">{stepsHint}</span>
        ) : null}
        {bisect.current_subject && (
          <span className="min-w-0 flex-1 truncate text-git-branch/70">
            · {bisect.current_subject}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 gap-1 px-2 text-xs text-git-branch hover:bg-git-branch/15 hover:text-git-branch"
          onClick={() => void handleReset()}
        >
          <RotateCcw className="h-3 w-3" />
          {t("bisect.finish")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
      {hasPendingBad ? (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-git-removed" />
      ) : (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-git-added" />
      )}
      <span className="text-muted-foreground">
        {t("bisect.pendingPrefix")}{" "}
        {hasPendingBad && !hasPendingGood ? t("bisect.pendingBad") : t("bisect.pendingGood")}
      </span>
    </div>
  );
}
