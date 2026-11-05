import { getPullMeta, listCommitPulls, type DecisionPull, type PullMeta } from "@/lib/github-expansion/api";
import { isTarget, useGithubTarget } from "@/lib/github-ui/target";
import { ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { IssueDetailSheet } from "./issue-detail-sheet";

type Trail = { pull: DecisionPull; meta: PullMeta | null }[];

/** 78: commit → PR(s) → closing issues + review evidence, every item a source link. No generated summary. */
export function CommitDecisionTrail({ path, sha }: { path: string; sha: string }) {
  const { t } = useTranslation();
  const target = useGithubTarget(path);
  const [open, setOpen] = useState(false);
  const [trail, setTrail] = useState<Trail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issue, setIssue] = useState<{ repo: string; number: number } | null>(null);
  if (!isTarget(target) || !/^[0-9a-f]{40,64}$/i.test(sha)) return null;
  const { account: a, fullName } = target;

  async function load() {
    try {
      const pulls = (await listCommitPulls(a, fullName, sha)).items;
      setTrail(await Promise.all(pulls.map(async (p) => ({ pull: p, meta: await getPullMeta(a, fullName, p.number).catch(() => null) }))));
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="border-t border-border/50 px-4 py-2 text-xs">
      <button type="button" aria-expanded={open} onClick={() => { setOpen(!open); if (!trail && !error) void load(); }} className="flex items-center gap-1 font-semibold">
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        {t("decision.title")}
      </button>
      {open && (
        <div className="mt-1.5 space-y-2">
          {error && <p className="text-muted-foreground">{t("decision.error", { error })}</p>}
          {!trail && !error && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {trail?.length === 0 && <p className="text-muted-foreground">{t("decision.none")}</p>}
          {trail?.map(({ pull, meta }) => (
            <div key={pull.number} className="rounded-md border border-border/50 p-2">
              <a href={pull.html_url} target="_blank" rel="noreferrer" className="font-medium hover:underline">#{pull.number} {pull.title}</a>
              <p className="text-[10px] text-muted-foreground">{pull.merged_at ? t("decision.merged", { when: new Date(pull.merged_at).toLocaleDateString() }) : pull.state}</p>
              {pull.body && <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-muted-foreground">{pull.body}</p>}
              {meta && meta.closingIssues.length > 0 && (
                <p className="mt-1">
                  {t("decision.issues")}{" "}
                  {meta.closingIssues.map((i) => (
                    <button key={i.id} type="button" className="mr-1.5 text-primary hover:underline" onClick={() => setIssue({ repo: i.repository.nameWithOwner, number: i.number })}>
                      {i.repository.nameWithOwner !== fullName ? i.repository.nameWithOwner : ""}#{i.number} {i.title}
                    </button>
                  ))}
                </p>
              )}
              {meta && meta.latestReviews.length > 0 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {t("decision.reviews")} {meta.latestReviews.map((r) => `${r.login}: ${r.state.toLowerCase()}`).join(", ")}
                </p>
              )}
              {!meta && <p className="mt-1 text-[10px] text-muted-foreground">{t("decision.metaUnavailable")}</p>}
            </div>
          ))}
        </div>
      )}
      {issue && <IssueDetailSheet account={a} fullName={issue.repo} number={issue.number} onClose={() => setIssue(null)} onChanged={() => {}} />}
    </section>
  );
}
