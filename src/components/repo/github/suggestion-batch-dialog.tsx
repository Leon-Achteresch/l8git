import { UnifiedDiffBody } from "@/components/repo/commit/unified-diff-body";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError } from "@/lib/error-toast";
import type { ReviewThread } from "@/lib/github-expansion/api";
import { applySuggestionPlan, previewSuggestions, type SelectedSuggestion, type SuggestionPlan } from "@/lib/github-expansion/suggestions";
import { collectCandidates, findOverlaps, hasPartialComments, planUnifiedDiff, staleSuggestions, toSelected, type BatchCandidate } from "@/lib/github-ui/suggestion-batch";
import { invoke } from "@/lib/platform/ipc";
import { useRepoStore } from "@/lib/repo-store";
import { parseUnifiedDiff } from "@/lib/unified-diff";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

type Preview = { plan: SuggestionPlan | null; stale: Map<string, string> };

/**
 * ID 18: select remote GitHub suggestions, preview the exact per-file plan against the local working tree,
 * then apply only after explicit confirmation. Never resolves threads.
 */
export function SuggestionBatchDialog({ open, onOpenChange, path, headSha, headRef, branchCheckedOut, threads, threadsTruncated, loadPatch }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  headSha: string;
  headRef: string;
  branchCheckedOut: boolean;
  threads: Map<string, ReviewThread> | null;
  threadsTruncated: boolean;
  loadPatch: (file: string) => Promise<string>;
}) {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState<BatchCandidate[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCandidates(null); setSelected(new Set()); setPreview(null); setConfirmed(false);
    if (!open || !threads) return;
    let live = true;
    const withSuggestions = [...threads.values()].filter((th) => th.comments.nodes.some((c) => /```+\s*suggestion/i.test(c.body)));
    const files = [...new Set(withSuggestions.map((th) => th.path))];
    void Promise.all(files.map((f) => loadPatch(f).then((p) => [f, parseUnifiedDiff(p)] as const, () => [f, null] as const))).then((entries) => {
      if (!live) return;
      const byFile = new Map(entries);
      setCandidates(collectCandidates(withSuggestions, (f) => byFile.get(f) ?? null));
    });
    return () => { live = false; };
  }, [open, threads, headSha, loadPatch]);

  const chosen = useMemo<SelectedSuggestion[]>(() => (candidates ?? []).filter((c) => selected.has(c.id) && !c.rejection).map(toSelected), [candidates, selected]);
  const overlaps = useMemo(() => findOverlaps(chosen), [chosen]);
  const fullHead = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(headSha);
  const blocked = !branchCheckedOut ? t("suggestionBatch.wrongBranch", { branch: headRef }) : !fullHead ? t("suggestionBatch.noHead") : overlaps.size ? t("suggestionBatch.overlapBlocked") : null;

  const toggle = (id: string) => {
    setPreview(null); setConfirmed(false);
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  async function runPreview() {
    setBusy(true); setPreview(null); setConfirmed(false);
    try {
      // Early, friendly refusal; backend apply CAS stays authoritative.
      const local = await invoke<string>("git_resolve_commit", { path, rev: "HEAD" });
      if (local.trim().toLowerCase() !== headSha.toLowerCase()) {
        toastError(t("suggestionBatch.headMismatch", { local: local.trim().slice(0, 8), head: headSha.slice(0, 8) }));
        return;
      }
      const stale = new Map<string, string>();
      for (const file of new Set(chosen.map((s) => s.file))) {
        const content = await invoke<string>("repo_read_file", { path, file });
        for (const [id, why] of staleSuggestions(content, chosen.filter((s) => s.file === file))) stale.set(id, why);
      }
      const ok = chosen.filter((s) => !stale.has(s.id));
      // Canonical service re-reads and re-verifies; the plan holds the exact before/after content.
      setPreview({ plan: ok.length ? await previewSuggestions(path, headSha, ok) : null, stale });
    } catch (e) {
      toastError(String(e));
    } finally { setBusy(false); }
  }

  async function apply() {
    if (!preview?.plan || !confirmed) return;
    setBusy(true);
    try {
      await applySuggestionPlan(preview.plan);
      await useRepoStore.getState().reloadStatus(path);
      toast.success(t("suggestionBatch.applied", { count: preview.plan.suggestionIds.length }));
      onOpenChange(false);
    } catch (e) {
      // Head/content moved since preview (backend CAS): the old plan is void.
      toastError(String(e));
      setPreview(null); setConfirmed(false);
    } finally { setBusy(false); }
  }

  const planned = preview?.plan ? new Set(preview.plan.suggestionIds) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden flex flex-col" data-testid="suggestion-batch-dialog">
        <DialogHeader>
          <DialogTitle>{t("suggestionBatch.title")}</DialogTitle>
          <DialogDescription>{t("suggestionBatch.description", { branch: headRef, head: headSha.slice(0, 8) })}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto text-xs">
          {!threads ? <p className="text-muted-foreground">{t("suggestionBatch.loading")}</p>
            : !candidates ? <p className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{t("suggestionBatch.loading")}</p>
            : candidates.length === 0 ? <p className="text-muted-foreground">{t("suggestionBatch.none")}</p>
            : (
              <ul className="flex flex-col gap-1">
                {candidates.map((c) => (
                  <li key={c.id} className="rounded border border-border/60 px-2 py-1.5" data-testid="suggestion-candidate">
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-0.5" disabled={!!c.rejection} checked={selected.has(c.id)} onChange={() => toggle(c.id)} aria-label={c.endLine ? `${c.file}:${c.startLine}-${c.endLine}` : `${c.file} (${t("prRanges.outdated")})`} />
                      <span className="min-w-0 flex-1">
                        <span className="font-mono">{c.file}{c.endLine ? `:${c.startLine === c.endLine ? c.endLine : `${c.startLine}–${c.endLine}`}` : ""}</span>
                        <span className="ml-2 text-muted-foreground">@{c.author}</span>
                        {c.resolved && <span className="ml-2 text-muted-foreground">{t("suggestionBatch.resolved")}</span>}
                        {c.rejection && <span className="ml-2 text-amber-600">{t(`suggestionBatch.reject.${c.rejection}`)}</span>}
                        {overlaps.has(c.id) && <span className="ml-2 text-rose-500">{t("suggestionBatch.overlap")}</span>}
                        {preview?.stale.has(c.id) && <span className="ml-2 text-rose-500" title={preview.stale.get(c.id)}>{t("suggestionBatch.stale")}</span>}
                        <pre className="mt-1 whitespace-pre-wrap font-mono text-[0.6875rem] text-git-added">{c.replacementLines.join("\n") || t("prReview.suggestionDeletesLine")}</pre>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          {threadsTruncated && <p className="mt-2 text-amber-600">{t("suggestionBatch.truncated")}</p>}
          {threads && hasPartialComments(threads.values()) && <p className="mt-2 text-amber-600" role="status">{t("suggestionBatch.partialComments")}</p>}
          {preview && (
            <div className="mt-3 flex flex-col gap-2" data-testid="suggestion-batch-preview">
              {preview.stale.size > 0 && <p className="text-rose-500">{t("suggestionBatch.staleSummary", { count: preview.stale.size })}</p>}
              {!preview.plan && <p className="text-muted-foreground">{t("suggestionBatch.nothingToApply")}</p>}
              {preview.plan?.edits.map((edit) => (
                <div key={edit.file} className="overflow-hidden rounded border border-border/60">
                  <div className="border-b border-border/60 bg-muted/30 px-2 py-1 font-mono">{edit.file}</div>
                  <div className="h-40">
                    <UnifiedDiffBody loading={false} failed={false} isBinary={false} untrackedPlain={null} emptyHint="" failedHint=""
                      unifiedText={planUnifiedDiff(edit.expected_content, chosen.filter((s) => s.file === edit.file && planned?.has(s.id)))} filePath={edit.file} lineNumbers />
                  </div>
                </div>
              ))}
              {preview.plan && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  {t("suggestionBatch.confirm", { count: preview.plan.suggestionIds.length, branch: headRef })}
                </label>
              )}
              <p className="text-muted-foreground">{t("suggestionBatch.noResolve")}</p>
            </div>
          )}
        </div>
        <DialogFooter className="items-center">
          {blocked && chosen.length > 0 && <span className="mr-auto text-xs text-amber-600" role="status">{blocked}</span>}
          <Button variant="outline" size="sm" disabled={busy || !chosen.length || !!blocked} onClick={() => void runPreview()}>
            {t("suggestionBatch.preview", { count: chosen.length })}
          </Button>
          <Button size="sm" disabled={busy || !preview?.plan || !confirmed || !!blocked} onClick={() => void apply()}>
            {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            {t("suggestionBatch.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
