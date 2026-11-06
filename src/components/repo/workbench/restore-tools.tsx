import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RerereStatus, RestorePreview, SnapshotSummary } from "@/lib/git-expansion";
import { formatRelative } from "@/lib/format";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Field, Pre, RunButton, Section, TextField, short, useGx } from "./workbench-kit";

const head = (path: string) => invoke<string>("git_resolve_commit", { path, rev: "HEAD" });

/** 61: preview an old version (or a line range of it) against the current file, then apply guarded. */
export function RestoreHunkTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [file, setFile] = useState("");
  const [rev, setRev] = useState("HEAD~1");
  const [ranged, setRanged] = useState(false);
  const [sel, setSel] = useState({ sourceStart: 1, sourceEnd: 1, targetStart: 1, targetEnd: 1 });
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const num = (k: keyof typeof sel) => (
    <Field label={t(`wb.${k}`)}>
      <Input type="number" min={1} value={sel[k]} onChange={(e) => setSel((s) => ({ ...s, [k]: Number(e.target.value) }))} className="h-7 text-xs" />
    </Field>
  );
  const apply = () => applyRestore(t, gx.call, preview, () => setPreview(null));
  return (
    <Section id="restore" title={t("wb.restore")} hint={t("wb.restoreHint")}>
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <TextField label={t("wb.file")} value={file} onChange={setFile} />
        <TextField label={t("wb.revision")} value={rev} onChange={setRev} />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={ranged} onChange={(e) => setRanged(e.target.checked)} />
        {t("wb.onlyLines")}
      </label>
      {ranged && <div className="grid grid-cols-4 gap-2">{num("sourceStart")}{num("sourceEnd")}{num("targetStart")}{num("targetEnd")}</div>}
      <RunButton busy={gx.busy} disabled={!file || !rev}
        onClick={() => void gx.call({ op: "restore_preview", file, revision: rev, selection: ranged ? sel : undefined }).then((r) => r && setPreview(r))}>
        {t("wb.preview")}
      </RunButton>
      {preview && <PreviewView preview={preview} busy={gx.busy} onApply={() => void apply()} />}
    </Section>
  );
}

type Call = ReturnType<typeof useGx>["call"];

async function applyRestore(t: (k: string, o?: Record<string, unknown>) => string, call: Call, preview: RestorePreview | null, done: () => void) {
  if (!preview || !window.confirm(t("wb.restoreConfirm", { file: preview.file, source: preview.source }))) return;
  const r = await call({ op: "restore_apply", previewId: preview.id, expectedFingerprint: preview.fingerprint });
  if (r?.restored) {
    toast.success(t("wb.restored", { file: r.file }));
    done();
  }
}

function PreviewView({ preview, busy, onApply }: { preview: RestorePreview; busy: boolean; onApply: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <p className="text-[0.625rem] text-muted-foreground">{t("wb.restorePinned", { source: preview.source, head: short(preview.head) })}</p>
      {preview.deleteFile && <p className="text-xs font-semibold text-rose-500">{t("wb.restoreDeletes", { file: preview.file })}</p>}
      {preview.binary && <p className="text-xs text-amber-600">{t("wb.restoreBinary")}</p>}
      <div className="grid grid-cols-2 gap-2">
        <div><p className="text-[0.625rem] font-semibold">{t("wb.current")}</p><Pre text={preview.current} /></div>
        <div><p className="text-[0.625rem] font-semibold">{t("wb.proposed")}</p><Pre text={preview.proposed} /></div>
      </div>
      {preview.current === preview.proposed && !preview.deleteFile ? (
        <p className="text-xs text-muted-foreground">{t("wb.restoreSame")}</p>
      ) : (
        <RunButton busy={busy} onClick={onApply}>{t("wb.applyRestore")}</RunButton>
      )}
    </div>
  );
}

type SnapshotList = { snapshots: SnapshotSummary[]; current?: { head: string; indexTree: string } };

