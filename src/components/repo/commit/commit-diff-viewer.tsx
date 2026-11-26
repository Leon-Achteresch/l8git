import { formatBackendError } from '@/lib/backend-error';
import { SpinIcon } from "@/components/motion/kit";
import { Toggle } from "@/components/ui/toggle";
import { useCommitPrefs } from "@/lib/commit-prefs";
import { loadDiffPreview, type DiffPreviewRequest, type DiffPreviewResponse } from "@/lib/diff-preview";
import { DEFAULT_CONTEXT, isTransformed, nextContext, useDiffViewOptions } from "@/lib/workbench-ui/diff-view-options";
import { Loader2, MoveVertical, SlidersHorizontal, UnfoldVertical, WrapText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DiffLayoutToggle } from "./diff-layout-toggle";
import { IssueFromDiffButton } from "../github/issue-from-diff";
import { SemanticDiffView, semanticKind } from "../github/semantic-diff";
import { UnifiedDiffBody } from "./unified-diff-body";

const MonacoDiffViewer = lazy(() =>
  import("./monaco-diff-viewer").then((m) => ({ default: m.MonacoDiffViewer })),
);

export type DiffPreviewSource = {
  path: string;
  request: Omit<DiffPreviewRequest, "ignoreWhitespace" | "colorMoved" | "context">;
  /** Effective pinned revisions for semantic views (merge-base already resolved by the caller). */
  revisions?: { base: string; head: string };
};

/** A working-copy preview waits for its source snapshot (null while loading).
 * Pinned commit previews have stable revisions and omit the snapshot. */
export function useDiffPreview(source: DiffPreviewSource | undefined, revision?: object | null) {
  const opts = useDiffViewOptions();
  const key = source ? JSON.stringify(source) : "";
  const [expanded, setExpanded] = useState<{ key: string; lines: number } | null>(null);
  const context = expanded?.key === key ? expanded.lines : DEFAULT_CONTEXT;
  const setContext = (lines: number) => setExpanded({ key, lines });
  useEffect(() => setExpanded(current => current?.key === key ? current : null), [key]);
  const active = !!source && revision !== null && isTransformed(opts, context);
  const path = source?.path;
  const { kind, file, previousFile, base, head } = source?.request ?? {};
  const { ignoreWhitespace, colorMoved } = opts;
  const input = useMemo(() => {
    if (!active || path === undefined || kind === undefined || file === undefined) return null;
    return { path, request: { kind, file, previousFile, base, head, ignoreWhitespace, colorMoved, context } };
  }, [active, path, kind, file, previousFile, base, head, ignoreWhitespace, colorMoved, context]);
  const [result, setResult] = useState<{
    input: NonNullable<typeof input>;
    revision?: object | null;
    res: DiffPreviewResponse | null;
    error: string | null;
  } | null>(null);
  useEffect(() => {
    setResult(null);
    if (!input) return;
    let live = true;
    loadDiffPreview(input.path, input.request)
      .then(
        res => { if (live) setResult({ input, revision, res, error: null }); },
        error => { if (live) setResult({ input, revision, res: null, error: formatBackendError(error) }); },
      );
    return () => {
      live = false;
    };
  }, [input, revision]);
  const current = result && result.input === input && result.revision === revision ? result : null;
  return { opts, context, setContext, active, res: current?.res ?? null, error: current?.error ?? null, loading: active && !current };
}

/** Whitespace / moved-code / context toggles for a `useDiffPreview` state. */
export function DiffOptionToggles({ p, compact = false }: { p: ReturnType<typeof useDiffPreview>; compact?: boolean }) {
  const { t } = useTranslation();
  const toggle = "h-6 gap-1 px-1.5 text-[11px]";
  // Compact: one trigger, so dense headers (staging panel at large UI scale) never wrap.
  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Toggle size="sm" className="h-6 w-6 min-w-6 px-0" pressed={p.active} aria-label={t("diffView.options")} title={t("diffView.options")}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Toggle>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-1.5">
          <DiffOptionToggles p={p} />
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <span className="flex items-center gap-1">
              <Toggle size="sm" className={toggle} pressed={p.opts.ignoreWhitespace} onPressedChange={(v) => p.opts.set({ ignoreWhitespace: v })} title={t("diffView.ignoreWhitespace")} aria-label={t("diffView.ignoreWhitespace")}>
                <WrapText className="h-3 w-3" />
              </Toggle>
              <Toggle size="sm" className={toggle} pressed={p.opts.colorMoved} onPressedChange={(v) => p.opts.set({ colorMoved: v })} title={t("diffView.moved")} aria-label={t("diffView.moved")}>
                <MoveVertical className="h-3 w-3" />
              </Toggle>
              <Toggle size="sm" className={toggle} pressed={p.context !== DEFAULT_CONTEXT} disabled={p.context >= 500}
                onPressedChange={() => p.setContext(nextContext(p.context))}
                title={t("diffView.moreContext", { lines: nextContext(p.context) })} aria-label={t("diffView.moreContext", { lines: nextContext(p.context) })}>
                <UnfoldVertical className="h-3 w-3" />
                {p.context !== DEFAULT_CONTEXT && <span>{p.context}</span>}
              </Toggle>
              {p.context !== DEFAULT_CONTEXT && (
                <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => p.setContext(DEFAULT_CONTEXT)}>
                  {t("common.reset")}
                </button>
              )}
              {p.loading && <SpinIcon icon={Loader2} className="h-3 w-3 text-primary/60" />}
                </span>
  );
}

