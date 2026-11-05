import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadGithubFile } from "@/lib/github-expansion/api";
import { listRunJobs, listWorkflowRuns, type CiJob } from "@/lib/github-expansion/ci";
import { decodeLogText } from "@/lib/github-ci-ui/logs";
import { getWorkflowRun } from "@/lib/github-ci-ui/reads";
import { isTarget, useGithubTarget, type GithubTarget } from "@/lib/github-ui/target";
import { Bot, Boxes, FileText, GitCompare, Grid3x3, Play, RefreshCw, Repeat, Rocket } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CiAgentTask, ciAgentIdentity } from "./ci-agent-task";
import { CiArtifacts } from "./ci-artifacts";
import { CiCompare } from "./ci-compare";
import { CiDeployments } from "./ci-deployments";
import { CiDispatch } from "./ci-dispatch";
import { CiLogs } from "./ci-logs";
import { CiMatrix } from "./ci-matrix";
import { CiRetries } from "./ci-retries";
import { ErrorNote, Loading, Muted, runLabel, type RunX } from "./ci-shared";

type Tab = "logs" | "compare" | "matrix" | "retries" | "agent" | "dispatch" | "artifacts" | "deployments";
export type LogEntry = { state: "loading" } | { state: "ready"; text: string; fetchedAt: number } | { state: "error"; error: unknown };
export type LogCache = { logs: Record<number, LogEntry>; fetchLog: (job: CiJob) => Promise<string | null> };

/** GitHub-only CI extensions (IDs 41–48). Host passes the selected run; otherwise an own picker is shown. */
export function GithubCiExtensions({ path, selectedRunId }: { path: string; selectedRunId?: number }) {
  const { t } = useTranslation();
  const target = useGithubTarget(path);
  if (!isTarget(target)) {
    if (target.reason === "loading") return <Loading />;
    return <Muted className="p-3">{t(`ghci.unsupported.${target.reason}`)}</Muted>;
  }
  return <Extensions key={`${target.account.host}/${target.account.login}/${target.fullName}`} target={target} path={path} selectedRunId={selectedRunId} />;
}

