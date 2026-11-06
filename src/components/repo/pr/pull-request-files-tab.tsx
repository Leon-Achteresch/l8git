import { SpinIcon } from "@/components/motion/kit";
import { UnifiedDiffBody } from "@/components/repo/commit/unified-diff-body";
import { MediaDiffPanel } from "@/components/repo/media/media-diff-panel";
import { ListRow } from "@/components/ui/list-row";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toastError } from "@/lib/error-toast";
import { isImagePath, looksLikeLfsPointerText } from "@/lib/media";
import { usePrCapabilities } from "@/lib/pr-provider-store";
import {
  draftKey,
  draftsByLine,
  useReviewDraftStore,
  useReviewDrafts,
} from "@/lib/pr-review-drafts";
import {
  groupInlineThreads,
  threadsForFile,
  type PrComment,
} from "@/lib/pr-threads";
import { useRepoStore } from "@/lib/repo-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { CheckSquare, FileCode2, Lightbulb, Loader2, Square } from "lucide-react";
import { usePrReviewMemory } from "@/lib/github-ui/review-memory";
import { buildRange, headLinesFromPatch, rangeKeys, rangeFields, sideLineKey, storedRangeKeys, type DiffAnchor, type DiffRange } from "@/lib/github-ui/diff-ranges";
import { useReviewThreadIndex } from "@/lib/github-ui/review-threads";
import { parseUnifiedDiff } from "@/lib/unified-diff";
import { SuggestionBatchDialog } from "../github/suggestion-batch-dialog";
import { PrPermalinkButton } from "../github/pr-permalink-button";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import {
  InlineCommentComposer,
  InlineDraftCard,
  InlineThreadCard,
  type ThreadRange,
  type ThreadResolveState,
} from "./pull-request-inline-comments";

type GhReviewThread = {
  id: string;
  resolved: boolean;
  comment_ids: string[];
};

type PrFile = {
  path: string;
  /** Rename source from `pr_files`; part of the review fingerprint (ID 1). */
  previous_path?: string | null;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
};

const STATUS_COLORS: Record<string, string> = {
  added: "text-emerald-400 font-bold",
  modified: "text-amber-400 font-bold",
  removed: "text-rose-400 font-bold",
  renamed: "text-indigo-400 font-bold",
};

function refCandidates(
  ref: string | undefined,
  remoteFirst: boolean,
): (string | null)[] {
  const name = ref?.trim();
  if (!name) return [];
  const remote = `origin/${name}`;
  return remoteFirst ? [remote, name] : [name, remote];
}

