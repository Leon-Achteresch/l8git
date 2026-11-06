import { CommandFields, Pre, commandOf, confirmRun, useCommand } from "@/components/repo/workbench/workbench-kit";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAgentChatStore } from "@/lib/agents/chat-store";
import { useAgentWorktreeStore, worktreeDisplayName } from "@/lib/agents/agent-worktrees";
import { evidenceState, type AgentEvidence, type EvidenceCheck, type EvidenceSnapshot } from "@/lib/change-workflow/model";
import { captureAgentSnapshot } from "@/lib/change-workflow/readers";
import { useChangeWorkflow } from "@/lib/change-workflow/store";
import { evidenceRun } from "@/lib/change-workflow-ui/backend";
import { commandLine } from "@/lib/workbench-ui/args";
import { Camera, Loader2, Play, RotateCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pick, StateBadge, errText, short } from "./kit";

const SUMMARY_CHARS = 4000;
const when = (iso: string | number) => new Date(iso).toLocaleString();

type Capture = { snapshot: EvidenceSnapshot; files: string[]; at: string };

export function AgentEvidencePanel({ path, scope }: { path: string; scope: string }) {
  const { t } = useTranslation();
  const all = useAgentWorktreeStore((s) => s.worktrees);
  const sessions = useMemo(() => Object.values(all).filter((w) => w.basePath === path).sort((a, b) => b.createdAt - a.createdAt), [all, path]);
  const [sessionPath, setSessionPath] = useState("");
  const session = sessions.find((s) => s.path === sessionPath) ?? null;
  const threads = useAgentChatStore((s) => (session ? s.threadsByPath[session.path] : undefined));
  const task = threads?.[0]?.title?.trim() || null;
  const allEvidence = useChangeWorkflow((s) => s.evidence);
  const recordEvidence = useChangeWorkflow((s) => s.recordEvidence);
  const removeEvidence = useChangeWorkflow((s) => s.removeEvidence);
  const records = useMemo(
    () => Object.values(allEvidence).filter((e) => e.scope === scope && e.sessionId === sessionPath).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [allEvidence, scope, sessionPath],
  );
  const [capture, setCapture] = useState<Capture | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState("");

  const pick = (p: string) => { setSessionPath(p); setCapture(null); setError(null); };

  async function snap() {
    if (!session) return null;
    setBusy("capture");
    setError(null);
    try {
      const res = await captureAgentSnapshot(session.path, path);
      const c = { ...res, at: new Date().toISOString() };
      setCapture(c);
      return c;
    } catch (e) {
      setError(errText(e));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function record() {
    if (!session) return;
    const c = await snap();
    if (!c) return;
    recordEvidence({
      id: crypto.randomUUID(), scope, sessionId: session.path, task: task ?? session.branch,
      recordedAt: c.at, snapshot: c.snapshot, files: c.files, checks: [],
      openIssues: issues.split("\n").map((l) => l.trim()).filter(Boolean),
    });
    setIssues("");
  }

  if (sessions.length === 0) return <p className="text-[0.6875rem] text-muted-foreground">{t("agentEvidence.noSessions")}</p>;

  return (
    <div className="space-y-3">
      <p className="text-[0.6875rem] text-muted-foreground">{t("agentEvidence.intro")}</p>
      <Pick
        label={t("agentEvidence.session")}
        value={sessionPath}
        onChange={pick}
        placeholder={t("agentEvidence.chooseSession")}
        options={sessions.map((s) => ({ value: s.path, label: `${worktreeDisplayName(s.path)} · ${s.branch}` }))}
      />
      {session && (
        <>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-0.5 text-[0.6875rem]">
            <dt className="text-muted-foreground">{t("agentEvidence.task")}</dt>
            <dd>{task ?? <span className="text-muted-foreground">{t("agentEvidence.unknownTask")}</span>}</dd>
            <dt className="text-muted-foreground">{t("agentEvidence.worktree")}</dt>
            <dd className="break-all font-mono">{session.path}</dd>
            <dt className="text-muted-foreground">{t("agentEvidence.branch")}</dt>
            <dd className="font-mono">{session.branch}</dd>
            <dt className="text-muted-foreground">{t("agentEvidence.created")}</dt>
            <dd>{when(session.createdAt)}</dd>
          </dl>

          <div className="space-y-1.5 rounded-md border border-border/60 p-2">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-[0.6875rem] font-semibold">{t("agentEvidence.currentContent")}</p>
              <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[0.6875rem]" disabled={!!busy} onClick={() => void snap()}>
                {busy === "capture" ? <Loader2 className="size-3 animate-spin" /> : <Camera className="size-3" />} {t("agentEvidence.capture")}
              </Button>
            </div>
            {capture ? <SnapshotView snapshot={capture.snapshot} files={capture.files} at={capture.at} /> : <p className="text-[0.6875rem] text-muted-foreground">{t("agentEvidence.notCaptured")}</p>}
            <label className="block text-[0.6875rem] font-medium text-muted-foreground">
              {t("agentEvidence.openIssues")}
              <Textarea value={issues} onChange={(e) => setIssues(e.target.value)} rows={2} className="mt-0.5 text-xs" placeholder={t("agentEvidence.openIssuesHint")} />
            </label>
            <Button type="button" size="sm" className="h-7 text-xs" disabled={!!busy} onClick={() => void record()}>{t("agentEvidence.record")}</Button>
          </div>
          {error && <p role="alert" className="text-[0.6875rem] text-destructive">{error}</p>}

          {records.length === 0 ? (
            <p className="text-[0.6875rem] text-muted-foreground">{t("agentEvidence.noRecords")}</p>
          ) : (
            records.map((ev) => (
              <EvidenceCard
                key={ev.id}
                evidence={ev}
                basePath={path}
                current={capture?.snapshot ?? null}
                busy={busy}
                setBusy={setBusy}
                onCurrent={(c) => setCapture(c)}
                onRefresh={() => void snap()}
                onSave={recordEvidence}
                onRemove={() => window.confirm(t("agentEvidence.confirmRemove")) && removeEvidence(ev.scope, ev.id)}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

function SnapshotView({ snapshot, files, at }: { snapshot: EvidenceSnapshot; files: string[]; at: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-0.5 text-[0.6875rem]">
      <p className="font-mono">
        {t("agentEvidence.base")} {short(snapshot.baseSha)} · {t("agentEvidence.head")} {short(snapshot.headSha)} · {t("agentEvidence.content")} {short(snapshot.worktreeFingerprint)}
      </p>
      <p className="text-muted-foreground">{t("agentEvidence.capturedAt", { at: when(at) })}</p>
      <details>
        <summary className="cursor-pointer">{t("agentEvidence.files", { count: files.length })}</summary>
        <ul className="max-h-24 overflow-auto font-mono text-[0.625rem]">{files.map((f) => <li key={f}>{f}</li>)}</ul>
      </details>
    </div>
  );
}

function EvidenceCard({ evidence, basePath, current, busy, setBusy, onCurrent, onRefresh, onSave, onRemove }: {
  evidence: AgentEvidence;
  basePath: string;
  current: EvidenceSnapshot | null;
  busy: string | null;
  setBusy: (b: string | null) => void;
  onCurrent: (c: Capture | null) => void;
  onRefresh: () => void;
  onSave: (e: AgentEvidence) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [cmd, setCmd] = useCommand();
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState(evidence.openIssues.join("\n"));
  const state = evidenceState(evidence, current);
  const spec = commandOf(cmd);

  async function runCheck() {
    if (!spec || !confirmRun(t, spec, evidence.sessionId)) return;
    setBusy(evidence.id);
    setError(null);
    const startedAt = new Date().toISOString();
    try {
      const res = await evidenceRun(evidence.sessionId, {
        basePath, expectedBaseHead: evidence.snapshot.baseSha, expectedHead: evidence.snapshot.headSha,
        expectedFingerprint: evidence.snapshot.worktreeFingerprint, command: spec, confirmed: true,
      });
      const finishedAt = new Date().toISOString();
      const output = [res.run.stdout, res.run.stderr].filter(Boolean).join("\n");
      const notes = [
        res.run.timedOut ? t("agentEvidence.timedOut") : t("agentEvidence.exit", { code: res.run.exitCode ?? "?" }),
        res.run.truncated ? t("agentEvidence.outputTruncated") : null,
        res.stale ? t("agentEvidence.changedDuringRun") : null,
        res.afterError ? t("agentEvidence.afterError", { error: res.afterError }) : null,
      ].filter(Boolean).join(" · ");
      const check: EvidenceCheck = {
        id: crypto.randomUUID(), command: commandLine(spec),
        outcome: res.run.exitCode === 0 && !res.run.timedOut ? "passed" : "failed",
        startedAt, finishedAt, outputSummary: `${notes}\n${output.slice(-SUMMARY_CHARS)}`,
        // A run whose content moved, or whose end state is unconfirmed, must never count as current, even if content later reverts.
        snapshot: res.stale || res.afterError ? { ...res.before, worktreeFingerprint: "" } : res.before,
      };
      onSave({ ...evidence, checks: [...evidence.checks, check] });
      // Never leave an older capture in place after a run: a stale run shows stale, a failed post-run capture shows unknown.
      onCurrent(res.after && !res.afterError ? { snapshot: res.after, files: res.files, at: finishedAt } : null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="space-y-2 rounded-md border border-border/60 p-2" aria-label={t("agentEvidence.recordLabel", { at: when(evidence.recordedAt) })}>
      <div className="flex items-center gap-2">
        <StateBadge state={state} label={t(`agentEvidence.state.${state}`)} />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{evidence.task}</span>
        <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("agentEvidence.refresh")} title={t("agentEvidence.refresh")} disabled={!!busy} onClick={onRefresh}>
          <RotateCw className="size-3" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("common.remove")} title={t("common.remove")} disabled={!!busy} onClick={onRemove}>
          <Trash2 className="size-3" />
        </Button>
      </div>
      <SnapshotView snapshot={evidence.snapshot} files={evidence.files} at={evidence.recordedAt} />
      {state === "unknown" && <p className="text-[0.6875rem] text-muted-foreground">{t("agentEvidence.unknownHint")}</p>}
      {state === "stale" && <p className="text-[0.6875rem] text-amber-600">{t("agentEvidence.staleHint")}</p>}

      <label className="block text-[0.6875rem] font-medium text-muted-foreground">
        {t("agentEvidence.openIssues")}
        <Textarea value={issues} onChange={(e) => setIssues(e.target.value)} rows={2} className="mt-0.5 text-xs" />
      </label>
      {issues !== evidence.openIssues.join("\n") && (
        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[0.6875rem]" onClick={() => onSave({ ...evidence, openIssues: issues.split("\n").map((l) => l.trim()).filter(Boolean) })}>
          {t("common.save")}
        </Button>
      )}

      <div className="space-y-1">
        <p className="text-[0.6875rem] font-semibold">{t("agentEvidence.checks")}</p>
        {evidence.checks.length === 0 && <p className="text-[0.6875rem] text-muted-foreground">{t("agentEvidence.noChecks")}</p>}
        {evidence.checks.map((c) => {
          const cs = evidenceState(c, current);
          return (
            <details key={c.id} className="rounded border border-border/40 px-2 py-1 text-[0.6875rem]">
              <summary className="flex cursor-pointer items-center gap-1.5">
                <StateBadge state={c.outcome} label={t(`agentEvidence.outcome.${c.outcome}`)} />
                <StateBadge state={cs} label={t(`agentEvidence.state.${cs}`)} />
                <code className="min-w-0 flex-1 truncate">{c.command}</code>
              </summary>
              <p className="text-muted-foreground">{when(c.startedAt)} → {c.finishedAt ? when(c.finishedAt) : "…"} · {t("agentEvidence.head")} {short(c.snapshot.headSha)} · {t("agentEvidence.content")} {short(c.snapshot.worktreeFingerprint)}</p>
              <Pre text={c.outputSummary} />
            </details>
          );
        })}
      </div>

      {state === "current" ? (
        <div className="space-y-1.5">
          <CommandFields value={cmd} onChange={setCmd} />
          <Button type="button" size="sm" className="h-7 gap-1 text-xs" disabled={!spec || !!busy} onClick={() => void runCheck()}>
            {busy === evidence.id ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} {t("agentEvidence.runCheck")}
          </Button>
        </div>
      ) : (
        <p className="text-[0.6875rem] text-muted-foreground">{t("agentEvidence.runNeedsCurrent")}</p>
      )}
      {error && <p role="alert" className="text-[0.6875rem] text-destructive">{error}</p>}
    </article>
  );
}
