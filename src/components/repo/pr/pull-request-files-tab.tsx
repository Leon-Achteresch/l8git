import { ListRow } from "@/components/ui/list-row";
import { UnifiedDiffBody } from "@/components/repo/commit/unified-diff-body";
import { MediaDiffPanel } from "@/components/repo/media/media-diff-panel";
import { isImagePath, looksLikeLfsPointerText } from "@/lib/media";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { toastError } from "@/lib/error-toast";
import {
  draftKey,
  draftsByLine,
  useReviewDraftStore,
  useReviewDrafts,
} from "@/lib/pr-review-drafts";
import { usePrCapabilities } from "@/lib/pr-provider-store";
import {
  groupInlineThreads,
  threadsByLine,
  threadsForFile,
  type PrComment,
} from "@/lib/pr-threads";
import { useRepoStore } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
import { SpinIcon } from "@/components/motion/kit";

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
  added: "text-git-added",
  modified: "text-git-modified",
  removed: "text-git-removed",
  renamed: "text-git-modified",
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
    estimateSize: () => 30,
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
      setPatchLoading(false);
      return;
    }
    let cancelled = false;
    setPatchLoading(true);
    setPatchFailed(false);
    invoke<string | null>("pr_file_patch", {
      path,
      number,
      file: selected,
    })
      .then((res) => {
        if (cancelled) return;
        const value = res ?? "";
        patchCache.current.set(selected, value);
        setPatch(value);
      })
      .catch((e) => {
        if (cancelled) return;
        toastError(String(e));
        setPatchFailed(true);
        setPatch(null);
      })
      .finally(() => {
        if (!cancelled) setPatchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, number, selected]);

  useEffect(() => {
    setComposer(null);
  }, [selected]);

  const activePath = selected ?? files?.[0]?.path ?? "";

  const threads = useMemo(
    () => threadsForFile(groupInlineThreads(comments), activePath),
    [comments, activePath],
  );
  const threadLines = useMemo(() => threadsByLine(threads), [threads]);

  const resolveByCommentId = useMemo(() => {
    const map = new Map<string, ThreadResolveState>();
    for (const entry of reviewThreads) {
      for (const commentId of entry.comment_ids) {
        map.set(commentId, { nodeId: entry.id, resolved: entry.resolved });
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
        <SpinIcon icon={Loader2} className="h-6 w-6 text-primary/50" />
      </div>
    );
  }
  if (!files || files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t("pr.noFiles")}
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
        className="min-h-0 flex flex-col"
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
                  className="border-b border-border/50"
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
                    className="rounded-none px-3"
                    title={f.path}
                  >
                    <span
                      className={`shrink-0 font-mono uppercase ${status}`}
                      title={f.status}
                    >
                      {f.status[0]?.toUpperCase() ?? "?"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {f.path}
                    </span>
                    <span className="shrink-0 text-[10px] tabular-nums">
                      <span className="text-git-added">+{f.additions}</span>{" "}
                      <span className="text-git-removed">-{f.deletions}</span>
                    </span>
                  </ListRow>
                </li>
              );
            })}
          </ul>
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle className="bg-border/50" />
      <ResizablePanel
        id="pr-files-diff"
        defaultSize="65%"
        minSize="30%"
        className="min-h-0 flex flex-col"
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
            filePath={current.path}
            annotationsByNewLine={annotationsByNewLine}
            onAddComment={canComment ? handleAddComment : undefined}
            addCommentTitle={t("prReview.addCommentTitle")}
          />
        )}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
