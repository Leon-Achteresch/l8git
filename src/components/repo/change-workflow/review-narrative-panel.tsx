import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chapterState, moveChapter, type AnchorObservation, type ReviewAnchor, type ReviewChapter, type ReviewNarrative } from "@/lib/change-workflow/model";
import { changeWorkflowKey, useChangeWorkflow } from "@/lib/change-workflow/store";
import { anchorFingerprint, observeAnchors, type Side } from "@/lib/change-workflow-ui/anchors";
import { useWorkflowScope } from "@/lib/change-workflow-ui/scope";
import { invoke } from "@/lib/platform/ipc";
import { parseUnifiedDiff } from "@/lib/unified-diff";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, BookOpen, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadStatus, Pick, StateBadge, errText, short, useLoad } from "./kit";

type PrFile = { path: string; status: string; additions: number; deletions: number };
type Range = { path: string; side: Side; start: number; end: number };
const PATCH_LINE_CAP = 4000;

/**
 * Patches pinned to exactly base+head: the backend verifies the provider's revisions before and after
 * the read and refuses drift, so a success is the revision proof. Results are stored per revision key;
 * a late reply for an older PR/base/head can never enter the current map. Undefined = load failed/refused.
 */
function usePatches(path: string, number: number, baseSha: string, headSha: string) {
  const rev = `${path}\n${number}\n${baseSha}\n${headSha}`;
  const current = useRef(rev);
  current.current = rev;
  const cache = useRef(new Map<string, Promise<string | undefined>>());
  const [state, setState] = useState<{ rev: string; patches: Map<string, string | undefined>; errors: Map<string, string> }>({ rev, patches: new Map(), errors: new Map() });
  const view = state.rev === rev ? state : { rev, patches: new Map<string, string | undefined>(), errors: new Map<string, string>() };
  const ensure = (file: string): Promise<string | undefined> => {
    const k = `${rev}\n${file}`;
    let p = cache.current.get(k);
    if (!p) {
      for (const old of cache.current.keys()) if (!old.startsWith(`${rev}\n`)) cache.current.delete(old);
      let error: string | null = null;
      p = invoke<string | null>("pr_file_patch", { path, number, file, expectedHeadSha: headSha, expectedBaseSha: baseSha })
        .then((x) => x ?? "", (e) => { error = errText(e); return undefined; });
      cache.current.set(k, p);
      void p.then((v) => {
        if (current.current !== rev) return;
        setState((s) => {
          const base = s.rev === rev ? s : { rev, patches: new Map(), errors: new Map() };
          const errors = new Map(base.errors);
          if (error) errors.set(file, error); else errors.delete(file);
          return { rev, patches: new Map(base.patches).set(file, v), errors };
        });
      });
    }
    return p;
  };
  return { rev, patches: view.patches, errors: view.errors, ensure };
}

/**
 * Author-written, persisted review story for one PR: ordered chapters anchored to exact
 * patch lines. Each anchor pins base/head and a fingerprint of the anchored lines, so a
 * new revision shows chapters as changed/missing/unknown instead of silently current.
 */
