import { UnifiedDiffBody } from "@/components/repo/commit/unified-diff-body";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatBackendError } from "@/lib/backend-error";
import { invoke } from "@/lib/platform/ipc";
import type { SubmodulePinDiff, SubmodulePins } from "@/lib/submodule-pin-diff";
import { FileDiff } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export function SubmodulePinDiffDialog({ path, submodulePath, pins }: {
  path: string;
  submodulePath: string;
  pins: SubmodulePins;
}) {
  const { t } = useTranslation();
  const { before, after } = pins;
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<SubmodulePinDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void invoke<SubmodulePinDiff>("git_submodule_pin_diff", { path, submodulePath, before, after }).then(
      (value) => { if (active) setResult(value); },
      (failure: unknown) => { if (active) setError(formatBackendError(failure)); },
    );
    return () => { active = false; };
  }, [open, attempt, path, submodulePath, before, after]);

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (next) {
        setResult(null);
        setError(null);
      }
      setOpen(next);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <FileDiff className="size-4" aria-hidden />
          {t("submodule.comparePins")}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[min(78dvh,44rem)] max-w-[min(calc(100%-2rem),64rem)] flex-col gap-3 overflow-hidden sm:max-w-[min(calc(100%-2rem),64rem)]">
        <DialogHeader className="shrink-0 pr-8">
          <DialogTitle>{t("submodule.comparePins")}</DialogTitle>
          <DialogDescription className="break-all font-mono">{submodulePath}</DialogDescription>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
            <code className="break-all">{before}</code>
            <span>→</span>
            <code className="break-all">{after}</code>
          </div>
        </DialogHeader>
        {error ? (
          <div className="min-h-0 flex-1 space-y-3 overflow-auto rounded-md border border-border p-3">
            <p role="alert" className="break-words text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={() => {
              setError(null);
              setAttempt((value) => value + 1);
            }}>{t("common.retry")}</Button>
          </div>
        ) : result?.status === "samePin" ? (
          <p role="status" className="rounded-md border border-border p-3 text-muted-foreground">
            {t("submodule.samePin")}
          </p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
            {result?.truncated && <p role="status" className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              {t("diffView.truncated")}
            </p>}
            <div className="min-h-0 flex-1">
              <UnifiedDiffBody
                loading={!result}
                failed={false}
                isBinary={false}
                unifiedText={result?.patch ?? null}
                untrackedPlain={null}
                emptyHint={t("submodule.sameContents")}
                failedHint={t("diff.diffLoadFailedFallback")}
                lineNumbers
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
