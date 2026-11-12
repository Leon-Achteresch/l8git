import { formatBackendError } from '@/lib/backend-error';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { BehaviorSide, GitExpansionResponseMap, IntegrationResult, OverlapResult, PlanStep } from "@/lib/git-expansion";
import { radarRequest, worktreeOverlapRows } from "@/lib/github-ui/worktree-radar";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { CommandFields, Field, Pre, RunButton, RunOutput, Section, TextField, commandOf, confirmRun, short, useCommand, useGx } from "./workbench-kit";

const head = (path: string) => invoke<string>("git_resolve_commit", { path, rev: "HEAD" });
const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** 65: runs the configured test at the current bisect commit and (optionally) marks the verdict. */
export function BisectRunTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [cmd, setCmd] = useCommand();
  const [mark, setMark] = useState(true);
  const [log, setLog] = useState<GitExpansionResponseMap["bisect_test"][]>([]);
  async function step() {
    const c = commandOf(cmd);
    const h = await head(path).catch(() => null);
    if (!c || !h || !confirmRun(t, c, short(h))) return;
    const r = await gx.call({ op: "bisect_test", command: c, expectedHead: h, markResult: mark, confirmed: true });
    if (r) setLog((l) => [r, ...l]);
  }
  return (
    <Section id="bisect" title={t("wb.bisect")} hint={t("wb.bisectHint")}>
      <CommandFields value={cmd} onChange={setCmd} />
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={mark} onChange={(e) => setMark(e.target.checked)} />
        {t("wb.bisectMark")}
      </label>
      <RunButton busy={gx.busy} disabled={!commandOf(cmd)} onClick={() => void step()}>{t("wb.bisectStep")}</RunButton>
      {log.map((r, i) => (
        <div key={i} className="rounded-md border border-border/50 p-2 text-xs">
          <p>
            <span className="font-mono">{short(r.head)}</span> → {r.verdict ? t(`wb.verdict.${r.verdict}`) : t("wb.verdictNone")}
            {r.marked ? ` · ${t("wb.marked")}` : ""}
          </p>
          <RunOutput run={r.run} />
          {r.log && <Pre max={32} text={r.log} />}
        </div>
      ))}
    </Section>
  );
}

function IntegrationView({ r }: { r: IntegrationResult }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 text-xs">
      <p className="text-[0.625rem] text-muted-foreground">{t("wb.integrationPinned", { base: short(r.base), heads: r.heads.map(short).join(", "), result: r.resultHead ? short(r.resultHead) : "—" })}</p>
      <ul>
        {r.steps.map((s, i) => (
          <li key={i} className={s.success ? "text-emerald-500" : "text-rose-500"}>
            {s.kind} {short(s.commit)} — {s.success ? t("wb.stepOk") : t("wb.stepFailed")}
          </li>
        ))}
      </ul>
      {r.conflicts.length > 0 ? <p className="text-rose-500">{t("wb.provenConflicts", { files: r.conflicts.join(", ") })}</p> : <p className="text-emerald-500">{t("wb.noTextConflicts")}</p>}
      {r.run && <RunOutput run={r.run} />}
      <p className="text-[0.625rem] text-muted-foreground">{t("wb.testsDisclaimer")}</p>
    </div>
  );
}

type Variant = { label: string; heads: string[]; result: IntegrationResult };

