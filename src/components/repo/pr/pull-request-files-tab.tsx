import { Screenshot } from "./pr-screenshot";
import { resolveReviewImage } from "@/lib/pr-screenshot";
import { isHubPath } from "@/lib/hub/store";
import { SpinIcon } from "@/components/motion/kit";
import { UnifiedDiffBody } from "@/components/repo/commit/unified-diff-body";
import { MediaDiffPanel } from "@/components/repo/media/media-diff-panel";
import { FileFilterInput } from "@/components/repo/file-filter-input";
import { filterChangedFiles } from "@/lib/file-path-filter";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/ui/list-row";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toastError, translateKnownError } from "@/lib/error-toast";
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
import { buildRange, headLinesFromPatch, indexReviewedRanges, rangeFields, sideLineKey, type DiffAnchor, type DiffRange } from "@/lib/github-ui/diff-ranges";
import { useReviewThreadIndex } from "@/lib/github-ui/review-threads";
import { applySuggestionToContent } from "@/lib/pr-suggestions";
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
  type ApplyLocalSuggestion,
  type ThreadRange,
  type ThreadResolveState,
} from "./pull-request-inline-comments";

type GhReviewThread = {
  id: string;
  resolved: boolean;
  comment_ids: string[];
};

type PrFile = {
  raw_url?: string;
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

type PullRequestFilesProps = {
  path: string;
  number: number;
  prUrl?: string;
  baseRef?: string;
  headRef?: string;
  /** Pinned head commit; enables persistent review memory and permalinks. */
  headSha?: string;
  /** Pinned base commit (when known) for files the provider sent without a patch. */
  baseSha?: string;
};

export function PullRequestFilesTab(props: PullRequestFilesProps) {
  const { path, number, baseSha, headSha } = props;
  return <PullRequestFiles key={JSON.stringify([path, number, baseSha, headSha])} {...props} />;
}

function PullRequestFiles({
  path, number, prUrl, baseRef, headRef, headSha, baseSha,
}: PullRequestFilesProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<PrFile[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listAttempt, setListAttempt] = useState(0);
  const [patchAttempt, setPatchAttempt] = useState(0);
  const [fileQuery, setFileQuery] = useState("");
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

  const patchCache = useRef<Map<string, string | null>>(new Map());
  const [patchState, setPatchState] = useState({
    key: "", text: null as string | null, failed: false,
  });

  const listRef = useRef<HTMLDivElement>(null);
  const visibleFiles = useMemo(() => filterChangedFiles(files ?? [], fileQuery), [files, fileQuery]);
  const getItemKey = useCallback((i: number) => visibleFiles[i]?.path ?? i, [visibleFiles]);
  const virtualizer = useVirtualizer({
    count: visibleFiles.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 36,
    overscan: 12,
    getItemKey,
  });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setListError(null);
    setFiles(null);
    setSelected(null);
    setFileQuery("");
    patchCache.current.clear();
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
          setListError(translateKnownError(String(e)));
          setFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number, baseSha, headSha, listAttempt]);

  const current = useMemo(() => files?.find((f) => f.path === selected) ?? files?.[0], [files, selected]);
  const hostedImage = current && isHubPath(path) && isImagePath(current.path) && resolveReviewImage(
    current.raw_url || "./" + current.path.split("/").map(encodeURIComponent).join("/"),
    prUrl, current.status === "removed" ? baseSha : headSha,
  );

  const patchKey = JSON.stringify([path, number, headSha, baseSha, selected, patchAttempt, listAttempt]);
  const inline = current?.patch;
  const loaded = patchState.key === patchKey;
  const cached = selected ? patchCache.current.get(selected) : undefined;
  const patch = inline ?? cached ?? (loaded ? patchState.text : null);
  const patchLoading = !!selected && !hostedImage && inline == null && cached === undefined && !loaded;
  const patchFailed = loaded && patchState.failed;
  useEffect(() => {
    if (!selected || hostedImage || patchCache.current.has(selected)) return;
    if (inline != null) {
      patchCache.current.set(selected, inline);
      return;
    }
    let cancelled = false;
    invoke<string | null>("pr_file_patch", {
      path,
      number,
      file: selected,
    })
      .then((text) => {
        if (cancelled) return;
        patchCache.current.set(selected, text);
        setPatchState({ key: patchKey, text, failed: false });
      })
      .catch((e) => {
        if (cancelled) return;
        toastError(String(e));
        setPatchState({ key: patchKey, text: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [path, number, selected, inline, hostedImage, patchKey]);

  // Batch suggestions read expected lines only from the pinned base→head patch (never the cached unpinned one).
  const loadPinnedPatch = useCallback(
    (file: string) => invoke<string | null>("pr_file_patch", { path, number, file, expectedHeadSha: headSha, expectedBaseSha: baseSha }),
    [path, number, headSha, baseSha],
  );

  const activePath = selected ?? files?.[0]?.path ?? "";
  const parsedLines = useMemo(() => (patch ? parseUnifiedDiff(patch) : []), [patch]);
  const applyLocal = useCallback<ApplyLocalSuggestion>(async (file, startLine, endLine, replacement) => {
    const pinnedPatch = headSha && baseSha && (caps?.provider === "github" || caps?.provider === "gitea");
    const review = parseUnifiedDiff((pinnedPatch ? await loadPinnedPatch(file) : patchCache.current.get(file)) ?? "");
    const expectedLines = headLinesFromPatch(review, startLine, endLine);
    if (!expectedLines) throw new Error(t("prReview.suggestionChanged", { file }));
    const before = await invoke<string>("repo_read_file", { path, file });
    const next = applySuggestionToContent(before, endLine, replacement, startLine, expectedLines);
    if (next === null) throw new Error(t("prReview.suggestionChanged", { file }));
    await invoke("repo_write_file", { path, file, content: next, expected: { content: before, head: headSha, branch: headRef } });
    await useRepoStore.getState().reloadStatus(path);
  }, [path, headSha, baseSha, headRef, caps?.provider, loadPinnedPatch, t]);

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

  const selectedRange = activeRange?.range;
  const suggestedText = useMemo(() => selectedRange ? rangeSuggestionText(parsedLines, selectedRange) : "", [parsedLines, selectedRange]);
  const isReviewed = useMemo(() => {
    const ranges: ThreadRange[] = [];
    for (const thread of fileThreads) {
      const range = threadRangeOf(thread);
      if (range?.startLine !== undefined) ranges.push(range);
    }
    for (const entries of draftLines.values()) {
      for (const draft of entries) if (draft.startLine !== undefined) ranges.push(draft);
    }
    return indexReviewedRanges(ranges);
  }, [fileThreads, threadRangeOf, draftLines]);
  const isHighlighted = useCallback((anchor: DiffAnchor) =>
    (!!selectedRange && selectedRange.start.index <= anchor.index && anchor.index <= selectedRange.end.index)
    || isReviewed(anchor.side, anchor.line), [selectedRange, isReviewed]);

  const annotationsBySideLine = useMemo(() => {
    const groups = new Map<string, { threads: typeof fileThreads; drafts: typeof drafts; composer: boolean }>();
    const group = (k: string) => groups.get(k) ?? groups.set(k, { threads: [], drafts: [], composer: false }).get(k)!;
    for (const thread of fileThreads) {
      const range = threadRangeOf(thread);
      group(sideLineKey(range?.side ?? "RIGHT", range?.line ?? thread.line)).threads.push(thread);
    }
    for (const [, list] of draftLines) for (const draft of list) {
      group(sideLineKey(draft.side ?? "RIGHT", draft.line)).drafts.push(draft);
    }
    if (activeRange) {
      group(sideLineKey(activeRange.range.end.side, activeRange.range.end.line)).composer = true;
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
              applyLocal={applyLocal}
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
              applyLocal={applyLocal}
              applyEnabled={branchCheckedOut && !(draft.commitId && headSha && draft.commitId !== headSha)}
              applyDisabledHint={draft.commitId && headSha && draft.commitId !== headSha ? t("prRanges.applyOutdated") : applyDisabledHint}
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
                lineText={suggestedText}
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
    return map;
  }, [
    fileThreads,
    threadRangeOf,
    draftLines,
    activeRange,
    suggestedText,
    composer,
    path,
    number,
    activePath,
    headSha,
    canComment,
    branchCheckedOut,
    applyLocal,
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
  if (listError !== null) {
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm">
        <span>{t("pr.filesLoadFailed")}</span>
        <span className="break-all text-xs text-muted-foreground">{listError}</span>
        <Button size="sm" variant="outline" onClick={() => setListAttempt(attempt => attempt + 1)}>{t("common.retry")}</Button>
      </div>
    );
  }
  if (!files || !current) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <FileCode2 className="h-8 w-8 text-muted-foreground/40" />
        <span>{t("pr.noFiles")}</span>
      </div>
    );
  }

  const isLfsPatch = looksLikeLfsPointerText(patch);
  const showMedia =
    !patchLoading &&
    !patchFailed &&
    !!current &&
    (isLfsPatch || (!patch?.trim() && isImagePath(current.path))) &&
    (!!baseRef || !!headRef || !!headSha);

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
        <div className="flex items-center gap-2 border-b border-border/50 px-2 py-1.5">
          <FileFilterInput className="min-w-0 flex-1" value={fileQuery} onChange={value => {
            setFileQuery(value);
            if (listRef.current) listRef.current.scrollTop = 0;
          }} onPickFirstMatch={() => {
            if (visibleFiles[0]) selectFile(visibleFiles[0].path);
          }} />
          {fileQuery.trim() && <span role="status" className="shrink-0 text-xs tabular-nums text-muted-foreground">{visibleFiles.length}/{files.length}</span>}
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {visibleFiles.length === 0 && <p className="px-3 py-4 text-xs text-muted-foreground">{t("commitPanel.noMatchesTitle")}</p>}
          <ul
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const f = visibleFiles[vi.index];
              if (!f) return null;
              const status = STATUS_COLORS[f.status] ?? "text-muted-foreground";
              const active = f.path === current.path;
              return (
                <li
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="flex items-center gap-1 border-b border-border/40 pr-2"
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
                    aria-current={active ? "true" : undefined}
                    onClick={() => selectFile(f.path)}
                    className="w-auto min-w-0 flex-1 cursor-pointer rounded-none px-3 py-2 transition-colors"
                    title={f.previous_path ? `${f.previous_path} → ${f.path}` : f.path}
                  >
                    <span
                      className={`shrink-0 font-mono text-[0.6875rem] uppercase ${status}`}
                      title={f.status}
                    >
                      {f.status[0]?.toUpperCase() ?? "?"}
                    </span>
                    <span className="min-w-0 flex-1 font-mono text-[0.75rem]">
                      <span className="block truncate">{f.path}</span>
                      {f.previous_path && <span className="block truncate text-[0.625rem] font-normal text-muted-foreground">{t("pr.previousPath", { path: f.previous_path })}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-[0.625rem] tabular-nums font-semibold">
                      <span className="text-emerald-400">+{f.additions}</span>{" "}
                      <span className="text-rose-400">-{f.deletions}</span>
                    </span>
                  </ListRow>
                  {headSha && memory.ready && (
                    <ReviewedToggle
                      state={memory.statusOf(f.path)}
                      hadPrior={memory.hadPriorReview}
                      // Marking requires the full patch to have been rendered (not a truncated/omitted one).
                      patch={f.patch ?? patchCache.current.get(f.path)}
                      onToggle={() => memory.toggle(f.path)}
                    />
                  )}
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
        {patchFailed && <div className="flex justify-end px-2 py-1">
          <Button size="sm" variant="outline" onClick={() => setPatchAttempt(attempt => attempt + 1)}>{t("common.retry")}</Button>
        </div>}
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
        {hostedImage ? (
          <div className="overflow-auto p-4"><Screenshot key={hostedImage} src={hostedImage} alt={current.path} target={{ path, number, onPosted: loadComments }} /></div>
        ) : showMedia && current ? (
          <MediaDiffPanel
            key={current.path}
            repoPath={path}
            filePath={current.path}
            beforeFilePath={current.previous_path ?? current.path}
            beforeTreeish={current.status === "added" ? [] : baseSha || refCandidates(baseRef, true)}
            afterTreeish={current.status === "removed" ? [] : headSha || refCandidates(headRef, false)}
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
              isHighlighted,
              onSelect: canComment ? handleRangeSelect : () => {},
              title: t("prRanges.addTitle"),
            } : undefined}
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function ReviewedToggle({ state, hadPrior, patch, onToggle }: { state: "reviewed" | "changed" | "unseen" | "unavailable" | null; hadPrior: boolean; patch: string | null | undefined; onToggle: () => void }) {
  const { t } = useTranslation();
  const on = state === "reviewed";
  const blocked = state === "unavailable" || (!on && !patch);
  const label = state === "unavailable" ? t("prMemory.unavailable") : blocked ? t(patch === undefined ? "prMemory.openFirst" : "pr.noDiffLarge") : on ? t("prMemory.unmark") : t("prMemory.mark");
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
        onClick={onToggle}
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
