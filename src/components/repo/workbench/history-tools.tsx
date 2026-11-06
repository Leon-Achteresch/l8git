import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HistoryResult } from "@/lib/git-expansion";
import { formatRelative } from "@/lib/format";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Field, Pre, RunButton, Section, TextField, short, useGx } from "./workbench-kit";

function Commits({ result, onMore, busy }: { result: HistoryResult; onMore: () => void; busy: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <p className="text-[0.625rem] text-muted-foreground">{t("wb.pinnedAt", { rev: short(result.revision) })}</p>
      {result.commits.length === 0 && <p className="text-xs text-muted-foreground">{t("wb.noCommits")}</p>}
      <ul className="divide-y divide-border/40 text-xs">
        {result.commits.map((c) => (
          <li key={c.hash} className="flex gap-2 py-1">
            <button type="button" className="font-mono text-primary hover:underline" title={t("wb.copySha")} onClick={() => void navigator.clipboard.writeText(c.hash)}>
              {short(c.hash)}
            </button>
            <span className="min-w-0 flex-1 truncate">{c.subject}</span>
            <span className="shrink-0 text-muted-foreground">{c.author} · {formatRelative(c.date)}</span>
          </li>
        ))}
      </ul>
      {result.patch && <Pre text={result.patch} />}
      {result.hasMore && <Button variant="ghost" size="sm" className="h-6 text-xs" disabled={busy} onClick={onMore}>{t("ghx.loadMore")}</Button>}
    </div>
  );
}

/** 49: `git log -S/-G` with literal argument passing and paging. */
export function PickaxeTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"literal" | "regex">("literal");
  const [rev, setRev] = useState("");
  const [res, setRes] = useState<HistoryResult | null>(null);
  async function go(page: number) {
    const r = await gx.call({ op: "pickaxe", text, mode, revision: res && page > 1 ? res.revision : rev.trim() || undefined, page });
    if (r) setRes(page > 1 && res ? { ...r, commits: [...res.commits, ...r.commits] } : r);
  }
  return (
    <Section id="pickaxe" title={t("wb.pickaxe")} hint={t("wb.pickaxeHint")}>
      <TextField label={t("wb.searchText")} value={text} onChange={setText} />
      <div className="flex items-end gap-2">
        <Field label={t("wb.mode")}>
          <select value={mode} onChange={(e) => setMode(e.target.value as "literal" | "regex")} className="h-7 rounded-md border border-input bg-transparent px-2 text-xs">
            <option value="literal">{t("wb.modeLiteral")}</option>
            <option value="regex">{t("wb.modeRegex")}</option>
          </select>
        </Field>
        <div className="flex-1"><TextField label={t("wb.revisionOptional")} value={rev} onChange={setRev} placeholder="HEAD" /></div>
        <RunButton busy={gx.busy} disabled={!text} onClick={() => void go(1)}>{t("common.search")}</RunButton>
      </div>
      {res && <Commits result={res} busy={gx.busy} onMore={() => void go(res.page + 1)} />}
    </Section>
  );
}

/** 50: `git log -L start,end:file`, Git's own line-range tracking. */
export function FunctionHistoryTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [file, setFile] = useState("");
  const [rev, setRev] = useState("HEAD");
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(1);
  const [res, setRes] = useState<HistoryResult | null>(null);
  async function go(page: number) {
    const r = await gx.call({ op: "function_history", file, revision: res && page > 1 ? res.revision : rev, start, end, page });
    if (r) setRes(page > 1 && res ? { ...r, commits: [...res.commits, ...r.commits] } : r);
  }
  return (
    <Section id="funclog" title={t("wb.funcHistory")} hint={t("wb.funcHistoryHint")}>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <TextField label={t("wb.file")} value={file} onChange={setFile} placeholder="src/main.ts" />
        <TextField label={t("wb.revision")} value={rev} onChange={setRev} />
      </div>
      <div className="flex items-end gap-2">
        <Field label={t("wb.startLine")}><Input type="number" min={1} value={start} onChange={(e) => setStart(Number(e.target.value))} className="h-7 w-24 text-xs" /></Field>
        <Field label={t("wb.endLine")}><Input type="number" min={start} value={end} onChange={(e) => setEnd(Number(e.target.value))} className="h-7 w-24 text-xs" /></Field>
        <RunButton busy={gx.busy} disabled={!file || start < 1 || end < start} onClick={() => void go(1)}>{t("wb.trace")}</RunButton>
      </div>
      {res && <Commits result={res} busy={gx.busy} onMore={() => void go(res.page + 1)} />}
    </Section>
  );
}