/** 69: simulate merging chosen heads onto a base in an isolated worktree, optionally run one command; keep variants side by side. */
export function IntegrationLabTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [base, setBase] = useState("main");
  const [heads, setHeads] = useState("");
  const [cmd, setCmd] = useCommand();
  const [variants, setVariants] = useState<Variant[]>([]);
  async function run() {
    const list = lines(heads);
    const c = cmd.line.trim() ? commandOf(cmd) : null;
    if (cmd.line.trim() && !c) return;
    if (c && !confirmRun(t, c, t("wb.isolatedWorktree"))) return;
    const r = await gx.call({ op: "integration", base, heads: list, command: c ?? undefined, confirmed: !!c });
    if (r) setVariants((v) => [{ label: `${base} + ${list.join(" + ")}`, heads: list, result: r }, ...v].slice(0, 6));
  }
  return (
    <Section id="integration" title={t("wb.integration")} hint={t("wb.integrationHint")}>
      <TextField label={t("wb.base")} value={base} onChange={setBase} />
      <Field label={t("wb.headsPerLine")}><Textarea rows={3} value={heads} onChange={(e) => setHeads(e.target.value)} className="font-mono text-xs" placeholder={"feature/a\nagent/xyz\nrefs/pull/42/head"} /></Field>
      <CommandFields value={cmd} onChange={setCmd} />
      <RunButton busy={gx.busy} disabled={!base.trim() || !lines(heads).length} onClick={() => void run()}>{t("wb.simulate")}</RunButton>
      {variants.map((v, i) => (
        <div key={i} className="rounded-md border border-border/50 p-2">
          <p className="mb-1 font-mono text-[0.6875rem] font-semibold">{v.label}</p>
          <IntegrationView r={v.result} />
        </div>
      ))}
    </Section>
  );
}

/** 70: changed-file overlap (hypothesis) separated from simulated merge conflicts (proof). */
export function ConflictRadarTool({ path, initialHeads = [] }: { path: string; initialHeads?: string[] }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [base, setBase] = useState("main");
  const [heads, setHeads] = useState(initialHeads.join("\n"));
  const [res, setRes] = useState<OverlapResult | null>(null);
  const [proof, setProof] = useState<Record<string, IntegrationResult>>({});
  async function prove(a: string, b: string) {
    const r = await gx.call({ op: "integration", base, heads: [a, b], confirmed: false });
    if (r) setProof((p) => ({ ...p, [`${a}|${b}`]: r }));
  }
  return (
    <Section id="radar" title={t("wb.radar")} hint={t("wb.radarHint")}>
      <TextField label={t("wb.base")} value={base} onChange={setBase} />
      <Field label={t("wb.headsPerLine")}><Textarea rows={3} value={heads} onChange={(e) => setHeads(e.target.value)} className="font-mono text-xs" /></Field>
      <RunButton busy={gx.busy} disabled={lines(heads).length < 2} onClick={() => void gx.call(radarRequest(base, lines(heads))).then((r) => r && setRes(r))}>{t("wb.scan")}</RunButton>
      {res && (
        <div className="space-y-1.5 text-xs">
          {res.overlaps.length === 0 && <p className="text-emerald-500">{t("wb.noOverlap")}</p>}
          {res.overlaps.map((o) => {
            const [a, b] = o.heads;
            const key = `${a}|${b}`;
            const p = proof[key];
            return (
              <div key={o.file} className="rounded-md border border-border/50 p-2">
                <p className="font-mono">{o.file}</p>
                <p className="text-[0.625rem] text-amber-500">{t("wb.overlapHypothesis", { heads: o.heads.join(", ") })}</p>
                {p ? (
                  <p className={p.conflicts.includes(o.file) ? "text-rose-500" : "text-emerald-500"}>
                    {p.conflicts.includes(o.file) ? t("wb.conflictProven") : t("wb.conflictNotProven")}
                  </p>
                ) : (
                  o.heads.length >= 2 && <Button variant="ghost" size="sm" className="h-5 text-[0.625rem]" disabled={gx.busy} onClick={() => void prove(a, b)}>{t("wb.provePair", { a, b })}</Button>
                )}
              </div>
            );
          })}
          <p className="text-[0.625rem] text-muted-foreground">{t("wb.radarNote")}</p>
          <WorktreeOverlaps res={res} />
        </div>
      )}
    </Section>
  );
}

