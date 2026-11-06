import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAgentChatStore } from "@/lib/agents/chat-store";
import { worktreeTargetPath } from "@/lib/agents/agent-worktrees";
import { useChangeWorkflow } from "@/lib/change-workflow/store";
import { toastError } from "@/lib/error-toast";
import type { GithubComment, GithubIssue } from "@/lib/github-expansion/api";
import { subjectKey, useGithubWorkspace } from "@/lib/github-expansion/store";
import { createIssueWorkspace } from "@/lib/github-expansion/workspace";
import { issueBranchName, validBranchName } from "@/lib/github-ui/issue-branch";
import { useReviewTaskStore } from "@/lib/github-ui/review-task-store";
import { parseRemoteUrl } from "@/lib/github-ui/target";
import { draftIssueContext, isFullSha, resumePrompt, resumeState, type LinkedWorkspace } from "@/lib/github-ui/workspace-resume";
import type { HubAccount } from "@/lib/hub/types";
import { useRepoStore } from "@/lib/repo-store";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import { invoke } from "@tauri-apps/api/core";
import { Bot, Code2, GitBranchPlus, Loader2, Play, RefreshCw, Terminal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/** Open local clones whose `origin` points at this GitHub repository. */
export function useLocalClones(host: string, fullName: string): string[] | null {
  const paths = useRepoStore((s) => Object.keys(s.repos).join("\n"));
  const [hits, setHits] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all(
      (paths ? paths.split("\n") : []).map(async (p) => {
        const rs = await invoke<{ name: string; url: string }[]>("list_git_remotes", { path: p }).catch(() => []);
        const o = rs.find((r) => r.name === "origin") ?? rs[0];
        const parsed = o ? parseRemoteUrl(o.url) : null;
        return parsed && parsed.host === host.toLowerCase() && parsed.fullName.toLowerCase() === fullName.toLowerCase() ? p : null;
      }),
    ).then((r) => live && setHits(r.filter((x): x is string => !!x)));
    return () => {
      live = false;
    };
  }, [paths, host, fullName]);
  return hits;
}

const btn = "h-6 text-[0.6875rem]";

/**
 * 31: restore a linked workspace — reopen it, show its saved branch panel, latest recorded agent evidence/checks and
 * review progress, and let the user edit the saved context before (explicitly) handing it to an agent.
 */
