import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { worktreeTargetPath } from "@/lib/agents/agent-worktrees";
import { useAgentChatStore } from "@/lib/agents/chat-store";
import { toastError } from "@/lib/error-toast";
import { readTemplate } from "@/lib/github-expansion/api";
import { ciAgentContext, type CiJob } from "@/lib/github-expansion/ci";
import type { TaskWorktree } from "@/lib/github-expansion/workspace";
import { validBranchName } from "@/lib/github-ui/issue-branch";
import { parseRemoteUrl, type GithubTarget } from "@/lib/github-ui/target";
import { isHubPath } from "@/lib/hub/store";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { Bot, FolderOpen, GitBranchPlus, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ErrorNote, Muted, shortSha, type RunX } from "./ci-shared";
import { JobPicker } from "./ci-logs";
import type { LogCache } from "./github-ci-extensions";

/** Local clones whose origin is this GitHub repository (the current path first when local). */
function useClones(path: string, host: string, fullName: string): string[] | null {
  // Select the stable repos object; a fresh Object.keys array per snapshot loops React 19 + Zustand 5.
  const repos = useRepoStore((s) => s.repos);
  const paths = useMemo(() => Object.keys(repos), [repos]);
  const key = paths.join("\n");
  const [hits, setHits] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    const candidates = isHubPath(path) ? paths : [path, ...paths.filter((p) => p !== path)];
    void Promise.all(candidates.map(async (p) => {
      const rs = await invoke<{ name: string; url: string }[]>("list_git_remotes", { path: p }).catch(() => []);
      const o = rs.find((r) => r.name === "origin") ?? rs[0];
      const parsed = o ? parseRemoteUrl(o.url) : null;
      return parsed && parsed.host === host.toLowerCase() && parsed.fullName.toLowerCase() === fullName.toLowerCase() ? p : null;
    })).then((r) => live && setHits(r.filter((x): x is string => !!x)));
    return () => { live = false; };
  }, [path, key, host, fullName]); // eslint-disable-line react-hooks/exhaustive-deps
  return hits;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "job";

/** Exact operation identity: context, worktree and send must all belong to this repo/run/attempt/job. */
export const ciAgentIdentity = (path: string, fullName: string, run: RunX, job: CiJob | null) =>
  `${path}\n${fullName}\n${run.id}\n${job?.run_attempt ?? run.run_attempt}\n${job?.id ?? ""}`;

/**
 * 46: failure → editable context (exact run/attempt/head/job log/workflow) → isolated worktree at the
 * run's head SHA → explicit send to the app's agent session. Nothing runs automatically.
 * The host remounts this per `ciAgentIdentity`; results are additionally checked against it.
 */