/** Active worktrees (committed + uncommitted edits). Evidence only: test merges above use committed heads, never dirty edits. */
function WorktreeOverlaps({ res }: { res: OverlapResult }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 border-t border-border/50 pt-1.5" data-testid="radar-worktrees">
      <p className="text-[0.6875rem] font-semibold">{t("wb.worktreeOverlaps", { count: res.worktrees.length })}</p>
      {res.worktreeOverlaps.length === 0 && res.worktrees.length > 0 && <p className="text-emerald-500">{t("wb.noWorktreeOverlap")}</p>}
      {worktreeOverlapRows(res).map((o) => (
        <div key={o.file} className="rounded-md border border-border/50 p-2">
          <p className="font-mono">{o.file}</p>
          <ul className="text-[0.625rem] text-amber-500">
            {o.worktrees.map((w) => (
              <li key={w.path} className="font-mono">{w.path}{w.pending && <span className="ml-1 text-rose-500">{t("wb.pendingEdit")}</span>}</li>
            ))}
          </ul>
        </div>
      ))}
      {res.worktreeErrors.map((e) => <p key={e.path} className="text-[0.625rem] text-rose-500">{t("wb.worktreeError", { path: e.path, error: formatBackendError(e.error) })}</p>)}
      <p className="text-[0.625rem] text-muted-foreground">{t("wb.worktreeNote")}</p>
    </div>
  );
}

function Side({ label, s }: { label: string; s: BehaviorSide }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-[0.6875rem] font-semibold">{label} <span className="font-mono text-muted-foreground">{short(s.head)}</span></p>
      <RunOutput run={s.run} />
      {s.artifacts.map((a) => (
        <p key={a.path} className="truncate font-mono text-[0.625rem]" title={a.sha256}>{a.path} · {a.size} B · {a.sha256.slice(0, 12)}</p>
      ))}
      {s.missingArtifacts.length > 0 && <p className="text-[0.625rem] text-amber-500">{t("wb.missingArtifacts", { files: s.missingArtifacts.join(", ") })}</p>}
    </div>
  );
}

/** 73: run the same declared command on two pinned revisions in isolation and compare outputs/artifacts. */
export function BehaviorCompareTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [base, setBase] = useState("main");
  const [headRef, setHeadRef] = useState("HEAD");
  const [artifacts, setArtifacts] = useState("");
  const [cmd, setCmd] = useCommand();
  const [res, setRes] = useState<GitExpansionResponseMap["behavior_compare"] | null>(null);
  async function run() {
    const c = commandOf(cmd);
    if (!c || !confirmRun(t, c, `${base}, ${headRef}`)) return;
    const r = await gx.call({ op: "behavior_compare", base, head: headRef, command: c, artifacts: lines(artifacts), confirmed: true });
    if (r) setRes(r);
  }
  return (
    <Section id="behavior" title={t("wb.behavior")} hint={t("wb.behaviorHint")}>
      <div className="grid grid-cols-2 gap-2">
        <TextField label={t("wb.base")} value={base} onChange={setBase} />
        <TextField label={t("wb.head")} value={headRef} onChange={setHeadRef} />
      </div>
      <CommandFields value={cmd} onChange={setCmd} />
      <Field label={t("wb.artifactsPerLine")}><Textarea rows={2} value={artifacts} onChange={(e) => setArtifacts(e.target.value)} className="font-mono text-xs" placeholder={"out/api.json\nscreenshots/home.png"} /></Field>
      <RunButton busy={gx.busy} disabled={!commandOf(cmd)} onClick={() => void run()}>{t("wb.compare")}</RunButton>
      {res && (
        <div className="space-y-1.5 text-xs">
          <p className={res.sameOutput && res.changedArtifacts.length === 0 ? "text-emerald-500" : "text-amber-500"}>
            {res.sameOutput ? t("wb.sameOutput") : t("wb.differentOutput")}
            {res.changedArtifacts.length > 0 && ` · ${t("wb.changedArtifacts", { files: res.changedArtifacts.join(", ") })}`}
          </p>
          <div className="grid grid-cols-2 gap-2"><Side label={t("wb.base")} s={res.base} /><Side label={t("wb.head")} s={res.head} /></div>
          <p className="text-[0.625rem] text-muted-foreground">{t("wb.behaviorNote")}</p>
        </div>
      )}
    </Section>
  );
}