export function ReviewNarrativePanel({ path, number, baseSha, headSha }: { path: string; number: number; baseSha: string; headSha: string }) {
  const { t } = useTranslation();
  const scope = useWorkflowScope(path);
  const id = `pull:${number}`;
  const stored = useChangeWorkflow((s) => (scope ? s.narratives[changeWorkflowKey(scope, id)] : undefined));
  const saveNarrative = useChangeWorkflow((s) => s.saveNarrative);
  const removeNarrative = useChangeWorkflow((s) => s.removeNarrative);
  const files = useLoad(`files:${path}:${number}:${headSha}`, () => invoke<PrFile[]>("pr_files", { path, number }));
  const { rev, patches, errors: patchErrors, ensure } = usePatches(path, number, baseSha, headSha);
  const [editing, setEditing] = useState<string | null>(null);
  const [jump, setJump] = useState<ReviewAnchor | null>(null);
  const [error, setError] = useState<string | null>(null);

  const narrative: ReviewNarrative | null = scope ? stored ?? { id, scope, pullNumber: number, title: "", chapters: [] } : null;
  const anchors = useMemo(() => stored?.chapters.flatMap((c) => c.anchors) ?? [], [stored]);
  const filePaths = useMemo(() => new Set((files.data ?? []).map((f) => f.path)), [files.data]);

  // Load each anchored file still in the PR; files gone from the PR stay absent (missing).
  useEffect(() => {
    for (const a of anchors) if (filePaths.has(a.path)) void ensure(a.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchors, filePaths, rev]);

  // Observations are tagged with the revision they were computed from; another revision reads as not yet observed.
  const [observed, setObserved] = useState<{ rev: string; items: AnchorObservation[] } | null>(null);
  const observations = observed?.rev === rev ? observed.items : null;
  useEffect(() => {
    setObserved(null);
    if (!files.data) return;
    const relevant = new Map([...patches].filter(([p]) => filePaths.has(p)));
    if (anchors.some((a) => filePaths.has(a.path) && !relevant.has(a.path))) return;
    let live = true;
    void observeAnchors(anchors, relevant).then((o) => live && setObserved({ rev, items: o }));
    return () => { live = false; };
  }, [anchors, patches, files.data, filePaths, rev]);

  if (!narrative) return <p role="status" className="p-3 text-xs text-muted-foreground">{t("reviewStory.loading")}</p>;

  const save = (next: ReviewNarrative) => {
    try { saveNarrative(next); setError(null); } catch (e) { setError(errText(e)); }
  };
  const move = (chapterId: string, to: number) => save(moveChapter(narrative, chapterId, to));

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <BookOpen className="size-4" />
        <h3 className="flex-1 text-sm font-semibold">{t("reviewStory.title")}</h3>
        {stored && (
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[0.6875rem]" onClick={() => window.confirm(t("reviewStory.confirmRemoveStory")) && removeNarrative(narrative.scope, narrative.id)}>
            {t("reviewStory.removeStory")}
          </Button>
        )}
      </div>
      <p className="text-[0.6875rem] text-muted-foreground">{t("reviewStory.intro")}</p>
      <p className="font-mono text-[0.625rem] text-muted-foreground">{t("reviewStory.pinnedNow", { base: short(baseSha), head: short(headSha) })}</p>
      <label className="block text-[0.6875rem] font-medium text-muted-foreground">
        {t("reviewStory.storyTitle")}
        <Input defaultValue={narrative.title} key={narrative.title} onBlur={(e) => e.target.value !== narrative.title && save({ ...narrative, title: e.target.value })} className="mt-0.5 h-7 text-xs" />
      </label>
      <LoadStatus state={files} label={t("reviewStory.loadingFiles")} />
      {error && <p role="alert" className="text-[0.6875rem] text-destructive">{error}</p>}
      {patchErrors.size > 0 && <p role="alert" className="text-[0.6875rem] text-destructive">{t("reviewStory.patchRefused", { count: patchErrors.size })}</p>}

      {narrative.chapters.length === 0 && editing !== "new" && <p className="text-[0.6875rem] text-muted-foreground">{t("reviewStory.empty")}</p>}
      <ol className="space-y-2">
        {narrative.chapters.map((c, i) => editing === c.id ? (
          <li key={c.id}>
            <ChapterEditor initial={c} files={files.data ?? []} patches={patches} patchErrors={patchErrors} rev={rev} ensure={ensure} baseSha={baseSha} headSha={headSha}
              onCancel={() => setEditing(null)}
              onSave={(next) => { save({ ...narrative, chapters: narrative.chapters.map((x) => (x.id === c.id ? next : x)) }); setEditing(null); }} />
          </li>
        ) : (
          <ChapterView key={c.id} chapter={c} index={i} count={narrative.chapters.length} state={chapterState(c, observations)} headSha={headSha}
            onMove={(to) => move(c.id, to)} onEdit={() => setEditing(c.id)} onJump={setJump}
            onRemove={() => window.confirm(t("reviewStory.confirmRemoveChapter", { title: c.title })) && save({ ...narrative, chapters: narrative.chapters.filter((x) => x.id !== c.id) })} />
        ))}
      </ol>

      {editing === "new" ? (
        <ChapterEditor initial={{ id: crypto.randomUUID(), title: "", explanation: "", anchors: [] }} files={files.data ?? []} patches={patches} patchErrors={patchErrors} rev={rev} ensure={ensure} baseSha={baseSha} headSha={headSha}
          onCancel={() => setEditing(null)}
          onSave={(next) => { save({ ...narrative, chapters: [...narrative.chapters, next] }); setEditing(null); }} />
      ) : (
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!!editing || !files.data} onClick={() => setEditing("new")}>
          <Plus className="size-3" /> {t("reviewStory.addChapter")}
        </Button>
      )}

      {jump && (
        <section className="space-y-1 rounded-md border border-border/60 p-2" aria-label={t("reviewStory.anchoredDiff")}>
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate font-mono text-[0.6875rem] font-semibold">{jump.path} · {t(`reviewStory.side.${jump.side}`)} L{jump.startLine}–{jump.endLine}</p>
            <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("common.close")} onClick={() => setJump(null)}><X className="size-3" /></Button>
          </div>
          {!filePaths.has(jump.path) ? (
            <p className="text-[0.6875rem] text-destructive">{t("reviewStory.fileGone")}</p>
          ) : (
            <PatchLines patch={patches.get(jump.path)} loaded={patches.has(jump.path)} error={patchErrors.get(jump.path)} side={jump.side} range={{ path: jump.path, side: jump.side, start: jump.startLine, end: jump.endLine }} />
          )}
        </section>
      )}
    </div>
  );
}