export function PullRequestFilesTab({
  path,
  number,
  baseRef,
  headRef,
  headSha,
  baseSha,
}: {
  path: string;
  number: number;
  baseRef?: string;
  headRef?: string;
  /** Pinned head commit; enables persistent review memory and permalinks. */
  headSha?: string;
  /** Pinned base commit (when known) for files the provider sent without a patch. */
  baseSha?: string;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<PrFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [comments, setComments] = useState<PrComment[]>([]);
  const [reviewThreads, setReviewThreads] = useState<GhReviewThread[]>([]);
  const [composer, setComposer] = useState<{ line: number; text: string } | null>(
    null,
  );
  // GitHub: side-aware (old/new) anchor with Shift-extended range; body survives while the range moves.
  const [rangeComposer, setRangeComposer] = useState<{ file: string; anchor: DiffAnchor; range: DiffRange; body: string } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);

  const caps = usePrCapabilities(path);
  const memoryPositionRef = useRef<string | null>(null);
  const memory = usePrReviewMemory(path, number, files, { head: headSha ?? "", base: baseSha ?? null });
  memoryPositionRef.current = memory.position?.file ?? null;
  const selectFile = useCallback((p: string) => {
    setSelected(p);
    memory.savePosition(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memory.savePosition]);
  const currentBranch = useRepoStore((s) => s.repos[path]?.branch ?? "");
  const drafts = useReviewDrafts(path, number);
  const addDraft = useReviewDraftStore((s) => s.addDraft);
  const updateDraft = useReviewDraftStore((s) => s.updateDraft);
  const removeDraft = useReviewDraftStore((s) => s.removeDraft);

  const canComment = caps?.can_inline_comments ?? false;
  // Old-side and multiline anchors are submitted only by the GitHub payload; others stay new-line only.
  const rangeCapable = caps?.provider === "github";
  const ghThreads = useReviewThreadIndex(path, number);
  const canResolveThreads = caps?.can_resolve_threads ?? false;
  const branchCheckedOut = !!headRef && currentBranch === headRef;
  const applyDisabledHint = t("prReview.suggestionApplyDisabled", {
    branch: headRef ?? "",
  });

  const loadComments = useCallback(() => {
    let cancelled = false;
    invoke<{ comments: PrComment[] }>("pr_conversation", { path, number })
      .then((res) => {
        if (!cancelled) setComments(res.comments ?? []);
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number]);

  const loadThreadState = useCallback(() => {
    if (!canResolveThreads) return () => {};
    let cancelled = false;
    invoke<GhReviewThread[]>("pr_review_threads", { path, number })
      .then((res) => {
        if (!cancelled) setReviewThreads(res);
      })
      .catch(() => {
        if (!cancelled) setReviewThreads([]);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number, canResolveThreads]);

  useEffect(() => {
    setComments([]);
    setComposer(null);
    setRangeComposer(null);
    return loadComments();
  }, [loadComments]);

  useEffect(() => {
    setReviewThreads([]);
    return loadThreadState();
  }, [loadThreadState]);

  const patchCache = useRef<Map<string, string>>(new Map());
  const [patch, setPatch] = useState<string | null>(null);
  const [patchLoading, setPatchLoading] = useState(false);
  const [patchFailed, setPatchFailed] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const getItemKey = useCallback((i: number) => files?.[i]?.path ?? i, [files]);
  const virtualizer = useVirtualizer({
    count: files?.length ?? 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 36,
    overscan: 12,
    getItemKey,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(null);
    patchCache.current.clear();
    setPatch(null);
    invoke<PrFile[]>("pr_files", { path, number })
      .then((res) => {
        if (!cancelled) {
          setFiles(res);
          // Resume where the last review stopped, if that file is still part of the PR.
          const resume = memoryPositionRef.current;
          if (res.length > 0) setSelected(resume && res.some((f) => f.path === resume) ? resume : res[0].path);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          toastError(String(e));
          setFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number]);

  useEffect(() => {
    if (!selected) {
      setPatch(null);
      setPatchFailed(false);
      return;
    }
    const cached = patchCache.current.get(selected);
    if (cached !== undefined) {
      setPatch(cached);
      setPatchFailed(false);
      return;
    }
    const inline = files?.find((f) => f.path === selected)?.patch;
    if (inline !== undefined) {
      patchCache.current.set(selected, inline);
      setPatch(inline);
      setPatchFailed(false);
      return;
    }
    let cancelled = false;
    setPatchLoading(true);
    setPatchFailed(false);
    invoke<string>("pr_file_patch", {
      path,
      number,
      file: selected,
    })
      .then((text) => {
        if (cancelled) return;
        patchCache.current.set(selected, text);
        setPatch(text);
      })
      .catch((e) => {
        if (cancelled) return;
        toastError(String(e));
        setPatch(null);
        setPatchFailed(true);
      })
      .finally(() => {
        if (!cancelled) setPatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number, selected, files]);

  // Batch suggestions read expected lines only from the pinned base→head patch (never the cached unpinned one).
  const loadPinnedPatch = useCallback(
    (file: string) => invoke<string>("pr_file_patch", { path, number, file, expectedHeadSha: headSha, expectedBaseSha: baseSha }),
    [path, number, headSha, baseSha],
  );

  const activePath = selected ?? files?.[0]?.path ?? "";
  const parsedLines = useMemo(() => (patch ? parseUnifiedDiff(patch) : []), [patch]);
  const activeRange = rangeComposer?.file === activePath ? rangeComposer : null;
  const allInlineThreads = useMemo(
    () => groupInlineThreads(comments),
    [comments],
  );
  const fileThreads = useMemo(
    () => threadsForFile(allInlineThreads, activePath),
    [allInlineThreads, activePath],
  );
  const resolveByCommentId = useMemo(() => {
    const map = new Map<string, ThreadResolveState>();
    for (const thread of reviewThreads) {
      for (const commentId of thread.comment_ids) {
        map.set(commentId, {
          nodeId: thread.id,
          resolved: thread.resolved,
        });
      }
    }
    return map;
  }, [reviewThreads]);
  const draftLines = useMemo(
    () => draftsByLine(drafts, activePath),
    [drafts, activePath],
  );

  const threadRangeOf = useCallback((thread: (typeof fileThreads)[number]): ThreadRange | undefined => {
    if (!rangeCapable) return undefined;
    const nodeId = thread.comments.map((c) => resolveByCommentId.get(c.id)?.nodeId).find(Boolean);
    const meta = nodeId ? ghThreads.threads?.get(nodeId) : undefined;
    if (!meta) return undefined;
    if (meta.isOutdated || meta.line == null) return { line: thread.line, outdated: true };
    return { line: meta.line, side: meta.diffSide, ...(meta.startLine != null && meta.startLine < meta.line ? { startLine: meta.startLine, startSide: meta.startDiffSide ?? undefined } : {}) };
  }, [rangeCapable, resolveByCommentId, ghThreads.threads]);

  const { annotationsBySideLine, highlighted } = useMemo(() => {
    const groups = new Map<string, { threads: typeof fileThreads; drafts: typeof drafts; composer: boolean }>();
    const group = (k: string) => groups.get(k) ?? groups.set(k, { threads: [], drafts: [], composer: false }).get(k)!;
    const highlighted = new Set<string>();
    for (const thread of fileThreads) {
      const range = threadRangeOf(thread);
      group(sideLineKey(range?.side ?? "RIGHT", range?.line ?? thread.line)).threads.push(thread);
      if (range?.startLine !== undefined) for (const k of storedRangeKeys(range)) highlighted.add(k);
    }
    for (const [, list] of draftLines) for (const draft of list) {
      group(sideLineKey(draft.side ?? "RIGHT", draft.line)).drafts.push(draft);
      if (draft.startLine !== undefined) for (const k of storedRangeKeys(draft)) highlighted.add(k);
    }
    if (activeRange) {
      group(sideLineKey(activeRange.range.end.side, activeRange.range.end.line)).composer = true;
      for (const k of rangeKeys(parsedLines, activeRange.range)) highlighted.add(k);
    }
    if (composer) group(sideLineKey("RIGHT", composer.line)).composer = true;
    const key = draftKey(path, number);
    const map = new Map<string, ReactNode>();
    for (const [k, g] of groups) {
      map.set(
        k,
        <div className="flex flex-col gap-1.5">
          {g.threads.map((thread) => (
            <InlineThreadCard
              key={thread.id}
              thread={thread}
              repoPath={path}
              prNumber={number}
              canReply={canComment}
              applyEnabled={branchCheckedOut}
              applyDisabledHint={applyDisabledHint}
              resolveState={thread.comments
                .map((comment) => resolveByCommentId.get(comment.id))
                .find((state) => state !== undefined)}
              range={threadRangeOf(thread)}
              onReplied={loadComments}
              onResolved={loadThreadState}
            />
          ))}
          {g.drafts.map((draft) => (
            <InlineDraftCard
              key={draft.id}
              draft={draft}
              repoPath={path}
              applyEnabled={branchCheckedOut}
              applyDisabledHint={applyDisabledHint}
              onChange={(body) => updateDraft(key, draft.id, body)}
              onRemove={() => removeDraft(key, draft.id)}
            />
          ))}
          {g.composer && activeRange && (
            <div className="flex flex-col gap-1" data-testid="pr-range-composer">
              <span className="font-mono text-[0.625rem] text-muted-foreground" role="status">
                {activeRange.range.start.index === activeRange.range.end.index
                  ? t("prRanges.selectedOne", { line: `${activeRange.range.end.side === "LEFT" ? "-" : "+"}${activeRange.range.end.line}` })
                  : t("prRanges.selected", {
                      start: `${activeRange.range.start.side === "LEFT" ? "-" : "+"}${activeRange.range.start.line}`,
                      end: `${activeRange.range.end.side === "LEFT" ? "-" : "+"}${activeRange.range.end.line}`,
                    })}
                {" · "}{t("prRanges.extendHint")}
              </span>
              <InlineCommentComposer
                key={`range-composer-${activePath}`}
                lineText={rangeSuggestionText(parsedLines, activeRange.range)}
                initialBody={activeRange.body}
                onBodyChange={(body) => setRangeComposer((c) => (c ? { ...c, body } : c))}
                submitLabel={t("prReview.draftAdd")}
                onSubmit={(body) => {
                  addDraft(key, { filePath: activePath, ...rangeFields(activeRange.range), body, ...(headSha ? { commitId: headSha } : {}) });
                  setRangeComposer(null);
                }}
                onCancel={() => setRangeComposer(null)}
              />
            </div>
          )}
          {g.composer && composer && k === sideLineKey("RIGHT", composer.line) && (
            <InlineCommentComposer
              key={`composer-${activePath}-${composer.line}`}
              lineText={composer.text}
              submitLabel={t("prReview.draftAdd")}
              onSubmit={(body) => {
                addDraft(key, { filePath: activePath, line: composer.line, body });
                setComposer(null);
              }}
              onCancel={() => setComposer(null)}
            />
          )}
        </div>,
      );
    }
    return { annotationsBySideLine: map, highlighted };
  }, [
    fileThreads,
    threadRangeOf,
    draftLines,
    activeRange,
    parsedLines,
    composer,
    path,
    number,
    activePath,
    headSha,
    canComment,
    branchCheckedOut,
    applyDisabledHint,
    resolveByCommentId,
    loadComments,
    loadThreadState,
    addDraft,
    updateDraft,
    removeDraft,
    t,
  ]);

  // Non-GitHub providers keep the original new-line-only anchors.
  const annotationsByNewLine = useMemo(() => {
    if (rangeCapable) return undefined;
    const map = new Map<number, ReactNode>();
    for (const [k, node] of annotationsBySideLine) if (k.startsWith("RIGHT:")) map.set(Number(k.slice(6)), node);
    return map;
  }, [rangeCapable, annotationsBySideLine]);

  const handleRangeSelect = useCallback((anchor: DiffAnchor, extend: boolean) => {
    setRangeComposer((c) => {
      if (extend && c && c.file === activePath) {
        const range = buildRange(c.anchor, anchor);
        if (!range) {
          toastError(t("prRanges.invalid"));
          return c;
        }
        return { ...c, range };
      }
      return { file: activePath, anchor, range: { start: anchor, end: anchor }, body: c?.file === activePath ? c.body : "" };
    });
  }, [activePath, t]);

  const handleAddComment = useCallback(
    (anchor: { newLineNo: number; text: string }) =>
      setComposer({ line: anchor.newLineNo, text: anchor.text }),
    [],
  );

  if (loading && !files) {
    return (
      <div className="flex h-full items-center justify-center">
        <SpinIcon icon={Loader2} className="h-6 w-6 text-primary" />
      </div>
    );
  }
  if (!files || files.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <FileCode2 className="h-8 w-8 text-muted-foreground/40" />
        <span>{t("pr.noFiles")}</span>
      </div>
    );
  }

  const current = files.find((f) => f.path === selected) ?? files[0];
  const isLfsPatch = looksLikeLfsPointerText(patch);
  const showMedia =
    !patchLoading &&
    !patchFailed &&
    !!current &&
    (isLfsPatch || (!patch?.trim() && isImagePath(current.path))) &&
    (!!baseRef || !!headRef);

  return (
    <ResizablePanelGroup orientation="horizontal" id="pr-files-split">
      <ResizablePanel
        id="pr-files-list"
        defaultSize="35%"
        minSize="20%"
        maxSize="60%"
        className="min-h-0 flex flex-col bg-muted/10 border-r border-border/60"
      >
        {headSha && (memory.progress || memory.unavailable) && (
          <div className="shrink-0 border-b border-border/50 px-3 py-1.5 text-[0.625rem] text-muted-foreground" role="status">
            {memory.progress && t("prMemory.summary", { reviewed: memory.progress.reviewed.length, total: files.length })}
            {memory.progress && memory.progress.changed.length > 0 && <span className="ml-1.5 text-amber-500">{t("prMemory.changed", { count: memory.progress.changed.length })}</span>}
            {memory.progress && memory.hadPriorReview && memory.progress.unseen.length > 0 && <span className="ml-1.5 text-primary">{t("prMemory.new", { count: memory.progress.unseen.length })}</span>}
            {memory.unavailable && <span className="ml-1.5 text-amber-600">{t("prMemory.treeIncomplete")}</span>}
          </div>
        )}
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          <ul
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const f = files[vi.index];
              if (!f) return null;
              const status = STATUS_COLORS[f.status] ?? "text-muted-foreground";
              const active = f.path === current.path;
              return (
                <li
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="border-b border-border/40"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <ListRow
                    size="sm"
                    active={active}
                    onClick={() => selectFile(f.path)}
                    className="rounded-none px-3 py-2 cursor-pointer transition-colors"
                    title={f.path}
                  >
                    <span
                      className={`shrink-0 font-mono text-[0.6875rem] uppercase ${status}`}
                      title={f.status}
                    >
                      {f.status[0]?.toUpperCase() ?? "?"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem]">
                      {f.path}
                    </span>
                    <span className="shrink-0 font-mono text-[0.625rem] tabular-nums font-semibold">
                      <span className="text-emerald-400">+{f.additions}</span>{" "}
                      <span className="text-rose-400">-{f.deletions}</span>
                    </span>
                    {headSha && memory.ready && (
                      <ReviewedToggle
                        state={memory.statusOf(f.path)}
                        hadPrior={memory.hadPriorReview}
                        // Marking requires the full patch to have been rendered (not a truncated/omitted one).
                        renderable={f.patch !== undefined || patchCache.current.has(f.path)}
                        onToggle={() => memory.toggle(f.path)}
                      />
                    )}
                  </ListRow>
                </li>
              );
            })}
          </ul>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle className="bg-border/60 hover:bg-primary/30 transition-colors" />
      <ResizablePanel
        id="pr-files-diff"
        defaultSize="65%"
        minSize="30%"
        className="min-h-0 flex flex-col bg-background"
      >
        {headSha && current && <PrPermalinkButton path={path} sha={headSha} file={current.path} removed={current.status === "removed"} />}
        {rangeCapable && headSha && baseSha && (
          <div className="flex shrink-0 justify-end px-2 py-1">
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                ghThreads.reload();
                setBatchOpen(true);
              }}
            >
              <Lightbulb className="h-3 w-3" />
              {t("suggestionBatch.open")}
            </button>
            <SuggestionBatchDialog
              open={batchOpen}
              onOpenChange={setBatchOpen}
              path={path}
              headSha={headSha}
              headRef={headRef ?? ""}
              branchCheckedOut={branchCheckedOut}
              threads={batchOpen ? ghThreads.threads : null}
              threadsTruncated={ghThreads.truncated}
              loadPatch={loadPinnedPatch}
            />
          </div>
        )}
        {showMedia && current ? (
          <MediaDiffPanel
            key={current.path}
            repoPath={path}
            filePath={current.path}
            beforeTreeish={refCandidates(baseRef, true)}
            afterTreeish={refCandidates(headRef, false)}
            beforeLabel={t("media.sidePrBase")}
            afterLabel={t("media.sidePrHead")}
            checkLfs={isLfsPatch}
          />
        ) : (
          <UnifiedDiffBody
            loading={patchLoading}
            failed={patchFailed}
            isBinary={false}
            unifiedText={patch ?? ""}
            untrackedPlain={null}
            emptyHint={
              patch
                ? ""
                : t("pr.noDiffLarge")
            }
            failedHint={t("diff.diffLoadFailedFallback")}
            annotationsByNewLine={annotationsByNewLine}
            onAddComment={canComment && !rangeCapable ? handleAddComment : undefined}
            addCommentTitle={t("prReview.addCommentTitle")}
            commentRange={rangeCapable ? {
              annotations: annotationsBySideLine,
              highlighted,
              onSelect: canComment ? handleRangeSelect : () => {},
              title: t("prRanges.addTitle"),
            } : undefined}
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function ReviewedToggle({ state, hadPrior, renderable, onToggle }: { state: "reviewed" | "changed" | "unseen" | "unavailable" | null; hadPrior: boolean; renderable: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const on = state === "reviewed";
  const blocked = state === "unavailable" || (!on && !renderable);
  const label = state === "unavailable" ? t("prMemory.unavailable") : blocked ? t("prMemory.openFirst") : on ? t("prMemory.unmark") : t("prMemory.mark");
  return (
    <span className="flex shrink-0 items-center gap-1">
      {state === "changed" && <span className="text-[0.5625rem] font-semibold text-amber-500">{t("prMemory.changedBadge")}</span>}
      {state === "unseen" && hadPrior && <span className="text-[0.5625rem] font-semibold text-primary">{t("prMemory.newBadge")}</span>}
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        aria-label={label}
        title={label}
        disabled={blocked}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
      >
        {on ? <CheckSquare className="h-3.5 w-3.5 text-emerald-500" /> : <Square className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

/** Suggestion seed: real new-side text of the range; old-side-only selections get an empty block. */
function rangeSuggestionText(lines: ReturnType<typeof parseUnifiedDiff>, range: DiffRange): string {
  const { start, end } = range;
  if (end.side === "LEFT") return "";
  const from = start.side === "RIGHT" ? start.line : end.line;
  return headLinesFromPatch(lines, from, end.line)?.join("\n") ?? end.text;
}