export function WorkspaceResume({ subject, workspace: ws, currentHead, onUnlink }: { subject: string; workspace: LinkedWorkspace; currentHead?: string | null; onUnlink: () => void }) {
  const { t } = useTranslation();
  const ide = useWorkspacePrefs((s) => s.ideLaunchCommand);
  const sendToAgent = useAgentChatStore((s) => s.sendMessage);
  const update = useGithubWorkspace((s) => s.updateSubject);
  const branchContexts = useGithubWorkspace((s) => s.branchContexts);
  const review = useGithubWorkspace((s) => s.reviews[subject]);
  const evidence = useChangeWorkflow((s) => s.evidence);
  const tasks = useReviewTaskStore((s) => s.done[subject]);
  const state = useMemo(() => resumeState({ workspace: ws, evidence, branchContexts, review, reviewTasksDone: tasks, currentHead }), [ws, evidence, branchContexts, review, tasks, currentHead]);
  const [context, setContext] = useState(ws.context);
  useEffect(() => setContext(ws.context), [ws.context]);
  const saveContext = () => context !== ws.context && update(subject, { workspace: { ...ws, context } });
  const ev = state.evidence;
  return (
    <div className="space-y-1.5" data-testid="workspace-resume">
      <p>
        {t("startWork.linked", { branch: ws.branch })} <span className="font-mono text-[0.625rem] text-muted-foreground">{ws.worktreePath}</span>
      </p>
      <ul className="space-y-0.5 text-[0.6875rem] text-muted-foreground">
        {state.branchContext && <li>{t("startWork.resumePanel", { panel: state.branchContext.panel, file: state.branchContext.file ?? "—" })}</li>}
        {ev ? (
          <li>
            {t("startWork.resumeEvidence", { task: ev.task, passed: ev.passed, failed: ev.failed, running: ev.running, sha: ev.head.slice(0, 10) })}
            {ev.checks.length > 0 && <ul className="pl-3 font-mono">{ev.checks.map((c, i) => <li key={i} className={c.outcome === "failed" ? "text-rose-500" : c.outcome === "passed" ? "text-emerald-600" : ""}>{c.outcome}: {c.command}</li>)}</ul>}
            {ev.openIssues.length > 0 && <ul className="list-disc pl-4">{ev.openIssues.map((i) => <li key={i}>{i}</li>)}</ul>}
          </li>
        ) : (
          <li>{t("startWork.resumeNoEvidence")}</li>
        )}
        {state.review && <li className={state.review.headMoved ? "text-amber-600" : undefined}>{t(state.review.headMoved ? "startWork.resumeReviewMoved" : "startWork.resumeReview", { count: state.review.reviewedFiles, done: state.tasksDone, sha: state.review.head.slice(0, 10) })}</li>}
      </ul>
      <Textarea value={context} rows={4} onChange={(e) => setContext(e.target.value)} onBlur={saveContext} aria-label={t("startWork.context")} className="font-mono text-[0.625rem]" />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className={btn} onClick={() => void useRepoStore.getState().addRepo(ws.worktreePath).catch((e) => toastError(String(e)))}>
          <Play className="h-3 w-3" />{t("startWork.resume")}
        </Button>
        <Button size="sm" variant="outline" className={btn} onClick={() => void invoke("open_repo_terminal", { path: ws.worktreePath, useGitBash: false }).catch((e) => toastError(String(e)))}>
          <Terminal className="h-3 w-3" />{t("worktree.openTerminal")}
        </Button>
        <Button size="sm" variant="outline" className={btn} disabled={!ide.trim()} title={ide.trim() ? undefined : t("toolbar.noIdeCommand")}
          onClick={() => void invoke("open_repo_in_ide", { path: ws.worktreePath, ideLaunch: ide.trim() }).catch((e) => toastError(String(e)))}>
          <Code2 className="h-3 w-3" />{t("startWork.editor")}
        </Button>
        <Button size="sm" variant="outline" className={btn}
          onClick={() => {
            saveContext();
            const prompt = resumePrompt({ ...state, workspace: { ...ws, context } });
            if (!window.confirm(t("startWork.agentConfirm", { context: prompt.slice(0, 600) }))) return;
            void sendToAgent(ws.worktreePath, t("startWork.agentPrompt", { context: prompt })).catch((e) => toastError(String(e)));
          }}>
          <Bot className="h-3 w-3" />{t("startWork.agent")}
        </Button>
        <Button size="sm" variant="ghost" className={btn} onClick={onUnlink}>{t("startWork.unlink")}</Button>
      </div>
    </div>
  );
}