/** 76: capture index/worktree/ref state and selectively restore the index or rescue to a branch. Undo stays untouched. */
export function SnapshotsTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [list, setList] = useState<SnapshotList | null>(null);
  const [label, setLabel] = useState("");
  const [branch, setBranch] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const refresh = () => gx.call({ op: "snapshots_list" }).then((r) => r && setList(r as SnapshotList));
  async function capture() {
    const h = await head(path).catch(() => null);
    if (!h) return;
    if (await gx.call({ op: "snapshot_capture", label: label.trim() || t("wb.snapshotDefault"), expectedHead: h })) {
      setLabel("");
      void refresh();
    }
  }
  async function restoreIndex(s: SnapshotSummary) {
    const cur = list?.current;
    if (!cur || !window.confirm(t("wb.restoreIndexConfirm", { label: s.label }))) return;
    if (await gx.call({ op: "snapshot_restore_index", snapshotId: s.id, expectedHead: cur.head, expectedIndexTree: cur.indexTree })) {
      toast.success(t("wb.indexRestored"));
      void refresh();
    }
  }
  async function rescue(s: SnapshotSummary) {
    const name = branch[s.id]?.trim();
    if (!name) return;
    const r = await gx.call({ op: "snapshot_rescue_branch", snapshotId: s.id, branch: name });
    if (r) toast.success(t("wb.rescued", { branch: r.branch, head: short(r.head) }));
  }
  return (
    <Section id="snapshots" title={t("wb.snapshots")} hint={t("wb.snapshotsHint")}>
      <div className="flex items-end gap-2">
        <div className="flex-1"><TextField mono={false} label={t("wb.label")} value={label} onChange={setLabel} /></div>
        <RunButton busy={gx.busy} onClick={() => void capture()}>{t("wb.capture")}</RunButton>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void refresh()}>{t("common.refresh")}</Button>
      </div>
      {list && list.snapshots.length === 0 && <p className="text-xs text-muted-foreground">{t("wb.noSnapshots")}</p>}
      <ul className="space-y-1.5">
        {list?.snapshots.map((s) => (
          <li key={s.id} className="rounded-md border border-border/50 p-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{s.label}</span>
              <span className="text-muted-foreground">{formatRelative(new Date(s.createdAt).toISOString())}</span>
              <span className="ml-auto font-mono text-[0.625rem] text-muted-foreground">{s.branch ?? "detached"} @ {short(s.head)}</span>
            </div>
            <p className="mt-0.5 text-[0.625rem] text-muted-foreground">{t("wb.snapshotFiles", { count: s.files.length })}</p>
            <ul className="mt-0.5 flex flex-wrap gap-1">
              {s.files.map((f) => (
                <li key={f}>
                  <button type="button" className="rounded bg-muted px-1 font-mono text-[0.625rem] hover:text-primary" title={t("wb.previewFromSnapshot")}
                    onClick={() => void gx.call({ op: "restore_preview", file: f, snapshotId: s.id }).then((r) => r && setPreview(r))}>
                    {f}
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-6 text-[0.6875rem]" disabled={gx.busy || !list.current}
                title={list.current ? undefined : t("wb.needsCurrentState")} onClick={() => void restoreIndex(s)}>
                {t("wb.restoreIndex")}
              </Button>
              <Input value={branch[s.id] ?? ""} onChange={(e) => setBranch((b) => ({ ...b, [s.id]: e.target.value }))} placeholder={t("wb.rescueBranch")} className="h-6 w-40 font-mono text-[0.6875rem]" />
              <Button variant="outline" size="sm" className="h-6 text-[0.6875rem]" disabled={gx.busy || !branch[s.id]?.trim()} onClick={() => void rescue(s)}>{t("wb.rescue")}</Button>
            </div>
          </li>
        ))}
      </ul>
      {preview && <PreviewView preview={preview} busy={gx.busy} onApply={() => void applyRestore(t, gx.call, preview, () => setPreview(null))} />}
      <p className="text-[0.625rem] text-muted-foreground">{t("wb.snapshotsNote")}</p>
    </Section>
  );
}

/** 62: rerere is shown and toggled explicitly; recorded resolutions can be forgotten per file. */
export function RerereTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [s, setS] = useState<RerereStatus | null>(null);
  async function forget(file: string) {
    const h = await head(path).catch(() => null);
    if (h && window.confirm(t("wb.rerereForgetConfirm", { file }))) {
      const r = await gx.call({ op: "rerere_forget", file, expectedHead: h });
      if (r) setS(r);
    }
  }
  return (
    <Section id="rerere" title={t("wb.rerere")} hint={t("wb.rerereHint")}>
      <RunButton busy={gx.busy} onClick={() => void gx.call({ op: "rerere_status" }).then((r) => r && setS(r))}>{t("wb.inspect")}</RunButton>
      {s && (
        <div className="space-y-1.5 text-xs">
          <p>
            {s.enabled === null ? t("wb.rerereUnset") : s.enabled ? t("wb.rerereOn") : t("wb.rerereOff")}
            {s.autoupdate && ` · ${t("wb.rerereAutoupdate")}`}
          </p>
          <Button variant="outline" size="sm" className="h-6 text-[0.6875rem]" disabled={gx.busy}
            onClick={() => void gx.call({ op: "rerere_configure", enabled: !s.enabled, expectedEnabled: s.enabled }).then((r) => r && setS(r))}>
            {s.enabled ? t("wb.rerereDisable") : t("wb.rerereEnable")}
          </Button>
          {s.recorded.length > 0 && (
            <div>
              <p className="font-semibold">{t("wb.rerereReused")}</p>
              <ul>{s.recorded.map((f) => (
                <li key={f} className="flex items-center gap-2 font-mono text-[0.6875rem]">
                  {f}
                  <Button variant="ghost" size="sm" className="ml-auto h-5 text-[0.625rem]" onClick={() => void forget(f)}>{t("wb.forget")}</Button>
                </li>
              ))}</ul>
            </div>
          )}
          {s.remaining.length > 0 && <p>{t("wb.rerereRemaining", { files: s.remaining.join(", ") })}</p>}
          {s.diff && <Pre text={s.diff} />}
        </div>
      )}
    </Section>
  );
}
