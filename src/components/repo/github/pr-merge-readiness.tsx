import { Button } from "@/components/ui/button";
import { toastError } from "@/lib/error-toast";
import { setMergeQueue } from "@/lib/github-expansion/api";
import { mergeQueueRequired, readinessRows, readinessVerdict, type Tone } from "@/lib/github-ui/readiness";
import type { PrGithubState } from "@/lib/github-ui/use-pr-github";
import { CheckCircle2, ChevronDown, CircleDashed, CircleHelp, ListOrdered, Loader2, XCircle } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const ICON: Record<Tone, typeof CheckCircle2> = { ok: CheckCircle2, fail: XCircle, pending: CircleDashed, unknown: CircleHelp };
const COLOR: Record<Tone, string> = {
  ok: "text-emerald-500",
  fail: "text-rose-500",
  pending: "text-amber-500",
  unknown: "text-muted-foreground",
};

/** Separates "no conflicts", "requirements met" and "unknown" using GitHub's own merge state. */
export function PrMergeReadiness({ gh, open, onChanged }: { gh: PrGithubState; open: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const { readiness: r, rules, target } = gh;
  if (!target) return null;
  if (!r) {
    return gh.error ? <p className="mb-2 text-[0.6875rem] text-rose-500">{t("ghx.readinessError", { error: gh.error })}</p> : null;
  }
  if (!open) return null;
  const rows = readinessRows(r, rules);
  const verdict = readinessVerdict(rows);
  const VerdictIcon = ICON[verdict];
  const queued = r.mergeQueueEntry;
  const queueRule = mergeQueueRequired(rules);

  async function queue(enqueue: boolean) {
    if (!r || !target) return;
    setBusy(true);
    try {
      await setMergeQueue(target.account, r.id, enqueue, r.headRefOid);
      await gh.reload();
      onChanged();
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-2 rounded-lg border border-border/60 bg-muted/10" aria-label={t("ghx.readiness")}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold"
      >
        <VerdictIcon className={`h-3.5 w-3.5 ${COLOR[verdict]}`} />
        <span>{t(`ghx.verdict.${verdict}`)}</span>
        <span className="font-mono text-[0.625rem] font-normal text-muted-foreground">{r.mergeStateStatus}</span>
        {queued && (
          <span className="rounded bg-primary/10 px-1.5 text-[0.625rem] text-primary">
            {t("ghx.queued", { state: queued.state, position: queued.position ?? "?" })}
          </span>
        )}
        {gh.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className="border-t border-border/50 px-3 py-2">
          <ul className="space-y-1">
            {rows.map((row) => {
              const Icon = ICON[row.tone];
              return (
                <li key={row.id} className="flex items-start gap-2 text-[0.6875rem]">
                  <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${COLOR[row.tone]}`} />
                  <span>{t(`ghx.row.${row.key}`, row.values)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[0.625rem] text-muted-foreground">{t("ghx.readinessNote")}</p>
          {(queueRule || queued) && (
            <div className="mt-2 flex items-center gap-2 border-t border-border/40 pt-2">
              <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[0.6875rem]">{queued ? t("ghx.queueIn") : t("ghx.queueRequired")}</span>
              {r.viewerCanUpdate && (
                <Button size="sm" variant="outline" className="ml-auto h-6 text-[0.6875rem]" disabled={busy} onClick={() => void queue(!queued)}>
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  {queued ? t("ghx.dequeue") : t("ghx.enqueue")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
