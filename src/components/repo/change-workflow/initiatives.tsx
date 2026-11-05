import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { planInitiative, type ChangeInitiative, type InitiativeStep } from "@/lib/change-workflow/model";
import { useChangeWorkflow } from "@/lib/change-workflow/store";
import { mergeStep, prNumberFromUrl, resolveRunningStep, type MergeMethod, type ProviderPr } from "@/lib/change-workflow-ui/initiative-ops";
import { isHubPath } from "@/lib/hub/store";
import { invoke } from "@/lib/platform/ipc";
import { useRepoStore, type PullRequest } from "@/lib/repo-store";
import { GitMerge, Loader2, Plus, RotateCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadStatus, Pick, StateBadge, errText, short, useLoad } from "./kit";

const repoName = (p: string) => p.split(/[\\/]/).filter(Boolean).pop() ?? p;

export function InitiativesPanel({ scope }: { scope: string }) {
  const { t } = useTranslation();
  const all = useChangeWorkflow((s) => s.initiatives);
  const saveInitiative = useChangeWorkflow((s) => s.saveInitiative);
  const removeInitiative = useChangeWorkflow((s) => s.removeInitiative);
  const list = useMemo(() => Object.values(all).filter((i) => i.scope === scope).sort((a, b) => a.name.localeCompare(b.name)), [all, scope]);
  const [name, setName] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-[0.6875rem] text-muted-foreground">{t("changeInitiative.intro")}</p>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          saveInitiative({ id: crypto.randomUUID(), scope, name: name.trim(), steps: [] });
          setName("");
        }}
      >
        <label className="block flex-1 text-[0.6875rem] font-medium text-muted-foreground">
          {t("changeInitiative.name")}
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-0.5 h-7 text-xs" />
        </label>
        <Button type="submit" size="sm" className="h-7 gap-1 text-xs" disabled={!name.trim()}>
          <Plus className="size-3" /> {t("changeInitiative.create")}
        </Button>
      </form>
      {list.length === 0 && <p className="text-[0.6875rem] text-muted-foreground">{t("changeInitiative.none")}</p>}
      {list.map((i) => (
        <InitiativeCard key={i.id} initiative={i} onRemove={() => window.confirm(t("changeInitiative.confirmRemove", { name: i.name })) && removeInitiative(i.scope, i.id)} />
      ))}
    </div>
  );
}

