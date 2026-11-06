import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { dispatchWorkflow, listWorkflows, readTemplate, type GithubWorkflow } from "@/lib/github-expansion/api";
import { listWorkflowRuns } from "@/lib/github-expansion/ci";
import { parseWorkflowInputs, validateWorkflowInputs, type WorkflowInput } from "@/lib/github-expansion/forms";
import { coerceInputs, dispatchedRunCandidates, environmentErrors, initialInputValues, returnedRunId, type InputValue } from "@/lib/github-ci-ui/ci-model";
import { getDefaultBranch, listEnvironments } from "@/lib/github-ci-ui/reads";
import type { GithubTarget } from "@/lib/github-ui/target";
import { Loader2, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorNote, ExtLink, Loading, Muted, runLabel, type RunX } from "./ci-shared";

type Outcome = { kind: "found"; run: RunX | null; id: number; url?: string } | { kind: "ambiguous"; runs: RunX[] } | { kind: "unknown" };
const POLLS = 6, POLL_MS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 43: workflow_dispatch with ref + typed inputs read from the workflow YAML at that ref. */
export function CiDispatch({ target, onDispatched, hostControlsRun }: { target: GithubTarget; onDispatched: (runId: number) => void; hostControlsRun: boolean }) {
  const { t } = useTranslation();
  const { account, fullName } = target;
  const [workflows, setWorkflows] = useState<GithubWorkflow[] | null>(null);
  const [wfError, setWfError] = useState<unknown>(null);
  const [wfId, setWfId] = useState<number | null>(null);
  const [ref, setRef] = useState("");
  type Schema = { state: "idle" | "loading" } | { state: "ready"; inputs: WorkflowInput[] } | { state: "error"; error: unknown };
  // Inputs belong to the exact workflow + ref they were read from; any other identity reads as idle.
  const [loaded, setLoaded] = useState<{ id: string; schema: Schema }>({ id: "", schema: { state: "idle" } });
  const [envs, setEnvs] = useState<string[] | null>(null);
  const [values, setValues] = useState<Record<string, InputValue>>({});
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dispatchError, setDispatchError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  useEffect(() => {
    let live = true;
    listWorkflows(account, fullName).then((p) => {
      if (!live) return;
      setWorkflows(p.items);
      setWfId((cur) => cur ?? p.items.find((w) => w.state === "active")?.id ?? null);
    }, (e) => live && (setWfError(e), setWorkflows([])));
    getDefaultBranch(account, fullName).then((b) => live && setRef((cur) => cur || b), () => {});
    listEnvironments(account, fullName).then((e) => live && setEnvs(e.map((x) => x.name)), () => live && setEnvs(null));
    return () => { live = false; };
  }, [account, fullName]);

  const wf = workflows?.find((w) => w.id === wfId) ?? null;
  const identity = wf ? `${wf.id}\n${wf.path}\n${ref.trim()}` : "";
  const current = useRef(identity);
  current.current = identity;
  const schema: Schema = loaded.id === identity ? loaded.schema : { state: "idle" };

  async function loadInputs() {
    if (!wf || !ref.trim()) return;
    const op = identity;
    setLoaded({ id: op, schema: { state: "loading" } });
    setOutcome(null);
    setDispatchError(null);
    try {
      const inputs = parseWorkflowInputs(await readTemplate(account, fullName, wf.path, ref.trim()));
      if (current.current !== op) return; // late result for a workflow/ref no longer selected
      setLoaded({ id: op, schema: { state: "ready", inputs } });
      setValues(initialInputValues(inputs));
      setTouched(false);
    } catch (error) {
      if (current.current === op) setLoaded({ id: op, schema: { state: "error", error } });
    }
  }

  const inputs = schema.state === "ready" ? schema.inputs : [];
  const typed = coerceInputs(inputs, values);
  const errors = schema.state === "ready" ? { ...validateWorkflowInputs(inputs, typed), ...Object.fromEntries(Object.keys(environmentErrors(inputs, typed, envs)).map((k) => [k, t("ghci.dispatch.unknownEnv")])) } : {};
  const valid = schema.state === "ready" && !Object.keys(errors).length;

  async function dispatch() {
    setTouched(true);
    // Dispatch only with inputs read for exactly the selected workflow + ref.
    if (!wf || !valid || loaded.id !== identity || loaded.schema.state !== "ready") return;
    setBusy(true);
    setDispatchError(null);
    setOutcome(null);
    try {
      const before = new Set((await listWorkflowRuns(account, fullName, { workflowId: wf.id })).items.map((r) => r.id));
      const since = Date.now();
      // Dispatch exactly once; a possibly-accepted request is never retried.
      const res = await dispatchWorkflow(account, fullName, wf.id, ref.trim(), typed);
      const id = returnedRunId(res);
      if (id) { setOutcome({ kind: "found", run: null, id, url: res?.html_url }); return; }
      for (let i = 0; i < POLLS; i++) {
        await sleep(POLL_MS);
        const runs = (await listWorkflowRuns(account, fullName, { workflowId: wf.id, branch: ref.trim() })).items as RunX[];
        const hits = dispatchedRunCandidates(runs, { before, workflowId: wf.id, ref: ref.trim(), since, login: account.login });
        if (hits.length === 1) { setOutcome({ kind: "found", run: hits[0], id: hits[0].id, url: hits[0].html_url }); return; }
        if (hits.length > 1) { setOutcome({ kind: "ambiguous", runs: hits }); return; }
      }
      setOutcome({ kind: "unknown" });
    } catch (e) {
      setDispatchError(e);
    } finally {
      setBusy(false);
    }
  }

  if (workflows === null) return <Loading />;
  if (wfError != null) return <ErrorNote error={wfError} />;
  if (!workflows.length) return <Muted>{t("ghci.dispatch.noWorkflows")}</Muted>;

  const set = (name: string, v: InputValue) => setValues((cur) => ({ ...cur, [name]: v }));

  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void dispatch(); }}>
      <div className="flex flex-wrap items-end gap-1.5">
        <label className="space-y-0.5">
          <span className="block text-muted-foreground">{t("ghci.dispatch.workflow")}</span>
          <select value={wfId ?? ""} onChange={(e) => setWfId(Number(e.target.value))} className="h-7 max-w-72 rounded-md border border-input bg-transparent px-2 text-xs">
            {workflows.map((w) => <option key={w.id} value={w.id} disabled={w.state !== "active"}>{w.name}{w.state !== "active" ? ` (${w.state.replace(/_/g, " ")})` : ""}</option>)}
          </select>
        </label>
        <label className="space-y-0.5">
          <span className="block text-muted-foreground">{t("ghci.dispatch.ref")}</span>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} className="h-7 w-48 font-mono text-xs" placeholder="main" />
        </label>
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={!wf || !ref.trim() || schema.state === "loading"} onClick={() => void loadInputs()}>
          {schema.state === "loading" && <Loader2 className="h-3 w-3 animate-spin" />}{t("ghci.dispatch.loadInputs")}
        </Button>
        {wf && <ExtLink href={wf.html_url}>{wf.path}</ExtLink>}
      </div>
      {schema.state === "idle" && <Muted>{t("ghci.dispatch.idleHint")}</Muted>}
      {schema.state === "error" && (String(schema.error).includes("manual dispatch") ? <Muted>{t("ghci.dispatch.notDispatchable")}</Muted> : <ErrorNote error={schema.error} />)}

      {schema.state === "ready" && (
        <>
          {inputs.length === 0 && <Muted>{t("ghci.dispatch.noInputs")}</Muted>}
          {inputs.map((i) => {
            const v = values[i.name];
            const err = touched || v !== undefined ? errors[i.name] : undefined;
            const id = `ghci-in-${i.name}`;
            return (
              <div key={i.name} className="space-y-0.5">
                <label htmlFor={id} className="font-medium">{i.name}{i.required && <span className="text-destructive" aria-hidden> *</span>} <span className="font-normal text-muted-foreground">({i.type})</span></label>
                {i.description && <Muted>{i.description}</Muted>}
                {i.type === "boolean" ? (
                  <Switch id={id} checked={v === true} onCheckedChange={(c) => set(i.name, c)} />
                ) : i.type === "choice" || (i.type === "environment" && envs?.length) ? (
                  <select id={id} value={String(v ?? "")} onChange={(e) => set(i.name, e.target.value)} aria-invalid={!!err} className="h-7 max-w-72 rounded-md border border-input bg-transparent px-2 text-xs">
                    <option value="">—</option>
                    {(i.type === "choice" ? i.options : envs ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <Input id={id} value={String(v ?? "")} inputMode={i.type === "number" ? "decimal" : undefined} onChange={(e) => set(i.name, e.target.value)} aria-invalid={!!err} className="h-7 w-72 text-xs" />
                )}
                {i.type === "environment" && envs === null && <Muted>{t("ghci.dispatch.envUnknown")}</Muted>}
                {err && <p className="text-destructive" role="alert">{err}</p>}
              </div>
            );
          })}
          <Button type="submit" size="sm" className="h-7 text-xs" disabled={busy || !valid}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}{t("ghci.dispatch.run", { ref: ref.trim() })}
          </Button>
        </>
      )}
      {busy && <Muted>{t("ghci.dispatch.finding")}</Muted>}
      {dispatchError != null && <ErrorNote error={dispatchError} />}
      {outcome?.kind === "found" && (
        <p className="flex flex-wrap items-center gap-2" role="status">
          {t("ghci.dispatch.created", { id: outcome.id })}
          <ExtLink href={outcome.url}>{t("ghci.openOnGithub")}</ExtLink>
          {!hostControlsRun && <Button type="button" size="sm" variant="outline" className="h-6 text-[0.6875rem]" onClick={() => onDispatched(outcome.id)}>{t("ghci.dispatch.show")}</Button>}
        </p>
      )}
      {outcome?.kind === "ambiguous" && (
        <div role="status">
          <Muted>{t("ghci.dispatch.ambiguous")}</Muted>
          <ul className="pl-4">{outcome.runs.map((r) => <li key={r.id}><ExtLink href={r.html_url}>{runLabel(r)}</ExtLink></li>)}</ul>
        </div>
      )}
      {outcome?.kind === "unknown" && <Muted>{t("ghci.dispatch.notFound")}</Muted>}
    </form>
  );
}