/** 3 + 31: issue → pinned base commit → canonical hooks-disabled branch + worktree; context previewed/edited before use. */
export function IssueStartWork({ account, fullName, issue, comments = [] }: { account: HubAccount; fullName: string; issue: GithubIssue; comments?: GithubComment[] }) {
  const { t } = useTranslation();
  const clones = useLocalClones(account.host, fullName);
  const key = subjectKey(account, fullName, "issue", issue.number);
  const ws = useGithubWorkspace((s) => s.subjects[key]?.workspace);
  const update = useGithubWorkspace((s) => s.updateSubject);
  const [base, setBase] = useState<string>("");
  const [baseSha, setBaseSha] = useState("");
  const [branch, setBranch] = useState(issueBranchName(issue.number, issue.title));
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [context, setContext] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (clones?.length && !base) setBase(clones[0]);
  }, [clones, base]);
  const resolveBase = () => {
    if (!base) return;
    setBaseSha("");
    void invoke<string>("git_resolve_commit", { path: base, rev: "HEAD" }).then(setBaseSha, (e) => toastError(String(e)));
  };
  useEffect(resolveBase, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  if (clones === null) return null;
  const draft = context ?? draftIssueContext(issue, comments, picked);

  async function create() {
    if (!validBranchName(branch) || !isFullSha(baseSha)) return;
    setBusy(true);
    try {
      const worktreePath = worktreeTargetPath(base, branch.replace(/\//g, "-"));
      const r = await createIssueWorkspace(account, fullName, issue, { repoPath: base, worktreePath, branch, expectedHeadSha: baseSha }, comments.filter((c) => picked.has(c.id)));
      // The user's edited preview replaces the canonical default context.
      if (context !== null) {
        const cur = useGithubWorkspace.getState().subjects[key]?.workspace;
        if (cur) update(key, { workspace: { ...cur, context } });
      }
      setWarning(r.cleanup_warning);
      if (r.cleanup_warning) toast.warning(r.cleanup_warning);
      toast.success(t("startWork.created", { branch: r.branch }));
    } catch (e) {
      toastError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-1.5 border-t border-border/50 pt-3 text-xs" data-testid="issue-start-work">
      <h3 className="font-semibold">{t("startWork.title")}</h3>
      {warning && <p role="status" className="text-[0.6875rem] text-amber-600">{t("startWork.cleanupWarning", { warning })}</p>}
      {ws ? (
        <>
          <WorkspaceResume subject={key} workspace={ws} onUnlink={() => update(key, { workspace: undefined })} />
          <p className="text-[0.625rem] text-muted-foreground">{t("startWork.prHint", { number: issue.number })}</p>
        </>
      ) : clones.length === 0 ? (
        <p className="text-muted-foreground">{t("startWork.noClone", { repo: fullName })}</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-end gap-1.5">
            {clones.length > 1 && (
              <select value={base} onChange={(e) => setBase(e.target.value)} aria-label={t("startWork.clone")} className="h-7 max-w-56 rounded-md border border-input bg-transparent px-2 text-xs">
                {clones.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <Input value={branch} onChange={(e) => setBranch(e.target.value)} aria-label={t("startWork.branch")} aria-invalid={!validBranchName(branch)} className="h-7 w-64 font-mono text-xs" />
            <Button size="sm" className="h-7 text-xs" disabled={busy || !base || !validBranchName(branch) || !isFullSha(baseSha)} onClick={() => void create()}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitBranchPlus className="h-3 w-3" />}
              {t("startWork.create")}
            </Button>
          </div>
          <p className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
            {baseSha ? t("startWork.baseAt", { sha: baseSha.slice(0, 12) }) : t("startWork.baseResolving")}
            <Button variant="ghost" size="icon" className="h-5 w-5" aria-label={t("startWork.refreshBase")} onClick={resolveBase}><RefreshCw className="h-3 w-3" /></Button>
            <span>{t("startWork.noScripts")}</span>
          </p>
          {comments.length > 0 && (
            <fieldset className="space-y-0.5">
              <legend className="text-[0.6875rem] font-medium">{t("startWork.pickComments")}</legend>
              {comments.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-[0.6875rem]">
                  <input type="checkbox" checked={picked.has(c.id)} onChange={(e) => {
                    setPicked((p) => { const n = new Set(p); e.target.checked ? n.add(c.id) : n.delete(c.id); return n; });
                    setContext(null);
                  }} />
                  <span className="truncate">{c.user?.login}: {c.body.split("\n")[0].slice(0, 80)}</span>
                </label>
              ))}
            </fieldset>
          )}
          <Textarea value={draft} rows={5} onChange={(e) => setContext(e.target.value)} aria-label={t("startWork.context")} className="font-mono text-[0.625rem]" />
        </div>
      )}
    </section>
  );
}
