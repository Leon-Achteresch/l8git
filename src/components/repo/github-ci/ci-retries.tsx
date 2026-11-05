import { Button } from "@/components/ui/button";
import { inconsistentJobOutcomes, listRunJobs, listWorkflowRuns, type CiJob, type CiRun } from "@/lib/github-expansion/ci";
import { attemptNumbers } from "@/lib/github-ci-ui/ci-model";
import type { GithubTarget } from "@/lib/github-ui/target";
import { Loader2, Search } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorNote, ExtLink, Muted, shortSha, type RunX } from "./ci-shared";

const MAX_ATTEMPTS = 30;
type Sample = { run: CiRun; jobs: CiJob[] };
type Result = { samples: Sample[]; failed: string[]; runs: number; attempts: number };

/**
 * 47: same workflow + exact SHA across attempts and other runs. Reports contradictory job outcomes
 * as evidence only; never names a flaky test (job APIs carry no test-level results).
 */
export function CiRetries({ target, run }: { target: GithubTarget; run: RunX }) {
  const { t } = useTranslation();
  const { account, fullName } = target;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function scan() {
    setBusy(true);
    setError(null);
    try {
      const runs = (await listWorkflowRuns(account, fullName, { workflowId: run.workflow_id, headSha: run.head_sha })).items.filter((r) => r.head_sha === run.head_sha).slice(0, 10);
      if (!runs.some((r) => r.id === run.id)) runs.unshift(run);
      const samples: Sample[] = [], failed: string[] = [];
      let attempts = 0;
      for (const r of runs) {
        for (const attempt of attemptNumbers(r, 10)) {
          if (attempts === MAX_ATTEMPTS) break;
          attempts++;
          try {
            samples.push({ run: r, jobs: (await listRunJobs(account, fullName, r.id, 1, attempt)).items });
          } catch (e) {
            failed.push(`#${r.id}/${attempt}: ${String(e)}`);
          }
        }
      }
      setResult({ samples, failed, runs: runs.length, attempts });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const hints = result ? inconsistentJobOutcomes(result.samples) : [];
  const jobUrl = (jobId: number) => result?.samples.flatMap((s) => s.jobs).find((j) => j.id === jobId)?.html_url;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => void scan()}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}{t("ghci.retries.scan")}
        </Button>
        <Muted>{t("ghci.retries.scope", { sha: shortSha(run.head_sha) })}</Muted>
      </div>
      {error != null && <ErrorNote error={error} />}
      {result && (
        <>
          <Muted>{t("ghci.retries.scanned", { runs: result.runs, attempts: result.attempts })}</Muted>
          {result.failed.length > 0 && <Muted className="text-destructive">{t("ghci.retries.partial", { count: result.failed.length })}</Muted>}
          {hints.length === 0 ? <Muted>{t("ghci.retries.none")}</Muted> : (
            <ul className="space-y-1.5">
              {hints.map((h) => (
                <li key={h.jobName} className="rounded-md border border-border/60 p-1.5">
                  <p className="font-medium">{h.jobName}</p>
                  <p className="text-muted-foreground">{t("ghci.retries.counts", { ok: h.successes.length, failed: h.failures.length })}</p>
                  <div className="flex flex-wrap gap-x-2">
                    {h.failures.map((e) => <ExtLink key={e.jobId} href={jobUrl(e.jobId)} className="text-git-removed">{t("ghci.retries.evidenceFail", { run: e.runId, attempt: e.attempt })}</ExtLink>)}
                    {h.successes.map((e) => <ExtLink key={e.jobId} href={jobUrl(e.jobId)} className="text-git-added">{t("ghci.retries.evidenceOk", { run: e.runId, attempt: e.attempt })}</ExtLink>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Muted>{t("ghci.retries.disclaimer")}</Muted>
        </>
      )}
    </div>
  );
}