/** Read-only diff of one file: virtualized rows inline, Monaco only side by side. */
export function CommitDiffViewer({
  unifiedText,
  filename,
  preview,
}: {
  unifiedText: string;
  filename?: string | null;
  /** Enables whitespace / moved-code / context controls for this pinned file. */
  preview?: DiffPreviewSource;
}) {
  const { t } = useTranslation();
  const layoutMode = useCommitPrefs((s) => s.diffLayoutMode);
  const p = useDiffPreview(preview);
  const semantic = preview?.revisions && filename ? semanticKind(filename) : null;
  const [view, setView] = useState<"patch" | "semantic">("patch");
  useEffect(() => setView("patch"), [filename]);
  const text = p.active && p.res ? p.res.patch : unifiedText;
  const moved = useMemo(() => new Set(p.active && p.res ? p.res.movedLines : []), [p.active, p.res]);
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-muted/15 px-4 py-2">
        <span
          title={filename ?? undefined}
          className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
        >
          {filename}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {semantic && (
            <select value={view} onChange={(e) => setView(e.target.value as "patch" | "semantic")} aria-label={t("semantic.view")} className="h-6 rounded border border-input bg-transparent px-1 text-[11px]">
              <option value="patch">{t("semantic.patch")}</option>
              <option value="semantic">{t(`semantic.mode.${semantic}`)}</option>
            </select>
          )}
          {preview && view === "patch" && <DiffOptionToggles p={p} />}
          {preview?.request.head && filename && <IssueFromDiffButton path={preview.path} file={filename} sha={preview.request.head} />}
          <DiffLayoutToggle className="shrink-0" />
        </span>
      </div>
      {p.active && (p.error || p.res?.truncated || (p.opts.colorMoved && layoutMode === "sideBySide")) && (
        <p role="status" className="shrink-0 border-b border-border bg-muted/30 px-4 py-1 text-[11px] text-muted-foreground">
          {p.error ? t("diffView.previewFailed", { error: p.error }) : p.res?.truncated ? t("diffView.truncated") : t("diffView.movedInlineOnly")}
        </p>
      )}
      <div className="min-h-0 flex-1">
        {view === "semantic" && semantic && preview?.revisions && filename ? (
          <SemanticDiffView path={preview.path} file={filename} previousFile={preview.request.previousFile} base={preview.revisions.base} head={preview.revisions.head} kind={semantic} />
        ) : p.active && p.loading && !p.res ? (
          <div className="flex h-full items-center justify-center">
            <SpinIcon icon={Loader2} className="h-6 w-6 text-primary/50" />
          </div>
        ) : layoutMode === "sideBySide" ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <SpinIcon icon={Loader2} className="h-6 w-6 text-primary/50" />
              </div>
            }
          >
            <MonacoDiffViewer unifiedText={text} filename={filename} />
          </Suspense>
        ) : (
          // Monaco's inline mode renders every deleted line eagerly, which stutters on big diffs.
          <UnifiedDiffBody
            loading={false}
            failed={false}
            isBinary={false}
            unifiedText={text}
            untrackedPlain={null}
            emptyHint={p.active && p.opts.ignoreWhitespace ? t("diffView.whitespaceOnly") : t("commitInspect.noTextChanges")}
            failedHint={t("diff.diffLoadFailedFallback")}
            filePath={filename}
            lineNumbers
            movedLines={moved}
          />
        )}
      </div>
    </div>
  );
}