/** 51: `git range-diff` between an old and a rewritten series. */
export function RangeDiffTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [v, setV] = useState({ oldBase: "", oldHead: "", newBase: "", newHead: "" });
  const [res, setRes] = useState<{ diff: string; oldHead: string; newHead: string } | null>(null);
  const set = (k: keyof typeof v) => (x: string) => setV((p) => ({ ...p, [k]: x }));
  return (
    <Section id="rangediff" title={t("wb.rangeDiff")} hint={t("wb.rangeDiffHint")}>
      <div className="grid grid-cols-2 gap-2">
        <TextField label={t("wb.oldBase")} value={v.oldBase} onChange={set("oldBase")} placeholder="main@{1}" />
        <TextField label={t("wb.oldHead")} value={v.oldHead} onChange={set("oldHead")} placeholder="feature@{1}" />
        <TextField label={t("wb.newBase")} value={v.newBase} onChange={set("newBase")} placeholder="main" />
        <TextField label={t("wb.newHead")} value={v.newHead} onChange={set("newHead")} placeholder="feature" />
      </div>
      <RunButton busy={gx.busy} disabled={Object.values(v).some((x) => !x.trim())} onClick={() => void gx.call({ op: "range_diff", ...v }).then((r) => r && setRes(r))}>
        {t("wb.compare")}
      </RunButton>
      {res && (
        <>
          <p className="text-[0.625rem] text-muted-foreground">{t("wb.pinnedRange", { old: short(res.oldHead), new: short(res.newHead) })}</p>
          {res.diff.trim() ? <Pre text={res.diff} /> : <p className="text-xs text-muted-foreground">{t("wb.rangeSame")}</p>}
        </>
      )}
    </Section>
  );
}

/** 60: blame honoring `.git-blame-ignore-revs`. */
export function BlameIgnoreTool({ path }: { path: string }) {
  const { t } = useTranslation();
  const gx = useGx(path);
  const [file, setFile] = useState("");
  const [rev, setRev] = useState("HEAD");
  const [res, setRes] = useState<{ head: string; ignoredRevisions: string[]; porcelain: string } | null>(null);
  const lines = res ? blameLines(res.porcelain) : [];
  return (
    <Section id="blameignore" title={t("wb.blameIgnore")} hint={t("wb.blameIgnoreHint")}>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <TextField label={t("wb.file")} value={file} onChange={setFile} />
        <TextField label={t("wb.revision")} value={rev} onChange={setRev} />
      </div>
      <RunButton busy={gx.busy} disabled={!file} onClick={() => void gx.call({ op: "blame_ignore", file, revision: rev }).then((r) => r && setRes(r))}>{t("wb.blame")}</RunButton>
      {res && (
        <>
          <p className="text-[0.625rem] text-muted-foreground">
            {t("wb.ignoredRevs", { count: res.ignoredRevisions.length, head: short(res.head) })}
          </p>
          <Pre text={lines.map((l) => `${short(l.sha)} ${l.author.padEnd(16).slice(0, 16)} ${String(l.line).padStart(5)} ${l.text}`).join("\n")} />
        </>
      )}
    </Section>
  );
}

/** Minimal `git blame --porcelain` reader: one row per final line. */
export function blameLines(porcelain: string): { sha: string; author: string; line: number; text: string }[] {
  const authors = new Map<string, string>();
  const out: { sha: string; author: string; line: number; text: string }[] = [];
  let sha = "";
  let line = 0;
  for (const raw of porcelain.split("\n")) {
    const head = /^([0-9a-f]{40,64}) \d+ (\d+)/.exec(raw);
    if (head) {
      sha = head[1];
      line = Number(head[2]);
    } else if (raw.startsWith("author ")) authors.set(sha, raw.slice(7));
    else if (raw.startsWith("\t")) out.push({ sha, author: authors.get(sha) ?? "", line, text: raw.slice(1) });
  }
  return out;
}