function Extensions({ target, path, selectedRunId }: { target: GithubTarget; path: string; selectedRunId?: number }) {
  const { t } = useTranslation();
  const { account, fullName } = target;
  const [tab, setTab] = useState<Tab>("logs");
  const [runs, setRuns] = useState<RunX[] | null>(null);
  const [runsPage, setRunsPage] = useState({ page: 1, hasMore: false });
  const [runsError, setRunsError] = useState<unknown>(null);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const runId = selectedRunId ?? pickedId ?? runs?.[0]?.id ?? null;
  const [run, setRun] = useState<RunX | null>(null);
  const [runError, setRunError] = useState<unknown>(null);
  const [jobs, setJobs] = useState<CiJob[] | null>(null);
  const [jobsError, setJobsError] = useState<unknown>(null);
  const [jobsIncomplete, setJobsIncomplete] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [logs, setLogs] = useState<Record<number, LogEntry>>({});
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [reload, setReload] = useState(0);

  const loadRuns = useCallback(async (page: number) => {
    setRunsError(null);
    try {
      const res = await listWorkflowRuns(account, fullName, { page });
      setRuns((cur) => (page === 1 ? res.items : [...(cur ?? []), ...res.items.filter((r) => !cur?.some((c) => c.id === r.id))]));
      setRunsPage({ page, hasMore: res.hasMore });
    } catch (e) {
      setRunsError(e);
      if (page === 1) setRuns([]);
    }
  }, [account, fullName]);

  useEffect(() => {
    void loadRuns(1);
  }, [loadRuns, reload]);

  // Selected run: from the list when present, otherwise fetched exactly by id. Same id+attempt+update keeps identity.
  useEffect(() => {
    setRunError(null);
    if (runId === null) { setRun(null); return; }
    const same = (r: RunX) => (prev: RunX | null) => (prev && prev.id === r.id && prev.run_attempt === r.run_attempt && prev.updated_at === r.updated_at ? prev : r);
    const listed = runs?.find((r) => r.id === runId);
    if (listed) { setRun(same(listed)); return; }
    if (runs === null) return;
    let live = true;
    getWorkflowRun(account, fullName, runId).then((r) => live && setRun(same(r)), (e) => live && setRunError(e));
    return () => { live = false; };
  }, [runId, runs, account, fullName]);

  // Jobs of the exact attempt shown.
  useEffect(() => {
    if (!run) return;
    let live = true;
    setJobsError(null);
    setJobs((cur) => (cur?.[0] && cur[0].run_id === run.id && cur[0].run_attempt === run.run_attempt ? cur : null));
    void (async () => {
      const all: CiJob[] = [];
      let page = 1, more = true;
      try {
        while (more && page <= 5) {
          const res = await listRunJobs(account, fullName, run.id, page, run.run_attempt);
          all.push(...res.items);
          more = res.hasMore;
          page++;
        }
        if (!live) return;
        setJobs(all);
        setJobsIncomplete(more);
        setLoadedAt(Date.now());
        setJobId((cur) => (all.some((j) => j.id === cur) ? cur : (all.find((j) => j.conclusion === "failure") ?? all[0])?.id ?? null));
      } catch (e) {
        if (live) { setJobsError(e); setJobs([]); }
      }
    })();
    return () => { live = false; };
  }, [run, account, fullName, reload]);

  const fetchLog = useCallback(async (job: CiJob): Promise<string | null> => {
    setLogs((l) => ({ ...l, [job.id]: { state: "loading" } }));
    try {
      const text = decodeLogText(await downloadGithubFile(account, fullName, "job_logs", job.id));
      setLogs((l) => ({ ...l, [job.id]: { state: "ready", text, fetchedAt: Date.now() } }));
      return text;
    } catch (error) {
      setLogs((l) => ({ ...l, [job.id]: { state: "error", error } }));
      return null;
    }
  }, [account, fullName]);
  const cache: LogCache = { logs, fetchLog };
  const job = jobs?.find((j) => j.id === jobId) ?? null;

  const tabs: [Tab, typeof FileText][] = [["logs", FileText], ["compare", GitCompare], ["matrix", Grid3x3], ["retries", Repeat], ["agent", Bot], ["dispatch", Play], ["artifacts", Boxes], ["deployments", Rocket]];

  return (
    <section className="flex min-h-0 flex-col gap-2 text-xs" aria-label={t("ghci.title")}>
      <div className="flex flex-wrap items-center gap-2">
        {selectedRunId === undefined && (
          <>
            <label className="sr-only" htmlFor="ghci-run">{t("ghci.run")}</label>
            <select id="ghci-run" value={runId ?? ""} onChange={(e) => setPickedId(Number(e.target.value))} disabled={!runs?.length}
              className="h-7 max-w-80 rounded-md border border-input bg-transparent px-2 text-xs">
              {runs?.map((r) => <option key={r.id} value={r.id}>{runLabel(r)} · {r.conclusion ?? r.status}</option>)}
            </select>
            {runsPage.hasMore && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void loadRuns(runsPage.page + 1)}>{t("ghci.loadMore")}</Button>}
          </>
        )}
        {run && <span className="truncate text-muted-foreground">{runLabel(run)}</span>}
        <Button size="icon" variant="ghost" className="ml-auto h-7 w-7" aria-label={t("ghci.refresh")} title={loadedAt ? t("ghci.loadedAt", { time: new Date(loadedAt).toLocaleTimeString() }) : undefined}
          onClick={() => { setLogs({}); setReload((n) => n + 1); }}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      {runsError != null && <ErrorNote error={runsError} />}

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="border-b border-border/50">
        <TabsList variant="line" className="flex-wrap">
          {tabs.map(([key, Icon]) => (
            <TabsTrigger key={key} value={key}><Icon />{t(`ghci.tab.${key}`)}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="min-h-0 flex-1 overflow-auto">
        {tab === "dispatch" ? (
          <CiDispatch target={target} onDispatched={(id) => { setPickedId(id); setReload((n) => n + 1); setTab("logs"); }} hostControlsRun={selectedRunId !== undefined} />
        ) : runError != null ? (
          <ErrorNote error={runError} />
        ) : !run ? (
          runs === null || runId !== null ? <Loading /> : <Muted>{t("ghci.noRuns")}</Muted>
        ) : (
          <>
            {jobsError != null && <ErrorNote error={jobsError} className="mb-1" />}
            {jobsIncomplete && <Muted className="mb-1">{t("ghci.jobsIncomplete")}</Muted>}
            {tab === "logs" && <CiLogs target={target} run={run} jobs={jobs} job={job} onJob={setJobId} cache={cache} />}
            {tab === "compare" && <CiCompare key={run.id} target={target} run={run} jobs={jobs} cache={cache} />}
            {tab === "matrix" && <CiMatrix jobs={jobs} selectedJobId={jobId} onSelect={(id) => { setJobId(id); setTab("logs"); }} />}
            {tab === "retries" && <CiRetries key={run.id} target={target} run={run} />}
            {tab === "agent" && <CiAgentTask key={ciAgentIdentity(path, fullName, run, job)} target={target} path={path} run={run} jobs={jobs} job={job} onJob={setJobId} cache={cache} />}
            {tab === "artifacts" && <CiArtifacts target={target} run={run} refresh={reload} />}
            {tab === "deployments" && <CiDeployments target={target} run={run} refresh={reload} />}
          </>
        )}
      </div>
    </section>
  );
}