function ChapterView({ chapter, index, count, state, headSha, onMove, onEdit, onRemove, onJump }: {
  chapter: ReviewChapter; index: number; count: number; state: ReturnType<typeof chapterState>; headSha: string;
  onMove: (to: number) => void; onEdit: () => void; onRemove: () => void; onJump: (a: ReviewAnchor) => void;
}) {
  const { t } = useTranslation();
  const outdated = chapter.anchors.some((a) => a.headSha !== headSha);
  return (
    <li className="space-y-1 rounded-md border border-border/60 p-2">
      <div className="flex items-center gap-1.5">
        <span className="text-[0.6875rem] text-muted-foreground">{index + 1}.</span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{chapter.title || t("reviewStory.untitled")}</span>
        <StateBadge state={state} label={t(`reviewStory.state.${state}`)} />
        <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("reviewStory.moveUp")} disabled={index === 0} onClick={() => onMove(index - 1)}><ArrowUp className="size-3" /></Button>
        <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("reviewStory.moveDown")} disabled={index === count - 1} onClick={() => onMove(index + 1)}><ArrowDown className="size-3" /></Button>
        <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("reviewStory.edit")} onClick={onEdit}><Pencil className="size-3" /></Button>
        <Button type="button" size="icon" variant="ghost" className="size-6" aria-label={t("common.remove")} onClick={onRemove}><Trash2 className="size-3" /></Button>
      </div>
      {state !== "current" && <p className="text-[0.625rem] text-muted-foreground">{t(`reviewStory.stateHint.${state}`)}</p>}
      {outdated && <p className="text-[0.625rem] text-amber-600">{t("reviewStory.pinnedOlder")}</p>}
      {chapter.explanation && <p className="whitespace-pre-wrap text-xs">{chapter.explanation}</p>}
      <ul className="space-y-0.5">
        {chapter.anchors.map((a) => (
          <li key={`${a.path}:${a.side}:${a.startLine}`}>
            <button type="button" className="text-left font-mono text-[0.6875rem] text-primary hover:underline" onClick={() => onJump(a)}>
              {a.path} · {t(`reviewStory.side.${a.side}`)} L{a.startLine}–{a.endLine} @{short(a.headSha)}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
}

function ChapterEditor({ initial, files, patches, patchErrors, rev, ensure, baseSha, headSha, onSave, onCancel }: {
  initial: ReviewChapter; files: PrFile[]; patches: Map<string, string | undefined>; patchErrors: Map<string, string>; rev: string; ensure: (f: string) => Promise<string | undefined>;
  baseSha: string; headSha: string; onSave: (c: ReviewChapter) => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial.title);
  const [explanation, setExplanation] = useState(initial.explanation);
  const [anchors, setAnchors] = useState(initial.anchors);
  const [file, setFile] = useState("");
  const [side, setSide] = useState<Side>("head");
  const [range, setRange] = useState<Range | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (file) void ensure(file); setRange(null); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [file, side, rev]);

  async function addAnchor() {
    if (!range) return;
    setBusy(true);
    setError(null);
    try {
      const patch = await ensure(range.path);
      if (patch === undefined) throw new Error(t("reviewStory.patchFailed"));
      const fp = await anchorFingerprint(patch, range.side, range.start, range.end);
      if (!fp) throw new Error(t("reviewStory.rangeOutside"));
      if (anchors.some((a) => a.path === range.path && a.side === range.side && a.startLine === range.start && a.endLine === range.end)) throw new Error(t("reviewStory.duplicateAnchor"));
      setAnchors((x) => [...x, { path: range.path, side: range.side, startLine: range.start, endLine: range.end, baseSha, headSha, contentFingerprint: fp }]);
      setRange(null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-primary/40 p-2">
      <label className="block text-[0.6875rem] font-medium text-muted-foreground">
        {t("reviewStory.chapterTitle")}
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-0.5 h-7 text-xs" autoFocus />
      </label>
      <label className="block text-[0.6875rem] font-medium text-muted-foreground">
        {t("reviewStory.explanation")}
        <Textarea value={explanation} onChange={(e) => setExplanation(e.target.value)} rows={4} className="mt-0.5 text-xs" />
      </label>

      <div className="space-y-1">
        <p className="text-[0.6875rem] font-semibold">{t("reviewStory.anchors")}</p>
        {anchors.length === 0 && <p className="text-[0.6875rem] text-muted-foreground">{t("reviewStory.noAnchors")}</p>}
        {anchors.map((a, i) => (
          <div key={i} className="flex items-center gap-1 font-mono text-[0.6875rem]">
            <span className="min-w-0 flex-1 truncate">{a.path} · {t(`reviewStory.side.${a.side}`)} L{a.startLine}–{a.endLine} @{short(a.headSha)}</span>
            <Button type="button" size="icon" variant="ghost" className="size-5" aria-label={t("reviewStory.removeAnchor")} onClick={() => setAnchors((x) => x.filter((_, j) => j !== i))}><X className="size-3" /></Button>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Pick label={t("reviewStory.file")} value={file} onChange={setFile} placeholder={t("reviewStory.chooseFile")} options={files.map((f) => ({ value: f.path, label: f.path }))} />
          <Pick label={t("reviewStory.sideLabel")} value={side} onChange={(v) => setSide(v as Side)} options={[{ value: "head", label: t("reviewStory.side.head") }, { value: "base", label: t("reviewStory.side.base") }]} />
        </div>
        {file && (
          <>
            <p className="text-[0.625rem] text-muted-foreground">{t("reviewStory.selectHint")}</p>
            <PatchLines patch={patches.get(file)} loaded={patches.has(file)} error={patchErrors.get(file)} side={side} range={range?.path === file ? range : null}
              onPick={(no, extend) => setRange((r) => (extend && r && r.path === file ? { ...r, start: Math.min(r.start, no), end: Math.max(r.start, no) } : { path: file, side, start: no, end: no }))} />
            <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[0.6875rem]" disabled={!range || busy} onClick={() => void addAnchor()}>
              {busy && <Loader2 className="size-3 animate-spin" />} {range ? t("reviewStory.addAnchorRange", { start: range.start, end: range.end }) : t("reviewStory.addAnchor")}
            </Button>
          </>
        )}
      </div>
      {error && <p role="alert" className="text-[0.6875rem] text-destructive">{error}</p>}
      <div className="flex gap-1.5">
        <Button type="button" size="sm" className="h-7 text-xs" disabled={!title.trim() || anchors.length === 0} onClick={() => onSave({ ...initial, title: title.trim(), explanation, anchors })}>{t("common.save")}</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>{t("common.cancel")}</Button>
      </div>
      {anchors.length === 0 && <p className="text-[0.625rem] text-muted-foreground">{t("reviewStory.needAnchor")}</p>}
    </div>
  );
}

/** Patch rows with line numbers; lines on `side` are selectable (click = start, Shift+click = extend). */
function PatchLines({ patch, loaded, error, side, range, onPick }: {
  patch: string | undefined; loaded: boolean; error?: string; side: Side; range: Range | null; onPick?: (line: number, extend: boolean) => void;
}) {
  const { t } = useTranslation();
  const lines = useMemo(() => (patch ? parseUnifiedDiff(patch).filter((l) => l.kind !== "meta") : []), [patch]);
  const first = useRef<HTMLDivElement | null>(null);
  useEffect(() => { first.current?.scrollIntoView({ block: "nearest" }); }, [range?.start, patch]);
  if (!loaded) return <p role="status" className="text-[0.6875rem] text-muted-foreground">{t("reviewStory.loadingPatch")}</p>;
  if (patch === undefined) return <p role="alert" className="text-[0.6875rem] text-destructive">{t("reviewStory.patchFailed")}{error && <span className="block font-mono">{error}</span>}</p>;
  if (lines.length === 0) return <p className="text-[0.6875rem] text-muted-foreground">{t("reviewStory.noTextPatch")}</p>;
  let marked = false;
  return (
    <div className="max-h-64 overflow-auto rounded border border-border/50 font-mono text-[0.625rem] leading-snug" role="group" aria-label={t("reviewStory.patch")}>
      {lines.slice(0, PATCH_LINE_CAP).map((l, i) => {
        const no = side === "head" ? l.newLineNo : l.oldLineNo;
        const onSide = no !== undefined && (l.kind === "ctx" || l.kind === (side === "head" ? "add" : "del"));
        const inRange = onSide && !!range && no! >= range.start && no! <= range.end;
        const ref = inRange && !marked ? ((marked = true), first) : undefined;
        const cls = cn("flex w-full gap-2 whitespace-pre px-1 text-left",
          l.kind === "add" && "bg-emerald-500/10", l.kind === "del" && "bg-rose-500/10", l.kind === "hunk" && "bg-muted/50 text-muted-foreground",
          inRange && "outline outline-1 outline-primary bg-primary/15", !onSide && l.kind !== "hunk" && "opacity-60");
        const body = (
          <>
            <span className="w-8 shrink-0 text-right text-muted-foreground">{l.oldLineNo ?? ""}</span>
            <span className="w-8 shrink-0 text-right text-muted-foreground">{l.newLineNo ?? ""}</span>
            <span>{l.kind === "add" ? "+" : l.kind === "del" ? "-" : l.kind === "hunk" ? "" : " "}{l.text}</span>
          </>
        );
        return onPick && onSide ? (
          <div key={i} ref={ref}>
            <button type="button" className={cls} aria-pressed={inRange} aria-label={t("reviewStory.lineLabel", { line: no })} onClick={(e) => onPick(no!, e.shiftKey)}>{body}</button>
          </div>
        ) : (
          <div key={i} ref={ref} className={cls}>{body}</div>
        );
      })}
      {lines.length > PATCH_LINE_CAP && <p className="px-1 text-muted-foreground">{t("reviewStory.patchCapped", { count: lines.length - PATCH_LINE_CAP })}</p>}
    </div>
  );
}