function InitiativeCard({ initiative, onRemove }: { initiative: ChangeInitiative; onRemove: () => void }) {
  const { t } = useTranslation();
  const saveInitiative = useChangeWorkflow((s) => s.saveInitiative);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<MergeMethod>("merge");
  const [adding, setAdding] = useState(false);
  const [live, setLive] = useState<Record<string, { pr: ProviderPr | null; branchHead: string | null; error: string | null }>>({});

  let plan: ReturnType<typeof planInitiative> | null = null;
  let planError: string | null = null;
  try { plan = planInitiative(initiative); } catch (e) { planError = errText(e); }
  const byId = new Map(initiative.steps.map((s) => [s.id, s]));
  const latest = () => useChangeWorkflow.getState().initiatives[JSON.stringify([initiative.scope, initiative.id])] ?? initiative;

  // Persist every transition; store validation errors surface instead of being swallowed.
  const save = (next: ChangeInitiative) => {
    try { saveInitiative(next); } catch (e) { setError(errText(e)); }
  };

  async function merge(step: InitiativeStep) {
    if (!window.confirm(t("changeInitiative.confirmMerge", { pr: step.pullRequestUrl, repo: repoName(step.repository), head: short(step.headSha), method }))) return;
    setBusy(step.id);
    setError(null);
    try {
      await mergeStep(latest(), step.id, method, save);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    setError(null);
    let next = latest();
    const observed: typeof live = {};
    for (const step of next.steps) {
      if (step.status === "running") next = await resolveRunningStep(next, step.id);
      const number = prNumberFromUrl(step.pullRequestUrl);
      const [pr, head] = await Promise.allSettled([
        number ? invoke<ProviderPr>("pr_detail", { path: step.repository, number }) : Promise.resolve(null),
        invoke<string>("git_resolve_commit", { path: step.repository, rev: `refs/heads/${step.branch}` }),
      ]);
      observed[step.id] = {
        pr: pr.status === "fulfilled" ? pr.value : null,
        branchHead: head.status === "fulfilled" ? head.value : null,
        error: [pr, head].filter((r) => r.status === "rejected").map((r) => errText((r as PromiseRejectedResult).reason)).join(" · ") || null,
      };
    }
    save(next);
    setLive(observed);
    setBusy(null);
  }

  function setDeps(step: InitiativeStep, dependsOn: string[]) {
    const next = { ...initiative, steps: initiative.steps.map((s) => (s.id === step.id ? { ...s, dependsOn } : s)) };
    try {
      planInitiative(next);
      if (step.status !== "pending" && step.status !== "failed") throw new Error(t("changeInitiative.depsLocked"));
      saveInitiative(next);
      setError(null);
    } catch (e) {
      setError(errText(e));
    }
  }

  function removeStep(step: InitiativeStep) {
    if (initiative.steps.some((s) => s.dependsOn.includes(step.id))) { setError(t("changeInitiative.hasDependents")); return; }
    if (step.status === "running") { setError(t("changeInitiative.stepRunning")); return; }
    save({ ...initiative, steps: initiative.steps.filter((s) => s.id !== step.id) });
  }

  const ordered = plan ? plan.order.map((id) => byId.get(id)!) : initiative.steps;
  const done = initiative.steps.filter((s) => s.status === "done").length;

  return (
    <article className="space-y-2 rounded-md border border-border/60 p-2" aria-label={initiative.name}>
      <div className="flex items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-xs font-semibold">{initiative.name}</h4>
        <span className="text-[0.625rem] text-muted-foreground">{t("changeInitiative.progress", { done, total: initiative.steps.length })}</span>
        <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("changeInitiative.refresh")} title={t("changeInitiative.refresh")} disabled={!!busy || initiative.steps.length === 0} onClick={() => void refresh()}>
          {busy === "refresh" ? <Loader2 className="size-3 animate-spin" /> : <RotateCw className="size-3" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("common.remove")} title={t("common.remove")} disabled={!!busy || initiative.steps.some((s) => s.status === "running")} onClick={onRemove}>
          <Trash2 className="size-3" />
        </Button>
      </div>
      <p className="text-[0.625rem] text-muted-foreground">{t("changeInitiative.notAtomic")}</p>
      {planError && <p role="alert" className="text-[0.6875rem] text-destructive">{planError}</p>}

      {initiative.steps.length > 0 && (
        <div className="w-40">
          <Pick label={t("changeInitiative.method")} value={method} onChange={(v) => setMethod(v as MergeMethod)}
            options={(["merge", "squash", "rebase"] as const).map((m) => ({ value: m, label: t(`changeInitiative.methods.${m}`) }))} />
        </div>
      )}

      <ol className="space-y-1.5">
        {ordered.map((step, n) => {
          const ready = plan?.ready.includes(step.id);
          const obs = live[step.id];
          return (
            <li key={step.id} className="space-y-1 rounded border border-border/40 p-1.5 text-[0.6875rem]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground">{n + 1}.</span>
                <StateBadge state={step.status} label={t(`changeInitiative.status.${step.status}`)} />
                <span className="font-semibold">{repoName(step.repository)}</span>
                <code>{step.branch}</code>
                <code className="text-muted-foreground">@{short(step.headSha)}</code>
                {step.pullRequestUrl && <a href={step.pullRequestUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">{t("changeInitiative.pr", { number: prNumberFromUrl(step.pullRequestUrl) })}</a>}
                {step.status !== "done" && step.status !== "running" && !ready && <span className="text-muted-foreground">{t("changeInitiative.blocked")}</span>}
              </div>
              {step.error && <p role="alert" className="text-destructive">{step.error}</p>}
              {obs && (
                <p className="text-muted-foreground">
                  {obs.pr && t("changeInitiative.providerState", { state: obs.pr.state, head: short(obs.pr.head_sha) })}
                  {obs.pr && obs.pr.head_sha !== step.headSha && obs.pr.state !== "merged" && <span className="text-amber-600"> · {t("changeInitiative.headMoved")}</span>}
                  {obs.branchHead && obs.branchHead !== step.headSha && <span className="text-amber-600"> · {t("changeInitiative.branchMoved", { head: short(obs.branchHead) })}</span>}
                  {obs.error && <span className="text-destructive"> · {obs.error}</span>}
                </p>
              )}
              {initiative.steps.length > 1 && (
                <fieldset className="flex flex-wrap items-center gap-2">
                  <legend className="sr-only">{t("changeInitiative.dependsOn")}</legend>
                  <span className="text-muted-foreground">{t("changeInitiative.dependsOn")}:</span>
                  {initiative.steps.filter((s) => s.id !== step.id).map((s) => (
                    <label key={s.id} className="flex items-center gap-1">
                      <Checkbox
                        checked={step.dependsOn.includes(s.id)}
                        disabled={!!busy}
                        onCheckedChange={(v) => setDeps(step, v ? [...step.dependsOn, s.id] : step.dependsOn.filter((d) => d !== s.id))}
                      />
                      {repoName(s.repository)}/{s.branch}
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="flex gap-1.5">
                {ready && (
                  <Button type="button" size="sm" className="h-6 gap-1 px-2 text-[0.6875rem]" disabled={!!busy} onClick={() => void merge(step)}>
                    {busy === step.id ? <Loader2 className="size-3 animate-spin" /> : <GitMerge className="size-3" />}
                    {step.status === "failed" ? t("changeInitiative.retryMerge") : t("changeInitiative.merge")}
                  </Button>
                )}
                {step.status === "running" && busy !== step.id && <span className="text-muted-foreground">{t("changeInitiative.runningHint")}</span>}
                <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[0.6875rem]" disabled={!!busy || step.status === "running"} onClick={() => removeStep(step)}>
                  {t("changeInitiative.removeStep")}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      {error && <p role="alert" className="text-[0.6875rem] text-destructive">{error}</p>}

      {adding ? (
        <AddStep initiative={initiative} onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[0.6875rem]" disabled={!!busy} onClick={() => setAdding(true)}>
          <Plus className="size-3" /> {t("changeInitiative.addStep")}
        </Button>
      )}
    </article>
  );
}

function AddStep({ initiative, onDone }: { initiative: ChangeInitiative; onDone: () => void }) {
  const { t } = useTranslation();
  const saveInitiative = useChangeWorkflow((s) => s.saveInitiative);
  const repos = useRepoStore((s) => s.repos);
  const repoPaths = Object.keys(repos).filter((p) => !isHubPath(p));
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [deps, setDeps] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branches = (repos[repo]?.branches ?? []).filter((b) => !b.is_remote);
  const prs = useLoad(repo ? `prs:${repo}` : null, () => invoke<PullRequest[]>("pr_list", { path: repo }));
  const prOptions = (prs.data ?? []).filter((p) => p.source_branch === branch && p.state === "open");

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const pr = prOptions.find((p) => String(p.number) === prNumber);
      if (!pr) throw new Error(t("changeInitiative.needPr"));
      // Pin the local branch head and require the provider PR to point at the same commit.
      const [headSha, detail] = await Promise.all([
        invoke<string>("git_resolve_commit", { path: repo, rev: `refs/heads/${branch}` }),
        invoke<ProviderPr>("pr_detail", { path: repo, number: pr.number }),
      ]);
      if (detail.head_sha !== headSha) throw new Error(t("changeInitiative.pinMismatch", { local: short(headSha), remote: short(detail.head_sha) }));
      saveInitiative({
        ...initiative,
        steps: [...initiative.steps, { id: crypto.randomUUID(), repository: repo, branch, headSha, pullRequestUrl: detail.html_url, dependsOn: deps, status: "pending" }],
      });
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
      <div className="grid grid-cols-3 gap-2">
        <Pick label={t("changeInitiative.repository")} value={repo} onChange={(v) => { setRepo(v); setBranch(""); setPrNumber(""); }}
          placeholder={t("changeInitiative.chooseRepo")} options={repoPaths.map((p) => ({ value: p, label: repoName(p) }))} />
        <Pick label={t("changeInitiative.branch")} value={branch} onChange={(v) => { setBranch(v); setPrNumber(""); }} disabled={!repo}
          placeholder={t("changeInitiative.chooseBranch")} options={branches.map((b) => ({ value: b.name, label: b.name }))} />
        <Pick label={t("changeInitiative.pullRequest")} value={prNumber} onChange={setPrNumber} disabled={!branch}
          placeholder={t("changeInitiative.choosePr")} options={prOptions.map((p) => ({ value: String(p.number), label: `#${p.number} ${p.title}` }))} />
      </div>
      {repoPaths.length === 0 && <p className="text-[0.6875rem] text-muted-foreground">{t("changeInitiative.noRepos")}</p>}
      <LoadStatus state={prs} label={t("changeInitiative.loadingPrs")} />
      {branch && prs.data && prOptions.length === 0 && <p className="text-[0.6875rem] text-muted-foreground">{t("changeInitiative.noPrForBranch")}</p>}
      {initiative.steps.length > 0 && (
        <fieldset className="flex flex-wrap items-center gap-2 text-[0.6875rem]">
          <legend className="sr-only">{t("changeInitiative.dependsOn")}</legend>
          <span className="text-muted-foreground">{t("changeInitiative.dependsOn")}:</span>
          {initiative.steps.map((s) => (
            <label key={s.id} className="flex items-center gap-1">
              <Checkbox checked={deps.includes(s.id)} onCheckedChange={(v) => setDeps((d) => (v ? [...d, s.id] : d.filter((x) => x !== s.id)))} />
              {repoName(s.repository)}/{s.branch}
            </label>
          ))}
        </fieldset>
      )}
      {error && <p role="alert" className="text-[0.6875rem] text-destructive">{error}</p>}
      <div className="flex gap-1.5">
        <Button type="button" size="sm" className="h-7 text-xs" disabled={busy || !prNumber} onClick={() => void add()}>
          {busy && <Loader2 className="size-3 animate-spin" />} {t("changeInitiative.addStep")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone}>{t("common.cancel")}</Button>
      </div>
    </div>
  );
}
