import { CommitDiffViewer } from "@/components/repo/commit/commit-diff-viewer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { loadAgentReviewSummary, loadAgentReviewFileDiff, type AgentReviewSummary } from "@/lib/agents/agent-review";
import { useAgentWorktreeStore, worktreeDisplayName } from "@/lib/agents/agent-worktrees";
import { sourceDependencies } from "@/lib/change-workflow/dependencies";
import type { ChangeMapNode, MapDependency } from "@/lib/change-workflow/model";
import { loadChangeMap, type FileOverlay } from "@/lib/change-workflow/readers";
import { SOURCE_FILES_CAP, sourceFiles } from "@/lib/change-workflow-ui/backend";
import { indexMap, layoutTiles, nodeName, type MapIndex } from "@/lib/change-workflow-ui/map-layout";
import { loadDiffPreview } from "@/lib/diff-preview";
import { invoke } from "@/lib/platform/ipc";
import type { PullRequest } from "@/lib/repo-store";
import { useUiStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";
import { ChevronRight, FileCode2, Folder, GitMerge, Network, Radar } from "lucide-react";
import { Suspense, lazy, useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { LoadStatus, Pick, errText, short, useLoad } from "./kit";

const ChangeMap3D = lazy(() => import("./change-map-3d"));

const LIST_CAP = 300;
const TILE_CAP = 160;
const NO_EDGES: MapDependency[] = [];

type Analysis = {
  head: string;
  scopeDir: string;
  candidates: number;
  requested: number;
  read: number;
  omitted: { path: string; error: string }[];
  truncated: boolean;
  unresolved: { from: string; specifier: string }[];
  /** JS/TS sources whose own imports are not analysed (JSX/TSX until a JSX-aware parser exists). */
  unsupported: string[];
  dependencies: MapDependency[];
};

type Diff = { title: string; text: string | null; error: string | null; loading: boolean };

/** Opens a Git workbench section in this tools panel, expanding it if collapsed. */
function openWorkbench(section: "radar" | "integration") {
  const button = document.getElementById(`wb-${section}`);
  if (!button) return false;
  button.scrollIntoView({ block: "start", behavior: "smooth" });
  if (button.getAttribute("aria-expanded") === "false") button.click();
  button.focus();
  return true;
}

export function ChangeMap({ path }: { path: string }) {
  const { t } = useTranslation();
  const openBlameEditor = useUiStore((s) => s.openBlameEditor);
  const allWorktrees = useAgentWorktreeStore((s) => s.worktrees);
  const sessions = useMemo(() => Object.values(allWorktrees).filter((w) => w.basePath === path), [allWorktrees, path]);

  const [prPicked, setPrPicked] = useState<number[]>([]);
  const [sessionPicked, setSessionPicked] = useState<string[]>([]);
  const [filterText, setFilterText] = useState("");
  const [only, setOnly] = useState("all");
  const [view, setView] = useState<"list" | "map" | "space">("list");
  const [focus, setFocus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [navError, setNavError] = useState<string | null>(null);

  const prs = useLoad(`prs:${path}`, () => invoke<PullRequest[]>("pr_list", { path }));
  const overlayKey = JSON.stringify([path, [...prPicked].sort(), [...sessionPicked].sort()]);
  const overlays = useLoad(overlayKey, async () => {
    const pr = await Promise.all(prPicked.map(async (n) => ({
      id: `#${n}`, kind: "pullRequest" as const,
      files: (await invoke<{ path: string }[]>("pr_files", { path, number: n })).map((f) => f.path),
    })));
    const summaries = new Map<string, AgentReviewSummary>();
    const ses = await Promise.all(sessionPicked.map(async (wt) => {
      const summary = await loadAgentReviewSummary(wt, path);
      summaries.set(wt, summary);
      return { id: wt, kind: "session" as const, files: summary.files.map((f) => f.path) };
    }));
    return { list: [...pr, ...ses] as FileOverlay[], summaries };
  });
  const map = useLoad(overlays.data ? overlayKey : null, () => loadChangeMap(path, overlays.data!.list));
  const index = useMemo(() => (map.data ? indexMap(map.data.nodes) : null), [map.data]);
  const fileCount = useMemo(() => map.data?.nodes.filter((n) => n.kind === "file").length ?? 0, [map.data]);
  // sourceDependencies only emits edges between known repository paths, the same guarantee buildChangeMap applies.
  const edges = analysis?.dependencies ?? NO_EDGES;

  const label = (id: string) => (id.startsWith("#") ? t("changeMap.prLabel", { id }) : t("changeMap.sessionLabel", { name: worktreeDisplayName(id) }));
  const inOverlay = (id: string) => {
    const n = index?.byId.get(id);
    if (!n) return false;
    if (only === "all") return true;
    if (only === "any") return n.pullRequests.length + n.sessions.length > 0;
    return n.pullRequests.includes(only) || n.sessions.includes(only);
  };

  // Flat search when filtering; otherwise browse one directory at a time so huge repos stay cheap.
  const flat = filterText.trim() !== "" || only !== "all";
  const rows = useMemo(() => {
    if (!index || !map.data) return [];
    if (flat) {
      const q = filterText.trim().toLowerCase();
      return map.data.nodes.filter((n) => n.kind === "file" && (!q || n.id.toLowerCase().includes(q)) && inOverlay(n.id));
    }
    return index.children.get(focus) ?? [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, map.data, flat, filterText, only, focus]);

  const deps = useMemo(() => {
    if (!selected) return null;
    return { out: edges.filter((d) => d.from === selected), in: edges.filter((d) => d.to === selected) };
  }, [selected, edges]);

  const choose = (id: string) => {
    const n = index?.byId.get(id);
    if (!n) return;
    if (n.kind === "directory") { setFocus(id); setFilterText(""); setOnly("all"); }
    else { setSelected(id); setDiff(null); }
  };

  async function analyse() {
    if (!map.data) return;
    setAnalysing(true);
    setAnalysisError(null);
    try {
      const head = await invoke<string>("git_resolve_commit", { path, rev: "HEAD" });
      const all = map.data.nodes.filter((n) => n.kind === "file").map((n) => n.id);
      const scope = focus ? `${focus}/` : "";
      const inScope = all.filter((p) => p.startsWith(scope) && /\.[cm]?[jt]sx?$/i.test(p));
      // JSX/TSX is excluded by sourceDependencies; don't spend the read cap on them. They stay import targets via `all`.
      const jsx = inScope.filter((p) => /x$/i.test(p));
      const candidates = inScope.filter((p) => !/x$/i.test(p));
      const requested = candidates.slice(0, SOURCE_FILES_CAP);
      const res = requested.length ? await sourceFiles(path, requested, head) : { head, files: [], omitted: [], truncated: false };
      const result = sourceDependencies(res.files, all);
      const unsupported = [...new Set([...jsx, ...result.unsupported])];
      setAnalysis({
        head: res.head, scopeDir: focus ?? "", candidates: candidates.length, requested: requested.length, read: res.files.length,
        omitted: res.omitted, truncated: res.truncated || candidates.length > requested.length,
        unresolved: result.unresolved, unsupported, dependencies: result.dependencies,
      });
    } catch (e) {
      setAnalysisError(errText(e));
    } finally {
      setAnalysing(false);
    }
  }

  async function showDiff(kind: "work" | "pr" | "session", id?: string) {
    if (!selected) return;
    const file = selected;
    const title = kind === "work" ? t("changeMap.workingDiff") : label(id!);
    setDiff({ title, text: null, error: null, loading: true });
    try {
      let text: string | null;
      if (kind === "work") {
        const req = { file, ignoreWhitespace: false, colorMoved: false, context: 3 };
        const [unstaged, staged] = await Promise.all([loadDiffPreview(path, { ...req, kind: "unstaged" }), loadDiffPreview(path, { ...req, kind: "staged" })]);
        text = [staged.patch, unstaged.patch].filter(Boolean).join("\n");
      } else if (kind === "pr") {
        text = await invoke<string>("pr_file_patch", { path, number: Number(id!.slice(1)), file });
      } else {
        const summary = overlays.data?.summaries.get(id!);
        if (!summary) throw new Error(t("changeMap.sessionGone"));
        const d = await loadAgentReviewFileDiff(id!, summary.mergeBase, file);
        text = d.isBinary ? null : d.diff ?? (d.untrackedPlain !== null ? d.untrackedPlain.split("\n").map((l) => `+${l}`).join("\n") : null);
      }
      setDiff({ title, text, error: null, loading: false });
    } catch (e) {
      setDiff({ title, text: null, error: errText(e), loading: false });
    }
  }

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-row]")];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[Math.max(0, Math.min(items.length - 1, at + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
    } else if (e.key === "Backspace" && !flat && focus) {
      e.preventDefault();
      setFocus(index?.byId.get(focus)?.parent ?? null);
    }
  };

  const crumbs = focus ? focus.split("/").map((_, i, parts) => parts.slice(0, i + 1).join("/")) : [];
  const shownRows = rows.slice(0, LIST_CAP);
  const selectedNode = selected ? index?.byId.get(selected) : undefined;

  return (
    <div className="space-y-3">
      <p className="text-[0.6875rem] text-muted-foreground">{t("changeMap.intro")}</p>

      <fieldset className="space-y-1.5">
        <legend className="text-[0.6875rem] font-semibold">{t("changeMap.overlays")}</legend>
        <LoadStatus state={prs} label={t("changeMap.loadingPrs")} />
        {prs.data && prs.data.length === 0 && <p className="text-[0.6875rem] text-muted-foreground">{t("changeMap.noPrs")}</p>}
        <div className="flex max-h-28 flex-col gap-1 overflow-auto">
          {prs.data?.map((pr) => (
            <label key={pr.number} className="flex items-center gap-2 text-xs">
              <Checkbox checked={prPicked.includes(pr.number)} onCheckedChange={(v) => setPrPicked((p) => (v ? [...p, pr.number] : p.filter((n) => n !== pr.number)))} />
              <span className="truncate">#{pr.number} {pr.title}</span>
            </label>
          ))}
          {sessions.map((s) => (
            <label key={s.path} className="flex items-center gap-2 text-xs">
              <Checkbox checked={sessionPicked.includes(s.path)} onCheckedChange={(v) => setSessionPicked((p) => (v ? [...p, s.path] : p.filter((x) => x !== s.path)))} />
              <span className="truncate">{label(s.path)} · <span className="font-mono">{s.branch}</span></span>
            </label>
          ))}
        </div>
        {sessions.length === 0 && <p className="text-[0.6875rem] text-muted-foreground">{t("changeMap.noSessions")}</p>}
        <LoadStatus state={overlays} label={t("changeMap.loadingOverlays")} />
      </fieldset>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[0.6875rem] font-medium text-muted-foreground">
          {t("changeMap.filterPath")}
          <Input value={filterText} onChange={(e) => setFilterText(e.target.value)} placeholder="src/lib" className="mt-0.5 h-7 font-mono text-xs" />
        </label>
        <Pick
          label={t("changeMap.show")}
          value={only}
          onChange={setOnly}
          options={[
            { value: "all", label: t("changeMap.showAll") },
            { value: "any", label: t("changeMap.showAnyOverlay") },
            ...(overlays.data?.list ?? []).map((o) => ({ value: o.id, label: label(o.id) })),
          ]}
        />
      </div>

      <section className="space-y-1.5 rounded-md border border-border/60 p-2" aria-labelledby="cm-deps">
        <div className="flex items-center gap-2">
          <h4 id="cm-deps" className="flex-1 text-[0.6875rem] font-semibold">{t("changeMap.dependencies")}</h4>
          <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[0.6875rem]" disabled={!map.data || analysing} onClick={() => void analyse()}>
            <Network className="size-3" /> {t("changeMap.analyse", { dir: focus ?? t("changeMap.root") })}
          </Button>
        </div>
        <p className="text-[0.625rem] text-muted-foreground">{t("changeMap.analysisLimit", { cap: SOURCE_FILES_CAP })}</p>
        {analysing && <p role="status" className="text-[0.6875rem] text-muted-foreground">{t("changeMap.analysing")}</p>}
        {analysisError && <p role="alert" className="text-[0.6875rem] text-destructive">{analysisError}</p>}
        {analysis ? (
          <div className="space-y-0.5 text-[0.6875rem]">
            <p>{t("changeMap.analysisScope", { dir: analysis.scopeDir || t("changeMap.root"), head: short(analysis.head), read: analysis.read, requested: analysis.requested, candidates: analysis.candidates })}</p>
            <p>{t("changeMap.analysisResult", { edges: analysis.dependencies.length, unresolved: analysis.unresolved.length, omitted: analysis.omitted.length })}</p>
            {analysis.truncated && <p className="text-amber-600">{t("changeMap.analysisTruncated")}</p>}
            {analysis.unsupported.length > 0 && (
              <details>
                <summary className="cursor-pointer text-amber-600">{t("changeMap.unsupportedFiles", { count: analysis.unsupported.length })}</summary>
                <ul className="max-h-24 overflow-auto font-mono text-[0.625rem]">
                  {analysis.unsupported.slice(0, 100).map((p) => <li key={p}>{p}</li>)}
                </ul>
              </details>
            )}
            {analysis.omitted.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">{t("changeMap.omittedFiles")}</summary>
                <ul className="max-h-24 overflow-auto font-mono text-[0.625rem]">
                  {analysis.omitted.slice(0, 100).map((o) => <li key={o.path}>{o.path}: {o.error}</li>)}
                </ul>
              </details>
            )}
          </div>
        ) : (
          !analysing && <p className="text-[0.6875rem] text-muted-foreground">{t("changeMap.noAnalysis")}</p>
        )}
      </section>

      <LoadStatus state={map} label={t("changeMap.loadingMap")} />

      {index && map.data && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" size="sm" value={view} onValueChange={(v) => v && setView(v as typeof view)} aria-label={t("changeMap.view")}>
              <ToggleGroupItem value="list" className="h-6 px-2 text-[0.6875rem]">{t("changeMap.viewList")}</ToggleGroupItem>
              <ToggleGroupItem value="map" className="h-6 px-2 text-[0.6875rem]">{t("changeMap.viewMap")}</ToggleGroupItem>
              <ToggleGroupItem value="space" className="h-6 px-2 text-[0.6875rem]">{t("changeMap.viewSpace")}</ToggleGroupItem>
            </ToggleGroup>
            <span className="text-[0.625rem] text-muted-foreground">{t("changeMap.workingCopy", { files: fileCount })}</span>
          </div>

          {!flat && (
            <nav aria-label={t("changeMap.breadcrumb")} className="flex flex-wrap items-center gap-0.5 font-mono text-[0.6875rem]">
              <button type="button" className="hover:underline" onClick={() => setFocus(null)}>{t("changeMap.root")}</button>
              {crumbs.map((c) => (
                <span key={c} className="flex items-center gap-0.5">
                  <ChevronRight className="size-3" />
                  <button type="button" className="hover:underline" onClick={() => setFocus(c)}>{nodeName(c)}</button>
                </span>
              ))}
            </nav>
          )}

          {view === "list" || flat ? (
            <>
              {view !== "list" && <p className="text-[0.625rem] text-muted-foreground">{t("changeMap.flatAsList")}</p>}
              {rows.length === 0 ? (
                <p className="text-[0.6875rem] text-muted-foreground">{t("changeMap.noMatches")}</p>
              ) : (
                <ul className="max-h-72 overflow-auto rounded-md border border-border/50" aria-label={t("changeMap.files")} onKeyDown={onListKey}>
                  {shownRows.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        data-row
                        aria-current={selected === n.id ? "true" : undefined}
                        onClick={() => choose(n.id)}
                        className={cn("flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none", selected === n.id && "bg-primary/10")}
                      >
                        {n.kind === "directory" ? <Folder className="size-3.5 shrink-0" /> : <FileCode2 className="size-3.5 shrink-0" />}
                        <span className="min-w-0 flex-1 truncate font-mono">{flat ? n.id : nodeName(n.id)}</span>
                        {n.kind === "directory" && <span className="text-[0.625rem] text-muted-foreground">{index.leaves.get(n.id)}</span>}
                        {n.pullRequests.map((p) => <span key={p} className="rounded bg-sky-500/15 px-1 text-[0.625rem] text-sky-600">{p}</span>)}
                        {n.sessions.length > 0 && <span className="rounded bg-amber-500/15 px-1 text-[0.625rem] text-amber-600">{t("changeMap.sessionCount", { count: n.sessions.length })}</span>}
                      </button>
                    </li>
                  ))}
                  {rows.length > LIST_CAP && <li className="px-2 py-1 text-[0.625rem] text-muted-foreground">{t("changeMap.moreRows", { count: rows.length - LIST_CAP })}</li>}
                </ul>
              )}
            </>
          ) : view === "map" ? (
            <TileMap rows={rows} index={index} selected={selected} onChoose={choose} />
          ) : (
            <Suspense fallback={<p role="status" className="text-[0.6875rem] text-muted-foreground">{t("changeMap.loading3d")}</p>}>
              <ChangeMap3D rows={rows.slice(0, TILE_CAP)} index={index} dependencies={edges} selected={selected} onChoose={choose} />
              <p className="text-[0.625rem] text-muted-foreground">{t("changeMap.spaceHint")}</p>
            </Suspense>
          )}
        </>
      )}

      {selectedNode && (
        <section className="space-y-2 rounded-md border border-border/60 p-2" aria-labelledby="cm-sel">
          <h4 id="cm-sel" className="break-all font-mono text-xs font-semibold">{selectedNode.id}</h4>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[0.6875rem]" onClick={() => openBlameEditor(path, selectedNode.id)}>{t("changeMap.openFile")}</Button>
            <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[0.6875rem]" onClick={() => void showDiff("work")}>{t("changeMap.workingDiff")}</Button>
            {selectedNode.pullRequests.map((p) => (
              <Button key={p} type="button" size="sm" variant="outline" className="h-6 px-2 text-[0.6875rem]" onClick={() => void showDiff("pr", p)}>{t("changeMap.diffIn", { name: label(p) })}</Button>
            ))}
            {selectedNode.sessions.map((s) => (
              <Button key={s} type="button" size="sm" variant="outline" className="h-6 px-2 text-[0.6875rem]" onClick={() => void showDiff("session", s)}>{t("changeMap.diffIn", { name: label(s) })}</Button>
            ))}
            {selectedNode.pullRequests.length + selectedNode.sessions.length > 1 && (
              <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[0.6875rem]" onClick={() => setNavError(openWorkbench("radar") ? null : t("changeMap.workbenchMissing"))}>
                <Radar className="size-3" /> {t("changeMap.conflictRadar")}
              </Button>
            )}
            {selectedNode.pullRequests.length + selectedNode.sessions.length > 0 && (
              <Button type="button" size="sm" variant="outline" className="h-6 gap-1 px-2 text-[0.6875rem]" onClick={() => setNavError(openWorkbench("integration") ? null : t("changeMap.workbenchMissing"))}>
                <GitMerge className="size-3" /> {t("changeMap.integrationLab")}
              </Button>
            )}
          </div>
          {navError && <p role="alert" className="text-[0.6875rem] text-destructive">{navError}</p>}
          {deps && (
            <div className="grid grid-cols-2 gap-2 text-[0.6875rem]">
              {(["out", "in"] as const).map((dir) => (
                <div key={dir}>
                  <p className="font-semibold">{t(dir === "out" ? "changeMap.imports" : "changeMap.importedBy")}</p>
                  {!analysis ? (
                    <p className="text-muted-foreground">{t("changeMap.notAnalysed")}</p>
                  ) : deps[dir].length === 0 ? (
                    <p className="text-muted-foreground">{t("changeMap.noneFound")}</p>
                  ) : (
                    <ul>
                      {deps[dir].map((d) => {
                        const other = dir === "out" ? d.to : d.from;
                        return (
                          <li key={other}>
                            <button type="button" className="break-all text-left font-mono hover:underline" onClick={() => choose(other)}>{other}</button>
                            <span className="ml-1 text-muted-foreground">({t("changeMap.sourceImport")})</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
          {diff && (
            <div className="space-y-1">
              <p className="text-[0.6875rem] font-semibold">{diff.title}</p>
              {diff.loading && <p role="status" className="text-[0.6875rem] text-muted-foreground">{t("changeMap.loadingDiff")}</p>}
              {diff.error && <p role="alert" className="text-[0.6875rem] text-destructive">{diff.error}</p>}
              {!diff.loading && !diff.error && (diff.text ? (
                <div className="h-72 overflow-hidden rounded-md border border-border/50">
                  <CommitDiffViewer unifiedText={diff.text} filename={selectedNode.id} />
                </div>
              ) : (
                <p className="text-[0.6875rem] text-muted-foreground">{t("changeMap.noDiff")}</p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TileMap({ rows, index, selected, onChoose }: {
  rows: ChangeMapNode[];
  index: MapIndex;
  selected: string | null;
  onChoose: (id: string) => void;
}) {
  const { t } = useTranslation();
  const shown = rows.slice(0, TILE_CAP);
  const tiles = layoutTiles(shown.map((n) => ({ item: n, weight: index.leaves.get(n.id) ?? 1 })));
  if (rows.length === 0) return <p className="text-[0.6875rem] text-muted-foreground">{t("changeMap.noMatches")}</p>;
  return (
    <>
      <div role="list" aria-label={t("changeMap.viewMap")} className="relative h-72 overflow-hidden rounded-md border border-border/50 bg-muted/20">
        {tiles.map(({ item: n, rect }) => {
          const pr = n.pullRequests.length > 0;
          const ses = n.sessions.length > 0;
          return (
            <button
              key={n.id}
              type="button"
              role="listitem"
              title={`${n.id} (${index.leaves.get(n.id)})`}
              aria-label={`${n.kind === "directory" ? t("changeMap.directory") : t("changeMap.file")} ${n.id}${pr ? `, ${n.pullRequests.join(" ")}` : ""}${ses ? `, ${t("changeMap.sessionCount", { count: n.sessions.length })}` : ""}`}
              onClick={() => onChoose(n.id)}
              className={cn(
                "absolute overflow-hidden border border-background p-0.5 text-left font-mono text-[0.625rem] leading-tight focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-primary",
                pr && ses ? "bg-violet-500/30" : pr ? "bg-sky-500/25" : ses ? "bg-amber-500/25" : n.kind === "directory" ? "bg-muted/60" : "bg-muted/30",
                selected === n.id && "ring-2 ring-primary",
              )}
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
            >
              {nodeName(n.id)}
            </button>
          );
        })}
      </div>
      <p className="text-[0.625rem] text-muted-foreground">
        {t("changeMap.legend")}
        {rows.length > TILE_CAP && ` · ${t("changeMap.moreRows", { count: rows.length - TILE_CAP })}`}
      </p>
    </>
  );
}
