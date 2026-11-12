import { formatBackendError } from '@/lib/backend-error';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toastError } from "@/lib/error-toast";
import { downloadGithubFile } from "@/lib/github-expansion/api";
import type { CiJob } from "@/lib/github-expansion/ci";
import { errorLines, parseLog, searchLog, snippet } from "@/lib/github-ci-ui/logs";
import type { GithubTarget } from "@/lib/github-ui/target";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Copy, Download, FileArchive, Loader2, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ErrorNote, ExtLink, formatBytes, Muted, saveBytes, StatusIcon, textBase64, type RunX } from "./ci-shared";
import type { LogCache } from "./github-ci-extensions";

const WINDOW = 1000;

export function JobPicker({ jobs, job, onJob, id }: { jobs: CiJob[] | null; job: CiJob | null; onJob: (id: number) => void; id: string }) {
  const { t } = useTranslation();
  return (
    <>
      <label className="sr-only" htmlFor={id}>{t("ghci.job")}</label>
      <select id={id} value={job?.id ?? ""} onChange={(e) => onJob(Number(e.target.value))} disabled={!jobs?.length}
        className="h-7 max-w-72 rounded-md border border-input bg-transparent px-2 text-xs">
        {jobs?.map((j) => <option key={j.id} value={j.id}>{j.name} · {j.conclusion ?? j.status}</option>)}
      </select>
    </>
  );
}

