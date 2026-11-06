import { Button } from "@/components/ui/button";
import { subjectKey, useGithubWorkspace, type CheckReminder } from "@/lib/github-expansion/store";
import { reminderId, type PrCheckRow } from "@/lib/github-ui/check-reminders";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";
import { BellPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

type When = CheckReminder["when"];

/**
 * 38: "notify me once when check X completes / succeeds / fails" — pinned to the PR head the checks ran on.
 * A reminder for an older head stays visible as stale and never fires for a newer commit.
 */
export function CheckReminderBar({ path, number, checks }: { path: string; number: number; checks: PrCheckRow[] }) {
  const { t } = useTranslation();
  const target = useGithubTarget(path);
  const subject = isTarget(target) ? subjectKey(target.account, target.fullName, "pull", number) : null;
  const all = useGithubWorkspace((s) => s.reminders);
  const save = useGithubWorkspace((s) => s.saveReminder);
  const mine = useMemo(() => Object.entries(all).filter(([, r]) => r.subject === subject), [all, subject]);
  const heads = [...new Set(checks.map((c) => c.head_sha).filter((h): h is string => !!h && /^[0-9a-f]{40,64}$/i.test(h)))];
  const head = heads.length === 1 ? heads[0] : null;
  const pending = [...new Set(checks.filter((c) => c.status.toLowerCase() !== "completed").map((c) => c.name))];
  const [check, setCheck] = useState("");
  const [when, setWhen] = useState<When>("completed");
  const chosen = pending.includes(check) ? check : pending[0] ?? "";
  if (!subject) return null;
  if (!pending.length && !mine.length) return null;
  const add = () => {
    if (!head || !chosen) return;
    const r: CheckReminder = { subject, headSha: head, checkName: chosen, when, deliveredAt: null };
    save(reminderId(r), r);
  };
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border/50 px-4 py-1.5 text-[0.6875rem]" data-testid="check-reminder-bar">
      {pending.length > 0 && (head ? (
        <>
          <BellPlus className="h-3 w-3 text-muted-foreground" />
          <select value={chosen} onChange={(e) => setCheck(e.target.value)} aria-label={t("reminder.check")} className="h-6 max-w-48 rounded border border-input bg-transparent px-1">
            {pending.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={when} onChange={(e) => setWhen(e.target.value as When)} aria-label={t("reminder.when")} className="h-6 rounded border border-input bg-transparent px-1">
            {(["completed", "success", "failure"] as const).map((w) => <option key={w} value={w}>{t(`reminder.${w}`)}</option>)}
          </select>
          <Button variant="outline" size="xs" className="h-6 text-[0.6875rem]" disabled={!chosen} onClick={add}>{t("reminder.add")}</Button>
          <span className="font-mono text-muted-foreground">{t("reminder.pinned", { sha: head.slice(0, 10) })}</span>
        </>
      ) : (
        <span className="text-muted-foreground">{t("reminder.noHead")}</span>
      ))}
      {mine.map(([id, r]) => {
        const stale = head !== null && r.headSha !== head;
        return (
          <span key={id} className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${stale ? "bg-amber-500/10 text-amber-600" : "bg-primary/10 text-primary"}`}>
            {t(r.deliveredAt ? "reminder.delivered" : "reminder.active", { check: r.checkName, when: t(`reminder.${r.when}`), sha: r.headSha.slice(0, 10) })}
            {stale && !r.deliveredAt && <span>· {t("reminder.stale")}</span>}
            <button type="button" aria-label={t("common.remove")} onClick={() => save(id, null)}><X className="h-3 w-3" /></button>
          </span>
        );
      })}
    </div>
  );
}