export function CiAgentTask({ target, path, run, jobs, job, onJob, cache }: { target: GithubTarget; path: string; run: RunX; jobs: CiJob[] | null; job: CiJob | null; onJob: (id: number) => void; cache: LogCache }) {
  const { t } = useTranslation();
  const { account, fullName } = target;
  const clones = useClones(path, account.host, fullName);
  const sendToAgent = useAgentChatStore((s) => s.sendMessage);
  const entry = job ? cache.logs[job.id] : undefined;
  const [withWorkflow, setWithWorkflow] = useState(true);
  const identity = ciAgentIdentity(path, fullName, run, job);
  const live = useRef<string | null>(identity);
  live.current = identity;
  useEffect(() => () => { live.current = null; }, []);
  const [ctx, setCtx] = useState<{ id: string; text: string } | null>(null);
  const context = ctx?.id === identity ? ctx.text : null;
  const setContext = (text: string) => setCtx({ id: identity, text });
  const [buildError, setBuildError] = useState<unknown>(null);
  const [building, setBuilding] = useState(false);
  const [clone, setClone] = useState("");
  const [branch, setBranch] = useState("");
  const [wt, setWt] = useState<{ id: string; wt: TaskWorktree } | null>(null);
  const worktree = wt?.id === identity ? wt.wt : null;
  const [wtError, setWtError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { if (clones?.length && !clone) setClone(clones[0]); }, [clones, clone]);
  useEffect(() => {
    setCtx(null); setWt(null); setSent(false); setAck(false); setBuildError(null); setWtError(null);
    setBranch(job ? `ci/fix-${run.id}-${slug(job.name)}` : "");
  }, [job?.id, run.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function build() {
    if (!job || entry?.state !== "ready") return;
    const op = identity;
    setBuilding(true);
    setBuildError(null);
    try {
      let text = ciAgentContext(run, job, entry.text);
      if (withWorkflow) {
        const file = run.path.replace(/@.*$/, "");
        const yaml = await readTemplate(account, fullName, file, run.head_sha);
        text += `\n\n--- BEGIN WORKFLOW ${file} @ ${run.head_sha} ---\n${yaml.slice(0, 50_000)}\n--- END WORKFLOW ---`;
      }
      if (live.current === op) setCtx({ id: op, text });
    } catch (e) {
      if (live.current === op) setBuildError(e);
    } finally {
      if (live.current === op) setBuilding(false);
    }
  }

  async function createWorktree() {
    if (!clone || !validBranchName(branch)) return;
    const op = identity, headSha = run.head_sha;
    setBusy(true);
    setWtError(null);
    try {
      const worktreePath = worktreeTargetPath(clone, branch.replace(/\//g, "-"));
      // Pinned to the run's head SHA; hooks/filters disabled by the backend; nothing is executed.
      const res = await invoke<TaskWorktree>("hub_task_worktree", { path: clone, expectedHost: account.host, expectedFullName: fullName, worktreePath, branch, expectedHeadSha: headSha, prNumber: null, allowExternalCode: false });
      await useRepoStore.getState().reloadWorktrees(clone).catch(() => {});
      if (live.current !== op) {
        // A real worktree exists for the previous run; keep its location reachable instead of losing it.
        toast.warning(t("ghci.agent.staleWorktree", { branch: res.branch, sha: shortSha(res.head), path: res.path }), {
          duration: Infinity,
          action: { label: t("ghci.agent.open"), onClick: () => void useRepoStore.getState().addRepo(res.path).catch((e) => toastError(String(e))) },
        });
        return;
      }
      setWt({ id: op, wt: res });
      toast.success(t("ghci.agent.worktreeCreated", { branch: res.branch }));
    } catch (e) {
      if (live.current === op) setWtError(e);
    } finally {
      if (live.current === op) setBusy(false);
    }
  }

  async function send() {
    // Preflight: context and worktree were produced for exactly this identity and the run's head.
    if (!worktree || !context || !ack || ctx?.id !== identity || wt?.id !== identity || live.current !== identity || worktree.head.toLowerCase() !== run.head_sha.toLowerCase()) return;
    const op = identity;
    setBusy(true);
    try {
      await sendToAgent(worktree.path, context);
      if (live.current === op) setSent(true);
    } catch (e) {
      toastError(String(e));
    } finally {
      if (live.current === op) setBusy(false);
    }
  }

  const failed = jobs?.filter((j) => j.conclusion === "failure" || j.conclusion === "timed_out") ?? [];
  const external = run.event.startsWith("pull_request");

  return (
    <div className="space-y-3">
      <section className="space-y-1">
        <h3 className="font-semibold">{t("ghci.agent.step1")}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <JobPicker id="ghci-agent-job" jobs={failed.length ? failed : jobs} job={job} onJob={onJob} />
          {job && entry?.state !== "ready" && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={entry?.state === "loading"} onClick={() => void cache.fetchLog(job)}>
              {entry?.state === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}{t("ghci.logs.load")}
            </Button>
          )}
          <label className="flex items-center gap-1.5"><Checkbox checked={withWorkflow} onCheckedChange={(c) => setWithWorkflow(c === true)} />{t("ghci.agent.includeWorkflow")}</label>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!job || entry?.state !== "ready" || building} onClick={() => void build()}>
            {building && <Loader2 className="h-3 w-3 animate-spin" />}{context ? t("ghci.agent.rebuild") : t("ghci.agent.build")}
          </Button>
        </div>
        {!failed.length && jobs?.length ? <Muted>{t("ghci.agent.noFailure")}</Muted> : null}
        {entry?.state === "error" && <ErrorNote error={entry.error} />}
        {buildError != null && <ErrorNote error={buildError} />}
        {context !== null && (
          <>
            <Muted>{t("ghci.agent.reviewHint", { sha: shortSha(run.head_sha), attempt: job?.run_attempt ?? run.run_attempt })}</Muted>
            <Textarea value={context} onChange={(e) => setContext(e.target.value)} aria-label={t("ghci.agent.context")} className="h-56 font-mono text-[0.6875rem]" />
          </>
        )}
      </section>

      {context !== null && (
        <section className="space-y-1">
          <h3 className="font-semibold">{t("ghci.agent.step2")}</h3>
          {clones === null ? <Loader2 className="h-3 w-3 animate-spin" /> : !clones.length ? <Muted>{t("ghci.agent.noClone", { repo: fullName })}</Muted> : worktree ? (
            <p>{t("ghci.agent.worktreeAt", { branch: worktree.branch, sha: shortSha(worktree.head) })} <span className="font-mono text-[0.625rem] text-muted-foreground">{worktree.path}</span></p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {clones.length > 1 && (
                <select value={clone} onChange={(e) => setClone(e.target.value)} aria-label={t("ghci.agent.clone")} className="h-7 max-w-56 rounded-md border border-input bg-transparent px-2 text-xs">
                  {clones.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} aria-label={t("ghci.agent.branch")} aria-invalid={!validBranchName(branch)} className="h-7 w-64 font-mono text-xs" />
              <Button size="sm" className="h-7 text-xs" disabled={busy || !clone || !validBranchName(branch)} onClick={() => void createWorktree()}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitBranchPlus className="h-3 w-3" />}{t("ghci.agent.createWorktree", { sha: shortSha(run.head_sha) })}
              </Button>
            </div>
          )}
          {wtError != null && <><ErrorNote error={wtError} /><Muted>{t("ghci.agent.fetchHint", { sha: shortSha(run.head_sha) })}</Muted></>}
          {worktree?.cleanup_warning && <Muted className="text-destructive">{worktree.cleanup_warning}</Muted>}
        </section>
      )}

      {worktree && context !== null && (
        <section className="space-y-1">
          <h3 className="font-semibold">{t("ghci.agent.step3")}</h3>
          {external && <Muted className="text-destructive">{t("ghci.agent.externalWarning")}</Muted>}
          <label className="flex items-start gap-1.5"><Checkbox checked={ack} onCheckedChange={(c) => setAck(c === true)} className="mt-0.5" />{t("ghci.agent.ack")}</label>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" className="h-7 text-xs" disabled={!ack || busy || sent} onClick={() => void send()}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}{sent ? t("ghci.agent.sent") : t("ghci.agent.send")}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void useRepoStore.getState().addRepo(worktree.path).catch((e) => toastError(String(e)))}>
              <FolderOpen className="h-3 w-3" />{t("ghci.agent.open")}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
