import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, Loader2, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SpinIcon } from "@/components/motion/kit";
import { discardFileTotals, discardPlanVerified, type DiscardPlan } from "@/lib/commit-actions";

export function CommitDiscardDialog({ plan, busy, error, onClose, onConfirm, onStash, onRefresh }: {
  plan: DiscardPlan | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (plan: DiscardPlan) => void;
  onStash: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [included, setIncluded] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => setIncluded(new Set(plan?.files.map((file) => file.path) ?? [])), [plan]);
  const selected = plan?.files.filter((file) => included.has(file.path)) ?? [];
  const deletesNewFiles = selected.some((file) => file.entry.untracked);

  return (
    <AlertDialog open={plan !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <AlertDialogContent className="max-h-[85vh] sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("commitPanel.discardDialogTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("commitActions.discardDescription", { count: selected.length })}</AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-[0.6875rem] text-muted-foreground">{t("commitActions.discardScopeHint")}</p>
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
          {plan?.files.map((file) => {
            const totals = discardFileTotals(file);
            return <li key={file.path}>
              <label className="flex cursor-pointer items-start gap-2 rounded-md px-1 py-1.5 hover:bg-muted/40">
                <Checkbox checked={included.has(file.path)} disabled={busy} aria-label={t("commitActions.includeDiscardFile", { path: file.path })} onCheckedChange={(checked) => setIncluded((previous) => {
                  const next = new Set(previous); if (checked === true) next.add(file.path); else next.delete(file.path); return next;
                })} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block break-all font-mono text-xs">{file.path}</span>
                  <span className="text-[0.6875rem] text-muted-foreground">{t(file.entry.untracked ? "commitActions.deleteNewFile" : file.scope === "all" ? "commitActions.discardAllFile" : file.entry.staged ? "commitActions.discardKeepStaged" : "commitActions.discardWorktreeFile")}</span>
                </span>
                {file.entry.binary ? <span className="text-[0.625rem] text-muted-foreground">{t("agentReview.binary")}</span> : <span className="shrink-0 font-mono text-[0.625rem] tabular-nums"><span className="text-git-added">+{totals.additions}</span> <span className="text-git-removed">−{totals.deletions}</span></span>}
              </label>
              {file.diff && !file.diff.is_binary ? <details className="mb-1 ml-7 rounded border border-border/40 px-2 py-1">
                <summary className="cursor-pointer text-[0.6875rem] text-muted-foreground">{t("commitActions.previewChanges")}</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre font-mono text-[0.625rem] text-muted-foreground">{[
                  ...(file.scope === "all" && file.diff.staged ? [t("commitPanel.sectorStaged"), file.diff.staged] : []),
                  ...(file.diff.unstaged ? [t("commitPanel.sectorUnstaged"), file.diff.unstaged] : []),
                  ...(file.diff.untracked_plain ? [file.diff.untracked_plain] : []),
                ].join("\n").slice(0, 12000)}</pre>
              </details> : null}
            </li>;
          })}
        </ul>
        {deletesNewFiles ? <p className="flex items-start gap-1.5 text-xs text-destructive"><Trash2 className="mt-px size-3.5 shrink-0" />{t("commitActions.newFilesWarning")}</p> : null}
        {error ? <p role="alert" className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">{error}</p> : null}
        <AlertDialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={error ? onRefresh : onStash}>
            {!error && <Archive className="size-3.5" />}{t(error ? "commitActions.refreshPreview" : "commitActions.stashInstead")}
          </Button>
          <span className="flex items-center gap-2">
            <AlertDialogCancel size="sm" disabled={busy}>{t("common.cancel")}</AlertDialogCancel>
            <Button type="button" variant="destructive" size="sm" disabled={busy || !plan || !discardPlanVerified({ ...plan, files: selected }) || !!error} onClick={() => plan && onConfirm({ ...plan, files: selected })}>
              {busy && <SpinIcon icon={Loader2} className="size-3.5" />}{t("commitPanel.discardVerb")}
            </Button>
          </span>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
