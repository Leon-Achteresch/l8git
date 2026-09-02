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
  threadsByLine,
  threadsForFile,
  type PrComment,
} from "@/lib/pr-threads";
import { useRepoStore } from "@/lib/repo-store";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { FileCode2, Loader2 } from "lucide-react";
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
  type ThreadResolveState,
} from "./pull-request-inline-comments";

type GhReviewThread = {
  id: string;
  resolved: boolean;
  comment_ids: string[];
};

type PrFile = {
  path: string;
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
}: {
  path: string;
  number: number;
  baseRef?: string;
  headRef?: string;
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

  const caps = usePrCapabilities(path);
  const currentBranch = useRepoStore((s) => s.repos[path]?.branch ?? "");
  const drafts = useReviewDrafts(path, number);
  const addDraft = useReviewDraftStore((s) => s.addDraft);
  const updateDraft = useReviewDraftStore((s) => s.updateDraft);
  const removeDraft = useReviewDraftStore((s) => s.removeDraft);

  const canComment = caps?.can_inline_comments ?? false;
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
  const virtualizer = useVirtualizer({
    count: files?.length ?? 0,
    getScrollElement: () => listRef.current,
    estimateSize: () => 36,
    overscan: 12,
    getItemKey: (i) => files?.[i]?.path ?? i,
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
          if (res.length > 0) setSelected(res[0].path);
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

  const activePath = selected ?? files?.[0]?.path ?? "";
  const allInlineThreads = useMemo(
    () => groupInlineThreads(comments),
    [comments],
  );
  const fileThreads = useMemo(
    () => threadsForFile(allInlineThreads, activePath),
    [allInlineThreads, activePath],
  );
  const threadLines = useMemo(
    () => threadsByLine(fileThreads),
    [fileThreads],
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

  const annotationsByNewLine = useMemo(() => {
    const map = new Map<number, ReactNode>();
    const lines = new Set<number>([...threadLines.keys(), ...draftLines.keys()]);
    if (composer) lines.add(composer.line);
    const key = draftKey(path, number);
    for (const line of lines) {
      map.set(
        line,
        <div className="flex flex-col gap-1.5">
          {(threadLines.get(line) ?? []).map((thread) => (
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
              onReplied={loadComments}
              onResolved={loadThreadState}
            />
          ))}
          {(draftLines.get(line) ?? []).map((draft) => (
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
          {composer?.line === line && (
            <InlineCommentComposer
              key={`composer-${activePath}-${line}`}
              lineText={composer.text}
              submitLabel={t("prReview.draftAdd")}
              onSubmit={(body) => {
                addDraft(key, { filePath: activePath, line, body });
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
    threadLines,
    draftLines,
    composer,
    path,
    number,
    activePath,
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
        <div ref={listRef} className="h-full overflow-y-auto">
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
                    onClick={() => setSelected(f.path)}
                    className="rounded-none px-3 py-2 cursor-pointer transition-colors"
                    title={f.path}
                  >
                    <span
                      className={`shrink-0 font-mono text-[11px] uppercase ${status}`}
                      title={f.status}
                    >
                      {f.status[0]?.toUpperCase() ?? "?"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                      {f.path}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums font-semibold">
                      <span className="text-emerald-400">+{f.additions}</span>{" "}
                      <span className="text-rose-400">-{f.deletions}</span>
                    </span>
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
            onAddComment={canComment ? handleAddComment : undefined}
            addCommentTitle={t("prReview.addCommentTitle")}
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
