import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAgentWorktreeStore } from "@/lib/agents/agent-worktrees";
import { formatRelative } from "@/lib/format";
import { formatBytes } from "@/lib/media";
import type { ProfilesResult, RunResult, SparseStatus, WorktreeDetails, WorktreeProfile } from "@/lib/git-expansion";
import { useRepoStore } from "@/lib/repo-store";
import { commandLine, toCommand } from "@/lib/workbench-ui/args";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Field, Pre, RunButton, RunOutput, Section, TextField, short, useGx } from "./workbench-kit";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** 63: repository-stored worktree setup profiles; nothing runs without an explicit confirmation listing every argv. */
export function WorktreeProfilesTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [res, setRes] = useState<ProfilesResult | null>(null);
  const [draft, setDraft] = useState<{ name: string; copy: string; cmds: string } | null>(null);
  const [target, setTarget] = useState("");
  const [runs, setRuns] = useState<RunResult[] | null>(null);
  const load = () => gx.call({ op: "profiles_list" }).then((r) => r && setRes(r));

  async function save(profiles: WorktreeProfile[]) {
    if (!res) return;
    const r = await gx.call({ op: "profiles_save", profiles, expectedFingerprint: res.fingerprint });
    if (r) {
      setRes(r);
      setDraft(null);
    }
  }
  function addDraft() {
    if (!res || !draft) return;
    const commands = lines(draft.cmds).map((l) => toCommand(l, 600));
    if (!draft.name.trim() || commands.some((c) => !c)) return toast.error(t("wb.profileInvalid"));
    void save([...res.profiles, { id: crypto.randomUUID(), name: draft.name.trim(), copyFiles: lines(draft.copy), commands: commands as NonNullable<(typeof commands)[number]>[] }]);
  }
  async function apply(p: WorktreeProfile) {
    if (!res || !target.trim()) return;
    const list = [...p.copyFiles.map((f) => `copy ${f}`), ...p.commands.map(commandLine)].join("\n");
    if (!window.confirm(t("wb.profileConfirm", { name: p.name, target, list }))) return;
    const r = await gx.call({ op: "profile_apply", profileId: p.id, targetPath: target.trim(), expectedProfileFingerprint: res.fingerprint, confirmed: true });
    if (r) {
      setRuns(r.runs);
      toast[r.completed ? "success" : "error"](r.completed ? t("wb.profileDone") : t("wb.profileStopped"));
    }
  }
  return (
    <Section id="profiles" title={t("wb.profiles")} hint={t("wb.profilesHint")}>
      <RunButton busy={gx.busy} onClick={() => void load()}>{res ? t("common.refresh") : t("wb.inspect")}</RunButton>
      {res && (
        <>
          <TextField label={t("wb.targetWorktree")} value={target} onChange={setTarget} placeholder="/path/to/worktree" />
          {res.profiles.length === 0 && <p className="text-xs text-muted-foreground">{t("wb.noProfiles")}</p>}
          <ul className="space-y-1.5">
            {res.profiles.map((p) => (
              <li key={p.id} className="rounded-md border border-border/50 p-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <Button variant="outline" size="sm" className="ml-auto h-6 text-[0.6875rem]" disabled={gx.busy || !target.trim()} onClick={() => void apply(p)}>{t("wb.runProfile")}</Button>
                  <Button variant="ghost" size="sm" className="h-6 text-[0.6875rem]" disabled={gx.busy} onClick={() => window.confirm(t("wb.deleteConfirm", { name: p.name })) && void save(res.profiles.filter((x) => x.id !== p.id))}>{t("common.delete")}</Button>
                </div>
                <Pre max={24} text={[...p.copyFiles.map((f) => `copy ${f}`), ...p.commands.map(commandLine)].join("\n") || "—"} />
              </li>
            ))}
          </ul>
          {draft ? (
            <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
              <TextField mono={false} label={t("wb.profileName")} value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
              <Field label={t("wb.copyFiles")}><Textarea rows={2} value={draft.copy} onChange={(e) => setDraft({ ...draft, copy: e.target.value })} className="font-mono text-xs" placeholder=".env.local" /></Field>
              <Field label={t("wb.commandsPerLine")}><Textarea rows={3} value={draft.cmds} onChange={(e) => setDraft({ ...draft, cmds: e.target.value })} className="font-mono text-xs" placeholder="npm ci" /></Field>
              <div className="flex gap-1.5">
                <RunButton busy={gx.busy} onClick={addDraft}>{t("common.save")}</RunButton>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDraft(null)}>{t("common.cancel")}</Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDraft({ name: "", copy: "", cmds: "" })}>{t("wb.addProfile")}</Button>
          )}
          {runs?.map((r, i) => <RunOutput key={i} run={r} />)}
        </>
      )}
    </Section>
  );
}