/** 77: a visible, editable plan of merge/cherry-pick/revert steps on a pinned base, rehearsed in isolation before export. */
export function GitPlanTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [base, setBase] = useState("HEAD");
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [kind, setKind] = useState<PlanStep["kind"]>("cherry_pick");
  const [commit, setCommit] = useState("");
  const [preview, setPreview] = useState<GitExpansionResponseMap["plan_preview"] | null>(null);
  const [branch, setBranch] = useState("");
  const edit = (next: PlanStep[]) => { setSteps(next); setPreview(null); };
  const move = (i: number, d: number) => {
    const n = [...steps];
    const [x] = n.splice(i, 1);
    n.splice(Math.max(0, Math.min(n.length, i + d)), 0, x);
    edit(n);
  };
  async function exportPlan() {
    if (!preview || !branch.trim()) return;
    const h = await head(path).catch(() => null);
    if (!h || !window.confirm(t("wb.planExportConfirm", { branch, head: short(preview.resultHead) }))) return;
    const r = await gx.call({ op: "plan_export", planId: preview.planId, branch: branch.trim(), expectedHead: h });
    if (r) toast.success(t("wb.planExported", { branch: r.branch, head: short(r.head) }));
  }
  return (
    <Section id="plan" title={t("wb.plan")} hint={t("wb.planHint")}>
      <TextField label={t("wb.base")} value={base} onChange={(v) => { setBase(v); setPreview(null); }} />
      <ol className="space-y-1">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-5 text-right text-muted-foreground">{i + 1}.</span>
            <span className="w-24">{t(`wb.kind.${s.kind}`)}</span>
            <span className="flex-1 font-mono">{s.commit}</span>
            <Button variant="ghost" size="sm" className="h-5 px-1 text-[0.625rem]" aria-label={t("wb.moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
            <Button variant="ghost" size="sm" className="h-5 px-1 text-[0.625rem]" aria-label={t("wb.moveDown")} disabled={i === steps.length - 1} onClick={() => move(i, 1)}>↓</Button>
            <Button variant="ghost" size="sm" className="h-5 px-1 text-[0.625rem]" onClick={() => edit(steps.filter((_, j) => j !== i))}>{t("common.remove")}</Button>
          </li>
        ))}
      </ol>
      <div className="flex items-end gap-1.5">
        <Field label={t("wb.action")}>
          <select value={kind} onChange={(e) => setKind(e.target.value as PlanStep["kind"])} className="h-7 rounded-md border border-input bg-transparent px-2 text-xs">
            {(["cherry_pick", "merge", "revert"] as const).map((k) => <option key={k} value={k}>{t(`wb.kind.${k}`)}</option>)}
          </select>
        </Field>
        <div className="flex-1"><TextField label={t("wb.commitOrRef")} value={commit} onChange={setCommit} /></div>
        <Button variant="outline" size="sm" className="h-7 text-xs" disabled={!commit.trim()} onClick={() => { edit([...steps, { kind, commit: commit.trim() }]); setCommit(""); }}>{t("common.add")}</Button>
      </div>
      <RunButton busy={gx.busy} disabled={!steps.length} onClick={() => void gx.call({ op: "plan_preview", base, steps }).then((r) => r && setPreview(r))}>{t("wb.dryRun")}</RunButton>
      {preview && (
        <>
          <IntegrationView r={preview} />
          {preview.conflicts.length === 0 && preview.steps.every((s) => s.success) && (
            <div className="flex items-end gap-1.5">
              <div className="flex-1"><TextField label={t("wb.exportBranch")} value={branch} onChange={setBranch} /></div>
              <RunButton busy={gx.busy} disabled={!branch.trim()} onClick={() => void exportPlan()}>{t("wb.export")}</RunButton>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
