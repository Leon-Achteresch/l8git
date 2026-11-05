import { Button } from "@/components/ui/button";
import { readTemplate } from "@/lib/github-expansion/api";
import { structuredDiff } from "@/lib/github-expansion/analysis";
import { compareCiRuns, listRunJobs, listWorkflowRuns, type CiJob } from "@/lib/github-expansion/ci";
import { isFailed, lastGreenBefore } from "@/lib/github-ci-ui/ci-model";
import { errorLines, parseLog } from "@/lib/github-ci-ui/logs";
import { compareCommits, type CommitComparison } from "@/lib/github-ci-ui/reads";
import type { GithubTarget } from "@/lib/github-ui/target";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorNote, ExtLink, Loading, Muted, runLabel, shortSha, StatusText, type RunX } from "./ci-shared";
import type { LogCache } from "./github-ci-extensions";

type Loaded<T> = { state: "loading" } | { state: "ready"; value: T } | { state: "error"; error: unknown };
type WorkflowDiff = { same: true } | { same: false; changes: ReturnType<typeof structuredDiff> };

function workflowFile(path: string) { return path.replace(/@.*$/, ""); }

export function CiCompare({ target, run, jobs, cache }: { target: GithubTarget; run: RunX; jobs: CiJob[] | null; cache: LogCache }) {
  const { t } = useTranslation();
  const { account, fullName } = target;
  const [candidates, setCandidates] = useState<Loaded<RunX[]>>({ state: "loading" });
  const [baseId, setBaseId] = useState<number | null>(null);
  const [baseJobs, setBaseJobs] = useState<(Loaded<CiJob[]> & { incomplete?: boolean }) | null>(null);
  const [commits, setCommits] = useState<Loaded<CommitComparison> | null>(null);
  const [wf, setWf] = useState<Loaded<WorkflowDiff> | null>(null);

  useEffect(() => {
    let live = true;
    setCandidates({ state: "loading" });
    listWorkflowRuns(account, fullName, { workflowId: run.workflow_id }).then(
      (p) => {
        if (!live) return;
        setCandidates({ state: "ready", value: p.items });
        setBaseId((cur) => cur ?? lastGreenBefore(run, p.items)?.id ?? null);
      },
      (error) => live && setCandidates({ state: "error", error }),
    );
    return () => { live = false; };
  }, [account, fullName, run]);

  const base = candidates.state === "ready" ? candidates.value.find((r) => r.id === baseId) ?? null : null;

  useEffect(() => {
    if (!base) { setBaseJobs(null); setCommits(null); setWf(null); return; }
    let live = true;
    setBaseJobs({ state: "loading" });
    listRunJobs(account, fullName, base.id, 1, base.run_attempt).then((p) => live && setBaseJobs({ state: "ready", value: p.items, incomplete: p.hasMore }), (error) => live && setBaseJobs({ state: "error", error }));
    if (base.head_sha === run.head_sha) setCommits(null);
    else {
      setCommits({ state: "loading" });
      compareCommits(account, fullName, base.head_sha, run.head_sha).then((value) => live && setCommits({ state: "ready", value }), (error) => live && setCommits({ state: "error", error }));
    }
    setWf({ state: "loading" });
    const file = workflowFile(run.path), baseFile = workflowFile(base.path);
    void (async () => {
      try {
        const [before, after] = await Promise.all([readTemplate(account, fullName, baseFile, base.head_sha), readTemplate(account, fullName, file, run.head_sha)]);
        const value: WorkflowDiff = before === after ? { same: true } : { same: false, changes: structuredDiff(before, after, "yaml") };
        if (live) setWf({ state: "ready", value });
      } catch (error) {
        if (live) setWf({ state: "error", error });
      }
    })();
    return () => { live = false; };
  }, [base, run, account, fullName]);

  const comparison = useMemo(() => (base && baseJobs?.state === "ready" && jobs ? compareCiRuns(base, baseJobs.value, run, jobs) : null), [base, baseJobs, run, jobs]);

  if (candidates.state === "loading") return <Loading />;
  if (candidates.state === "error") return <ErrorNote error={candidates.error} />;
  const options = candidates.value.filter((r) => r.id !== run.id);

  // Hypotheses are only derived from observed differences, and labelled as unverified.
  const hypotheses: string[] = [];
  if (wf?.state === "ready" && !wf.value.same) hypotheses.push(t("ghci.compare.hypWorkflow"));
  if (commits?.state === "ready" && commits.value.total_commits > 0) hypotheses.push(t("ghci.compare.hypCommits", { count: commits.value.total_commits }));
  if (comparison?.jobs.some((j) => j.after.some((a) => j.before.some((b) => JSON.stringify(b.labels) !== JSON.stringify(a.labels) || b.runner_group_name !== a.runner_group_name)))) hypotheses.push(t("ghci.compare.hypRunner"));
  if (comparison?.sameCommit && comparison.sameWorkflow) hypotheses.push(t("ghci.compare.hypSameCommit"));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">{t("ghci.compare.failing")}</span>
        <span className="font-medium">{runLabel(run)}</span>
        <StatusText status={run.status} conclusion={run.conclusion} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <label htmlFor="ghci-base" className="text-muted-foreground">{t("ghci.compare.baseline")}</label>
        <select id="ghci-base" value={baseId ?? ""} onChange={(e) => setBaseId(e.target.value ? Number(e.target.value) : null)} className="h-7 max-w-96 rounded-md border border-input bg-transparent px-2 text-xs">
          <option value="">{t("ghci.compare.pick")}</option>
          {options.map((r) => <option key={r.id} value={r.id}>{runLabel(r)} · {r.conclusion ?? r.status}</option>)}
        </select>
        {base && lastGreenBefore(run, candidates.value)?.id === base.id && <span className="text-muted-foreground">{t("ghci.compare.autoGreen")}</span>}
      </div>
      {!base && <Muted>{options.some((r) => r.conclusion === "success") ? t("ghci.compare.pickHint") : t("ghci.compare.noGreen")}</Muted>}

      {base && (
        <>
          <section className="space-y-1">
            <h3 className="font-semibold">{t("ghci.compare.observations")}</h3>
            <ul className="space-y-0.5">
              <li>{t("ghci.compare.commits")}: <span className="font-mono">{shortSha(base.head_sha)} → {shortSha(run.head_sha)}</span>{" "}
                {base.head_sha === run.head_sha ? t("ghci.compare.sameCommit")
                  : commits?.state === "loading" ? <Loader2 className="inline h-3 w-3 animate-spin" />
                  : commits?.state === "ready" ? <>{t("ghci.compare.commitCount", { count: commits.value.total_commits, files: commits.value.files?.length ?? 0 })} <ExtLink href={commits.value.html_url}>{t("ghci.openOnGithub")}</ExtLink></>
                  : commits?.state === "error" ? <ErrorNote error={commits.error} className="mt-1" /> : null}
              </li>
              <li>{t("ghci.compare.workflow")}: <span className="font-mono">{workflowFile(run.path)}</span>{" "}
                {wf?.state === "loading" ? <Loader2 className="inline h-3 w-3 animate-spin" />
                  : wf?.state === "ready" ? (wf.value.same ? t("ghci.compare.workflowSame") : t("ghci.compare.workflowChanged", { count: wf.value.changes.length }))
                  : wf?.state === "error" ? <ErrorNote error={wf.error} className="mt-1" /> : null}
              </li>
              {comparison?.metadata.filter((m) => m.field !== "head_sha").map((m) => (
                <li key={m.field}><span className="font-mono">{m.field}</span>: {String(m.before ?? "—")} → {String(m.after ?? "—")}</li>
              ))}
            </ul>
            {wf?.state === "ready" && !wf.value.same && (
              <ul className="max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/30 p-1.5 font-mono text-[0.625rem]">
                {wf.value.changes.slice(0, 200).map((c, i) => <li key={i}>{c.kind} {c.path || "/"}</li>)}
              </ul>
            )}
          </section>

          <section className="space-y-1">
            <h3 className="font-semibold">{t("ghci.compare.jobs")}</h3>
            {baseJobs?.state === "loading" || !jobs ? <Loading /> : baseJobs?.state === "error" ? <ErrorNote error={baseJobs.error} /> : comparison && (
              <table className="w-full text-left">
                <thead className="text-muted-foreground"><tr><th className="font-normal">{t("ghci.job")}</th><th className="font-normal">{t("ghci.compare.baselineCol")}</th><th className="font-normal">{t("ghci.compare.failingCol")}</th></tr></thead>
                <tbody>
                  {comparison.jobs.filter((j) => j.changed).map((j) => (
                    <tr key={j.name} className="border-t border-border/40 align-top">
                      <td className="py-0.5 pr-2">{j.name}</td>
                      <td className="py-0.5 pr-2">{j.before.length ? j.before.map((b) => <StatusText key={b.id} status={b.status} conclusion={b.conclusion} />) : t("ghci.compare.absent")}</td>
                      <td className="py-0.5">{j.after.length ? j.after.map((a) => <div key={a.id}><StatusText status={a.status} conclusion={a.conclusion} /><FailedSteps job={a} /><LogEvidence job={a} cache={cache} /></div>) : t("ghci.compare.absent")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {comparison && !comparison.jobs.some((j) => j.changed) && <Muted>{t("ghci.compare.noJobDiff")}</Muted>}
            {baseJobs?.incomplete && <Muted>{t("ghci.jobsIncomplete")}</Muted>}
          </section>

          <section className="space-y-1 rounded-md border border-dashed border-border/70 p-2">
            <h3 className="font-semibold">{t("ghci.compare.hypotheses")}</h3>
            <Muted>{t("ghci.compare.hypothesesHint")}</Muted>
            {hypotheses.length ? <ul className="list-disc pl-4">{hypotheses.map((h) => <li key={h}>{h}</li>)}</ul> : <Muted>{t("ghci.compare.noHypotheses")}</Muted>}
          </section>
        </>
      )}
    </div>
  );
}

function FailedSteps({ job }: { job: CiJob }) {
  const steps = job.steps.filter((s) => isFailed(s.conclusion));
  if (!steps.length) return null;
  return <ul className="pl-4 text-muted-foreground">{steps.map((s) => <li key={s.number}>#{s.number} {s.name}</li>)}</ul>;
}

/** First exact error markers, only from a log the user already fetched. */
function LogEvidence({ job, cache }: { job: CiJob; cache: LogCache }) {
  const { t } = useTranslation();
  const entry = cache.logs[job.id];
  const found = useMemo(() => {
    if (entry?.state !== "ready") return null;
    const lines = parseLog(entry.text);
    const e = errorLines(lines);
    return { kind: e.kind, lines: e.indexes.slice(0, 3).map((i) => lines[i].text) };
  }, [entry]);
  if (!isFailed(job.conclusion)) return null;
  if (!found) {
    return (
      <Button size="sm" variant="ghost" className="h-6 px-1 text-[0.6875rem]" disabled={entry?.state === "loading"} onClick={() => void cache.fetchLog(job)}>
        {entry?.state === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}{t("ghci.compare.fetchLog")}
      </Button>
    );
  }
  if (!found.lines.length) return <Muted>{t("ghci.compare.noErrorLines")}</Muted>;
  return (
    <div className="mt-0.5">
      <Muted>{found.kind === "marker" ? t("ghci.compare.errorMarkers") : t("ghci.compare.errorHeuristic")}</Muted>
      <pre className="max-w-[40rem] overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-1 font-mono text-[0.625rem]">{found.lines.join("\n")}</pre>
    </div>
  );
}