/** 64: worktree size/last-use/dirty/agent/PR overview with a cleanup preview before removal. */
export function WorktreeHousekeepingTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const agentTrees = useAgentWorktreeStore((s) => s.worktrees);
  const remove = useRepoStore((s) => s.worktreeRemove);
  const [list, setList] = useState<WorktreeDetails[] | null>(null);
  const [preview, setPreview] = useState<WorktreeDetails | null>(null);
  const load = () => gx.call({ op: "housekeeping" }).then((r) => r && setList(r.worktrees));
  async function doRemove(w: WorktreeDetails) {
    try {
      await remove(path, w.path, false);
      toast.success(t("wb.worktreeRemoved"));
      setPreview(null);
      void load();
    } catch (e) {
      toast.error(String(e));
    }
  }
  return (
    <Section id="housekeeping" title={t("wb.housekeeping")} hint={t("wb.housekeepingHint")}>
      <RunButton busy={gx.busy} onClick={() => void load()}>{list ? t("common.refresh") : t("wb.inspect")}</RunButton>
      {list && (
        <ul className="divide-y divide-border/40 text-xs">
          {list.map((w) => {
            const agent = agentTrees[w.path];
            const dirty = !!w.status?.trim();
            return (
              <li key={w.path} className="py-1.5">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono" title={w.path}>{w.path}</span>
                  <span className="text-muted-foreground">{w.sizeBytes == null ? "?" : `${formatBytes(w.sizeBytes)}${w.sizeTruncated ? "+" : ""}`}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[0.625rem] text-muted-foreground">
                  <span>{w.branch ?? "detached"} @ {short(w.head)}</span>
                  {w.lastModified && <span>{t("wb.lastUsed", { when: formatRelative(new Date(w.lastModified).toISOString()) })}</span>}
                  <span className={dirty ? "text-amber-500" : ""}>{dirty ? t("wb.dirty") : t("wb.clean")}</span>
                  {w.isMain && <span>{t("wb.mainWorktree")}</span>}
                  {w.locked && <span>{t("wb.locked")}</span>}
                  {w.prunable && <span className="text-rose-500">{t("wb.prunable")}</span>}
                  {agent && <span>{t("wb.agentWorktree")}</span>}
                  {agent?.pullRequestUrl && <a className="text-primary hover:underline" href={agent.pullRequestUrl} target="_blank" rel="noreferrer">PR</a>}
                  {w.error && <span className="text-rose-500">{w.error}</span>}
                </div>
                {!w.isMain && !w.locked && (
                  <Button variant="ghost" size="sm" className="mt-0.5 h-5 text-[0.625rem]" onClick={() => setPreview(w)}>{t("wb.cleanupPreview")}</Button>
                )}
                {preview?.path === w.path && (
                  <div className="mt-1 rounded-md border border-rose-500/30 bg-rose-500/5 p-2">
                    <p>{t("wb.cleanupWill", { path: w.path })}</p>
                    {dirty && <><p className="text-amber-500">{t("wb.cleanupDirty")}</p><Pre max={24} text={w.status ?? ""} /></>}
                    <p className="text-[0.625rem] text-muted-foreground">{t("wb.cleanupKeepsBranch", { branch: w.branch ?? short(w.head) })}</p>
                    <div className="mt-1 flex gap-1.5">
                      <Button size="sm" variant="destructive" className="h-6 text-[0.6875rem]" disabled={dirty} onClick={() => void doRemove(w)}>{t("wb.removeWorktree")}</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-[0.6875rem]" onClick={() => setPreview(null)}>{t("common.cancel")}</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** 66: sparse-checkout cone directories plus how many tracked files are currently omitted. */
export function SparseCheckoutTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [s, setS] = useState<SparseStatus | null>(null);
  const [dirs, setDirs] = useState("");
  const load = () => gx.call({ op: "sparse_status" }).then((r) => { if (r) { setS(r); setDirs(r.directories.join("\n")); } });
  async function set() {
    if (!s) return;
    const list = lines(dirs);
    if (!window.confirm(t("wb.sparseConfirm", { dirs: list.join(", ") }))) return;
    const r = await gx.call({ op: "sparse_set", directories: list, expectedHead: s.head, confirmed: true });
    if (r) { setS(r); setDirs(r.directories.join("\n")); }
  }
  async function disable() {
    if (!s || !window.confirm(t("wb.sparseDisableConfirm"))) return;
    const r = await gx.call({ op: "sparse_disable", expectedHead: s.head, confirmed: true });
    if (r) setS(r);
  }
  return (
    <Section id="sparse" title={t("wb.sparse")} hint={t("wb.sparseHint")}>
      <RunButton busy={gx.busy} onClick={() => void load()}>{s ? t("common.refresh") : t("wb.inspect")}</RunButton>
      {s && (
        <>
          <p className="text-xs">
            {s.enabled ? t("wb.sparseOn", { mode: s.cone ? "cone" : "pattern" }) : t("wb.sparseOff")}
          </p>
          {s.enabled && s.omittedTrackedFiles > 0 && <p className="text-xs text-amber-500">{t("wb.sparseOmitted", { count: s.omittedTrackedFiles })}</p>}
          <Field label={t("wb.sparseDirs")}><Textarea rows={4} value={dirs} onChange={(e) => setDirs(e.target.value)} className="font-mono text-xs" placeholder={"src/app\ndocs"} /></Field>
          <div className="flex gap-1.5">
            <RunButton busy={gx.busy} disabled={!lines(dirs).length} onClick={() => void set()}>{t("wb.sparseApply")}</RunButton>
            {s.enabled && <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={gx.busy} onClick={() => void disable()}>{t("wb.sparseDisable")}</Button>}
          </div>
        </>
      )}
    </Section>
  );
}