export function CiLogs({ target, run, jobs, job, onJob, cache }: { target: GithubTarget; run: RunX; jobs: CiJob[] | null; job: CiJob | null; onJob: (id: number) => void; cache: LogCache }) {
  const { t } = useTranslation();
  const entry = job ? cache.logs[job.id] : undefined;
  const [zipBusy, setZipBusy] = useState(false);

  async function saveRunZip() {
    setZipBusy(true);
    try {
      const d = await downloadGithubFile(target.account, target.fullName, "run_logs", run.id);
      if (await saveBytes(d.file_name || `run-${run.id}-logs.zip`, d.base64, d.content_type)) toast.success(t("ghci.saved", { size: formatBytes(d.size) }));
    } catch (e) {
      toastError(String(e));
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <JobPicker id="ghci-log-job" jobs={jobs} job={job} onJob={onJob} />
        {job && <StatusIcon status={job.status} conclusion={job.conclusion} />}
        {job && (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={entry?.state === "loading"} onClick={() => void cache.fetchLog(job)}>
            {entry?.state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {entry?.state === "ready" ? t("ghci.logs.reload") : t("ghci.logs.load")}
          </Button>
        )}
        {job && <ExtLink href={job.html_url}>{t("ghci.openOnGithub")}</ExtLink>}
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" disabled={zipBusy} onClick={() => void saveRunZip()}>
          {zipBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileArchive className="h-3 w-3" />}
          {t("ghci.logs.runZip")}
        </Button>
      </div>
      {jobs?.length === 0 && <Muted>{t("ghci.noJobs")}</Muted>}
      {job && job.status !== "completed" && <Muted>{t("ghci.logs.running")}</Muted>}
      {entry?.state === "error" && <LogError error={entry.error} />}
      {entry?.state === "ready" && job && <LogViewer key={`${job.id}:${entry.fetchedAt}`} text={entry.text} job={job} fetchedAt={entry.fetchedAt} />}
    </div>
  );
}

function LogError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const msg = formatBackendError(error);
  if (msg === "zip") return <Muted>{t("ghci.logs.zipNotText")}</Muted>;
  if (msg === "too-large") return <Muted>{t("ghci.logs.tooLarge")}</Muted>;
  return <ErrorNote error={error} />;
}

function LogViewer({ text, job, fetchedAt }: { text: string; job: CiJob; fetchedAt: number }) {
  const { t } = useTranslation();
  const lines = useMemo(() => parseLog(text), [text]);
  const errors = useMemo(() => errorLines(lines), [lines]);
  const [query, setQuery] = useState("");
  const [stamps, setStamps] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [start, setStart] = useState(() => Math.max(0, (errors.indexes[0] ?? 0) - 100));
  const { hits, capped } = useMemo(() => searchLog(lines, query), [lines, query]);
  const hitSet = useMemo(() => new Set(hits), [hits]);
  const box = useRef<HTMLDivElement>(null);

  function jump(i: number) {
    setFocus(i);
    if (i < start || i >= start + WINDOW) setStart(Math.max(0, i - 200));
  }
  useEffect(() => {
    if (focus === null) return;
    box.current?.querySelector(`[data-line="${focus}"]`)?.scrollIntoView({ block: "center" });
  }, [focus, start]);

  function step(list: number[], dir: 1 | -1) {
    if (!list.length) return;
    const cur = focus ?? (dir === 1 ? -1 : lines.length);
    const next = dir === 1 ? list.find((i) => i > cur) ?? list[0] : [...list].reverse().find((i) => i < cur) ?? list[list.length - 1];
    jump(next);
  }

  function copy() {
    const [a, b] = sel ?? (focus !== null ? [Math.max(0, focus - 20), Math.min(lines.length - 1, focus + 20)] : [0, -1]);
    if (b < a) return;
    const out = snippet(lines, a, b, stamps);
    void navigator.clipboard.writeText(out).then(() => toast.success(t("ghci.logs.copied", { count: Math.abs(b - a) + 1 })), (e) => toastError(String(e)));
  }

  const end = Math.min(lines.length, start + WINDOW);
  const selLo = sel ? Math.min(...sel) : -1, selHi = sel ? Math.max(...sel) : -2;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("ghci.logs.search")} aria-label={t("ghci.logs.search")} className="h-7 w-56 text-xs"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); step(hits, e.shiftKey ? -1 : 1); } }} />
        {query.trim() && <span className="text-muted-foreground" aria-live="polite">{t("ghci.logs.hits", { count: hits.length })}{capped ? "+" : ""}</span>}
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("ghci.logs.prevHit")} disabled={!hits.length} onClick={() => step(hits, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={t("ghci.logs.nextHit")} disabled={!hits.length} onClick={() => step(hits, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!errors.indexes.length} onClick={() => step(errors.indexes, 1)}
          title={errors.kind === "heuristic" ? t("ghci.logs.heuristicHint") : undefined}>
          <TriangleAlert className="h-3 w-3" />
          {t(errors.kind === "marker" ? "ghci.logs.nextError" : "ghci.logs.nextErrorHeuristic", { count: errors.indexes.length })}
        </Button>
        <label className="flex items-center gap-1.5">
          <Switch checked={stamps} onCheckedChange={setStamps} aria-label={t("ghci.logs.timestamps")} />
          {t("ghci.logs.timestamps")}
        </label>
        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!sel && focus === null} onClick={copy}>
          <Copy className="h-3 w-3" />{sel ? t("ghci.logs.copySelection") : t("ghci.logs.copyContext")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void saveBytes(`${job.name.replace(/[^\w.-]+/g, "_")}-${job.id}.log`, textBase64(text), "text/plain").catch((e) => toastError(String(e)))}>
          <Download className="h-3 w-3" />{t("ghci.logs.save")}
        </Button>
      </div>
      <Muted>{t("ghci.logs.meta", { lines: lines.length, time: new Date(fetchedAt).toLocaleTimeString() })} · {t("ghci.logs.selectHint")}</Muted>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span>{t("ghci.logs.window", { from: lines.length ? start + 1 : 0, to: end, total: lines.length })}</span>
        <Button size="sm" variant="ghost" className="h-6 text-[0.6875rem]" disabled={start === 0} onClick={() => setStart(Math.max(0, start - WINDOW))}>{t("ghci.logs.earlier")}</Button>
        <Button size="sm" variant="ghost" className="h-6 text-[0.6875rem]" disabled={end >= lines.length} onClick={() => setStart(start + WINDOW)}>{t("ghci.logs.later")}</Button>
      </div>
      <div ref={box} className="max-h-[28rem] overflow-auto rounded-md border border-border/60 bg-muted/30 py-1 font-mono text-[0.6875rem] leading-[1.15rem]" role="log" aria-label={t("ghci.logs.title", { job: job.name })}>
        {lines.slice(start, end).map((l, k) => {
          const i = start + k;
          return (
            <div key={i} data-line={i}
              className={cn("flex whitespace-pre", l.error === "marker" && "bg-git-removed/10 text-git-removed", l.error === "heuristic" && "text-git-removed/90", hitSet.has(i) && "bg-primary/10", i >= selLo && i <= selHi && "bg-primary/20", i === focus && "outline outline-1 outline-primary", l.group === "start" && "font-semibold")}>
              <button type="button" className="w-12 shrink-0 select-none pr-2 text-right text-muted-foreground hover:text-foreground" aria-label={t("ghci.logs.selectLine", { n: l.n })}
                onClick={(e) => { setFocus(i); setSel(e.shiftKey && sel ? [sel[0], i] : [i, i]); }}>{l.n}</button>
              {stamps && l.stamp && <span className="pr-2 text-muted-foreground">{l.stamp}</span>}
              <span className="pr-2">{l.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
