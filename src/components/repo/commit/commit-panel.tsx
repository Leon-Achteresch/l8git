import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { StashCreateDialog } from "@/components/repo/stash/stash-create-dialog";
import { GitBlameSheet } from "@/components/repo/blame/git-blame-sheet";
import { getCommitMessageTemplate, useCommitPrefs } from "@/lib/commit-prefs";
import { useCommitMessagePrefs } from "@/lib/commit-message-prefs";
import { commitPreflight, joinCommitMessage, splitCommitMessage } from "@/lib/commit-message";
import { readCommitHead } from "@/lib/commit-message-preflight";
import { createCommitDraftStream, EmptyGeneratedCommitDraft, generateFreshCommitDraft, StagedCommitContextChanged } from "@/lib/commit-ai-draft";
import { useRepoPrefs } from "@/lib/repo-prefs";
import { toastError, translateKnownError } from "@/lib/error-toast";
import { captureDiscardDiffs, changedDiscardContents, changedDiscardPaths, discardPlanGroups, discardPlanVerified, makeDiscardPlan, refreshDiscardPlan, rowStagingAction, visibleSelectionRange, type DiscardPlan } from "@/lib/commit-actions";
import { CommitDiscardDialog } from "./commit-discard-dialog";
import { loadSigningInfo, type SigningInfo } from "@/lib/git-signing";
import { useRepoStore, type StatusEntry } from "@/lib/repo-store";
import { useSigningRevision } from "@/lib/signing-store";
import { writeLocalStorageDebounced } from "@/lib/utils";
import { useContainerSize } from "@/hooks/use-container-size";
import { COMMIT_PANEL_LAYOUT_KEYS, DEFAULT_COMMIT_PANEL_LAYOUTS, commitPanelLayoutToPersist, commitPanelOrientation, readCommitPanelLayout, workspaceScale, type CommitPanelOrientation } from "@/lib/responsive-workspace";
import { useWorkspacePrefs } from "@/lib/workspace-prefs";
import type { GroupImperativeHandle } from "react-resizable-panels";
import { parseDiffWithHunks, type ParsedDiff } from "@/lib/unified-diff";
import { useCommitPanelHotkeys } from "@/lib/use-commit-panel-hotkeys";
import { applyReviewedHunks, captureReviewedHunks, type ReviewedHunkAction, type ReviewedHunks } from "@/lib/reviewed-hunks";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DiffViewer } from "./commit-panel-diff-viewer";
import { VirtualFileList } from "./commit-panel-file-list";
import { MergeStatusBanner } from "@/components/repo/merge/merge-status-banner";
import { RebaseStatusBanner } from "@/components/repo/rebase/rebase-status-banner";
import { CommitPanelConflictPlaceholder } from "@/components/repo/commit/commit-panel-conflict-placeholder";
import { CommitComposer } from "@/components/repo/commit/commit-composer";
import {
  buildChangeRows,
  type ChangeRow,
  type FileDiffResponse,
} from "./commit-panel-types";
import { generateAiCommitMessage } from "@/lib/ai-commit";
import { AiError } from "@/lib/ai/core";
import { AiResultActions } from "@/components/ai/ai-result-actions";
import { isAiConfigured } from "@/lib/ai-setup";
import { AiSetupDialog } from "@/components/onboarding/ai-setup-dialog";
import { CommitSplitDialog } from "@/components/repo/commit/commit-split-dialog";
import { useTranslation } from "react-i18next";
import { isPreviewRepo } from "@/lib/preview-repo";

const EMPTY_STATUS: StatusEntry[] = [];
const EMPTY_LINES: ReadonlySet<string> = new Set();

export function CommitPanel() {
  const { t } = useTranslation();
  const activePath = useRepoStore((s) => s.activePath);
  const entries =
    useRepoStore((s) => (activePath ? s.status[activePath] : undefined)) ?? EMPTY_STATUS;
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const stageFiles = useRepoStore((s) => s.stageFiles);
  const unstageFiles = useRepoStore((s) => s.unstageFiles);
  const commitChanges = useRepoStore((s) => s.commitChanges);
  const amendCommit = useRepoStore((s) => s.amendCommit);
  const latestCommit = useRepoStore((s) => (activePath ? s.repos[activePath]?.commits[0] : undefined));
  const currentBranch = useRepoStore((s) => activePath ? (s.repos[activePath]?.branch ?? null) : null);
  const aheadCount = useRepoStore((s) => activePath ? (s.upstreamSync[activePath]?.ahead ?? 0) : 0);
  const hasUpstream = useRepoStore((s) => activePath ? (s.hasUpstream[activePath] !== false) : false);
  const gitReset = useRepoStore((s) => s.gitReset);

  const diffViewMode = useCommitPrefs((s) => s.diffViewMode);
  const setDiffViewMode = useCommitPrefs((s) => s.setDiffViewMode);

  const globalAiLanguage = useCommitPrefs((s) => s.aiOutputLanguage);
  const repoAiLanguage = useRepoPrefs((s) => activePath ? s.getAiOutputLanguage(activePath) : undefined);
  const setRepoAiLanguage = useRepoPrefs((s) => s.setAiOutputLanguage);
  const effectiveLanguage = repoAiLanguage ?? globalAiLanguage;

  const draft = useCommitMessagePrefs((s) => activePath ? s.drafts[activePath] : undefined);
  const [aiPreview, setAiPreview] = useState<{ path: string; message: string } | null>(null);
  const message = aiPreview?.path === activePath ? aiPreview.message : draft?.message ?? "";
  const amendMode = !!draft?.amend;
  const setMessage = useCallback((value: string | ((previous: string) => string)) => {
    if (activePath) useCommitMessagePrefs.getState().setMessage(activePath, value);
  }, [activePath]);
  const [draftsReady, setDraftsReady] = useState(useCommitMessagePrefs.persist.hasHydrated());
  const [committing, setCommitting] = useState(false);
  const committingRef = useRef(false);
  const [amendLoading, setAmendLoading] = useState(false);
  const [publishedAmendOpen, setPublishedAmendOpen] = useState(false);
  const [commitErrorState, setCommitErrorState] = useState<{ path: string; message: string } | null>(null);
  const commitError = commitErrorState?.path === activePath ? commitErrorState.message : null;
  const setCommitError = useCallback((error: string | null) => {
    setCommitErrorState(error && activePath ? { path: activePath, message: error } : null);
  }, [activePath]);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResultShown, setAiResultShown] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiStreamRef = useRef<ReturnType<typeof createCommitDraftStream> | null>(null);
  const aiPreviousMessageRef = useRef<{ path: string; message: string; controller: AbortController; resultShown: boolean } | null>(null);
  const [aiSetupOpen, setAiSetupOpen] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const aiReady = useCommitPrefs(() => isAiConfigured());
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [blameTarget, setBlameTarget] = useState<string | null>(null);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [undoTarget, setUndoTarget] = useState<{ hash: string; commitMessage: string; path: string } | null>(null);
  const [signingInfo, setSigningInfo] = useState<SigningInfo | null>(null);
  const signingRevision = useSigningRevision((s) => s.revision);

  const [anchorRowId, setAnchorRowId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<ReadonlySet<string>>(new Set<string>());
  const [discardDialog, setDiscardDialog] = useState<DiscardPlan | null>(null);
  const [discardPending, setDiscardPending] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const discardPendingRef = useRef(false);

  const [diffPayloadState, setDiffPayloadState] = useState<{ key: string; payload: FileDiffResponse } | null>(null);
  const [diffLoadingState, setDiffLoading] = useState(false);
  const [diffFailureKey, setDiffFailureKey] = useState<string | null>(null);
  const diffRequestRef = useRef(0);
  const hunkPendingRef = useRef(false);
  const [hunkPending, setHunkPending] = useState(false);
  const [focusedHunkIdx, setFocusedHunkIdx] = useState(-1);
  const [selectedLines, setSelectedLines] = useState<ReadonlySet<string>>(EMPTY_LINES);
  const [discardLinesDialog, setDiscardLinesDialog] = useState<{ plan: ReviewedHunks; count: number } | null>(null);

  const { subject, body } = splitCommitMessage(message);
  const subjectLen = Array.from(subject).length;

  const handleSubjectChange = useCallback((val: string) => {
    setMessage((previous) => joinCommitMessage(val, splitCommitMessage(previous).body));
  }, [setMessage]);

  const handleBodyChange = useCallback((val: string) => {
    setMessage((previous) => joinCommitMessage(splitCommitMessage(previous).subject, val));
  }, [setMessage]);

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const splitSize = useContainerSize(splitContainerRef);
  const uiScale = workspaceScale(useWorkspacePrefs((s) => s.uiScale));
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const orientationRef = useRef<CommitPanelOrientation>("horizontal");
  const orientation = commitPanelOrientation(splitSize.width, uiScale, orientationRef.current);
  const [layouts] = useState(() => {
    const read = (direction: CommitPanelOrientation) => {
      try { return readCommitPanelLayout(localStorage.getItem(COMMIT_PANEL_LAYOUT_KEYS[direction])) ?? DEFAULT_COMMIT_PANEL_LAYOUTS[direction]; }
      catch { return DEFAULT_COMMIT_PANEL_LAYOUTS[direction]; }
    };
    return { horizontal: read("horizontal"), vertical: read("vertical") };
  });
  // Keep the same panel instances: filters, scroll positions, selected hunks and the editor survive resizing.
  useLayoutEffect(() => {
    orientationRef.current = orientation;
    groupRef.current?.setLayout(layouts[orientation]);
  }, [orientation, layouts, splitSize.width, splitSize.height, uiScale]);

  const seedMessageFromTemplate = useCallback(() => {
    if (!activePath || !useCommitPrefs.persist.hasHydrated() || !useCommitMessagePrefs.persist.hasHydrated()) return;
    const raw = getCommitMessageTemplate();
    useCommitMessagePrefs.getState().seedDraft(activePath, raw);
  }, [activePath]);

  useEffect(() => {
    const run = () => {
      setDraftsReady(useCommitMessagePrefs.persist.hasHydrated());
      seedMessageFromTemplate();
    };
    run();
    const stopTemplates = useCommitPrefs.persist.onFinishHydration(run);
    const stopDrafts = useCommitMessagePrefs.persist.onFinishHydration(run);
    return () => { stopTemplates(); stopDrafts(); };
  }, [activePath, seedMessageFromTemplate]);

  useEffect(() => {
    setAiResultShown(false);
    setAiGenerating(false);
    setAiPreview(null);
    setPublishedAmendOpen(false);
    setUndoDialogOpen(false);
    setUndoTarget(null);
    setDiscardDialog(null);
    setDiscardLinesDialog(null);
    setDiscardError(null);
    setSelectedRowId(null);
    setAnchorRowId(null);
    setMultiSelectedIds(new Set());
    setCommitError(null);
    return () => {
      aiAbortRef.current?.abort();
      aiStreamRef.current?.cancel();
      aiStreamRef.current = null;
      const previous = aiPreviousMessageRef.current;
      if (previous) useCommitMessagePrefs.getState().cancelAiDraft(previous.path);
      aiPreviousMessageRef.current = null;
      aiAbortRef.current = null;
    };
  }, [activePath]);

  useEffect(() => setCommitError(null), [message]);

  useEffect(() => {
    if (!activePath) {
      setSigningInfo(null);
      return;
    }
    let alive = true;
    setSigningInfo(null);
    void loadSigningInfo(activePath)
      .then((info) => {
        if (alive) setSigningInfo(info);
      })
      .catch(() => {
        if (alive) setSigningInfo(null);
      });
    return () => {
      alive = false;
    };
  }, [activePath, signingRevision]);

  useEffect(() => {
    let prev = useCommitPrefs.getState().messageTemplate;
    return useCommitPrefs.subscribe((s) => {
      if (s.messageTemplate === prev) return;
      prev = s.messageTemplate;
      const raw = s.messageTemplate;
      if (!raw.trim()) return;
      if (activePath && !useCommitMessagePrefs.getState().drafts[activePath]?.amend) {
        setMessage((m) => (m.trim() === "" ? raw : m));
      }
    });
  }, [activePath, setMessage]);

  const changeRows = useMemo(() => buildChangeRows(entries), [entries]);
  const conflictRows = useMemo(() => changeRows.filter((r) => r.sector === "conflict"), [changeRows]);
  const stagedRows = useMemo(() => changeRows.filter((r) => r.sector === "staged"), [changeRows]);
  const unstagedRows = useMemo(
    () => changeRows.filter((r) => r.sector === "unstaged"),
    [changeRows],
  );

  useEffect(() => {
    if (changeRows.length === 0) {
      setSelectedRowId(null);
      return;
    }
    setSelectedRowId((prev) =>
      prev && changeRows.some((r) => r.id === prev) ? prev : changeRows[0].id,
    );
    setAnchorRowId((prev) =>
      prev && changeRows.some((r) => r.id === prev) ? prev : changeRows[0].id,
    );
    setMultiSelectedIds((prev) => {
      if (prev.size === 0) return new Set([changeRows[0].id]);
      return prev;
    });
  }, [changeRows]);

  useEffect(() => {
    const validIds = new Set(changeRows.map((r) => r.id));
    setMultiSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setAnchorRowId((prev) => (prev && validIds.has(prev) ? prev : null));
  }, [changeRows]);

  const selectedRow = useMemo(
    () => changeRows.find((r) => r.id === selectedRowId) ?? null,
    [changeRows, selectedRowId],
  );

  const selectedPath = selectedRow?.path ?? null;
  const selectedBinary = !!selectedRow?.entry.binary;
  const selectedIsConflict = selectedRow?.sector === "conflict";
  const selectedUntracked = !!selectedRow?.entry.untracked;
  const selectedSector = selectedRow?.sector ?? null;
  const selectedSignature = selectedRow
    ? [
        selectedRow.entry.index_status,
        selectedRow.entry.worktree_status,
        selectedRow.entry.additions_staged,
        selectedRow.entry.deletions_staged,
        selectedRow.entry.additions_unstaged,
        selectedRow.entry.deletions_unstaged,
      ].join("|")
    : "";

  const stagingMode = diffViewMode === "stage";
  const diffKey = JSON.stringify([activePath, selectedPath, selectedSector, selectedSignature]);
  const diffPayload = diffPayloadState?.key === diffKey ? diffPayloadState.payload : null;
  const diffFailed = diffFailureKey === diffKey;
  const diffLoading = diffLoadingState || (stagingMode && !!selectedPath && !selectedIsConflict && !diffPayload && !diffFailed);

  const loadDiff = useCallback(async () => {
    const request = ++diffRequestRef.current;
    const current = () => request === diffRequestRef.current && useRepoStore.getState().activePath === activePath;
    const setDiffPayload = (payload: FileDiffResponse | null) => setDiffPayloadState(payload ? { key: diffKey, payload } : null);
    if (!activePath || !selectedPath || !stagingMode || selectedIsConflict) {
      setDiffPayload(null);
      setDiffLoading(false);
      setDiffFailureKey(null);
      return;
    }
    if (selectedBinary) {
      setDiffPayload({ staged: null, unstaged: null, untracked_plain: null, is_binary: true });
      setDiffLoading(false);
      setDiffFailureKey(null);
      return;
    }
    if (isPreviewRepo(activePath)) {
      setDiffPayload({
        staged: null,
        unstaged: "diff --git a/src/components/repo/layout/empty-state.tsx b/src/components/repo/layout/empty-state.tsx\nindex 7d4a91c..9f3a7c1 100644\n--- a/src/components/repo/layout/empty-state.tsx\n+++ b/src/components/repo/layout/empty-state.tsx\n@@ -1,6 +1,18 @@\n import { Button } from \"@/components/ui/button\";\n+import { useMemo } from \"react\";\n+import { useWorkspacePrefs } from \"@/lib/workspace-prefs\";\n\n-export function EmptyState() {\n+export function EmptyState() {\n+  const rounded = useWorkspacePrefs((s) => s.uiDensity);\n   const { t } = useTranslation();",
        untracked_plain: null,
        is_binary: false,
      });
      setDiffLoading(false);
      setDiffFailureKey(null);
      return;
    }
    setDiffLoading(true);
    setDiffFailureKey(null);
    try {
      const r = await invoke<FileDiffResponse>("repo_file_diff", {
        path: activePath,
        file: selectedPath,
        untracked: selectedUntracked,
        includeFingerprint: !selectedUntracked,
      });
      if (current()) setDiffPayload(r);
    } catch (e) {
      if (!current()) return;
      toastError(String(e));
      setDiffFailureKey(diffKey);
      setDiffPayload(null);
    } finally {
      if (current()) setDiffLoading(false);
    }
  }, [activePath, selectedPath, stagingMode, selectedIsConflict, selectedBinary, selectedUntracked, diffKey]);
  const latestLoadDiffRef = useRef(loadDiff);
  latestLoadDiffRef.current = loadDiff;

  useEffect(() => {
    void loadDiff();
  }, [loadDiff, selectedSector, selectedSignature]);

  const stableOnReload = useCallback(() => {
    if (activePath) void reloadStatus(activePath);
    void loadDiff();
  }, [activePath, reloadStatus, loadDiff]);

  const parsedDiff = useMemo<ParsedDiff | null>(() => {
    if (!selectedRow || !diffPayload) return null;
    const text =
      selectedRow.sector === "staged" ? diffPayload.staged : diffPayload.unstaged;
    if (!text?.trim()) return null;
    return parseDiffWithHunks(text);
  }, [diffPayload, selectedRow]);

  const selectedRawDiff = selectedSector === "staged" ? diffPayload?.staged : diffPayload?.unstaged;
  useEffect(() => {
    setFocusedHunkIdx(-1);
    setSelectedLines(EMPTY_LINES);
  }, [selectedRowId, stagingMode, selectedRawDiff, diffPayload?.fingerprint]);

  const hunkCount = parsedDiff?.hunks.length ?? 0;

  const onFocusPrevHunk = useCallback(() => {
    setFocusedHunkIdx((i) => (hunkCount === 0 ? -1 : i <= 0 ? hunkCount - 1 : i - 1));
  }, [hunkCount]);

  const onFocusNextHunk = useCallback(() => {
    setFocusedHunkIdx((i) => (hunkCount === 0 ? -1 : i >= hunkCount - 1 ? 0 : i + 1));
  }, [hunkCount]);

  const onToggleLine = useCallback((key: string) => {
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const onClearSelection = useCallback(() => {
    setSelectedLines(EMPTY_LINES);
  }, []);

  const applyHunkPatches = useCallback(
    (action: ReviewedHunkAction, patches: readonly string[], target?: ReviewedHunks) => {
      if (!patches.length || hunkPendingRef.current || (diffLoading && !target) || !activePath) return;
      const plan = target ?? (selectedRow && diffPayload ? captureReviewedHunks(activePath, selectedRow, diffPayload, action, patches) : null);
      if (!plan) {
        toastError(t("commitActions.changedHunk", { path: selectedPath ?? "" }));
        void latestLoadDiffRef.current();
        return;
      }
      if (useRepoStore.getState().activePath !== plan.path) return;
      hunkPendingRef.current = true;
      setHunkPending(true);
      void (async () => {
        try {
          await applyReviewedHunks(plan, invoke, () => useRepoStore.getState().activePath);
        } catch (e) {
          toastError(String(e));
        } finally {
          setSelectedLines(EMPTY_LINES);
          try {
            await reloadStatus(plan.path);
            if (useRepoStore.getState().activePath === plan.path) await latestLoadDiffRef.current();
          } finally {
            hunkPendingRef.current = false;
            setHunkPending(false);
          }
        }
      })();
    },
    [activePath, selectedRow, selectedPath, diffPayload, diffLoading, reloadStatus, t],
  );

  const stageHunk = useCallback(
    (patches: string[]) => applyHunkPatches("stage", patches),
    [applyHunkPatches],
  );

  const unstageHunk = useCallback(
    (patches: string[]) => applyHunkPatches("unstage", patches),
    [applyHunkPatches],
  );

  const requestDiscardHunk = useCallback((patches: string[], count: number) => {
    if (!activePath || !selectedRow || !diffPayload || hunkPendingRef.current || diffLoading) return;
    const plan = captureReviewedHunks(activePath, selectedRow, diffPayload, "discard", patches);
    if (!plan) {
      toastError(t("commitActions.changedHunk", { path: selectedRow.path }));
      void latestLoadDiffRef.current();
      return;
    }
    setDiscardLinesDialog({ plan, count });
  }, [activePath, selectedRow, diffPayload, diffLoading, t]);

  const confirmDiscardLines = useCallback(() => {
    if (!discardLinesDialog) return;
    const { plan } = discardLinesDialog;
    setDiscardLinesDialog(null);
    applyHunkPatches("discard", plan.patches, plan);
  }, [discardLinesDialog, applyHunkPatches]);

  const latestSelectedRowRef = useRef(selectedRow);
  latestSelectedRowRef.current = selectedRow;

  const stableOnToggleFile = useCallback(() => {
    const row = latestSelectedRowRef.current;
    if (!activePath || !row) return;
    const action = rowStagingAction(row);
    if (!action) return;
    void (async () => {
      try {
        if (action === "unstage") {
          await unstageFiles(activePath, [row.path]);
        } else {
          await stageFiles(activePath, [row.path]);
        }
      } catch (e) {
        toastError(String(e));
      }
    })();
  }, [activePath, unstageFiles, stageFiles]);

  useCommitPanelHotkeys({
    parsedDiff,
    focusedHunkIdx,
    selectedLines,
    sector:
      selectedRow?.sector === "staged" || selectedRow?.sector === "unstaged"
        ? selectedRow.sector
        : null,
    enabled: stagingMode && !!selectedRow && !selectedIsConflict && !diffLoading && !hunkPending && !discardLinesDialog,
    onClearSelection,
    onFocusPrevHunk,
    onFocusNextHunk,
    onStage: stageHunk,
    onUnstage: unstageHunk,
    onToggleFile: stableOnToggleFile,
  });

  const totals = useMemo(() => {
    let additionsStaged = 0;
    let deletionsStaged = 0;
    let stagedFiles = 0;
    for (const e of entries) {
      if (e.staged) {
        additionsStaged += e.additions_staged;
        deletionsStaged += e.deletions_staged;
        stagedFiles += 1;
      }
    }
    return { additionsStaged, deletionsStaged, stagedFiles };
  }, [entries]);

  const latestChangeRowsRef = useRef(changeRows);
  latestChangeRowsRef.current = changeRows;
  const latestAnchorRowIdRef = useRef(anchorRowId);
  latestAnchorRowIdRef.current = anchorRowId;
  const latestMultiSelectedIdsRef = useRef(multiSelectedIds);
  latestMultiSelectedIdsRef.current = multiSelectedIds;
  const visibleRowIdsRef = useRef<string[]>([]);
  const stableOnVisibleRowsChange = useCallback((ids: string[]) => {
    visibleRowIdsRef.current = ids;
    const visible = new Set(ids);
    setMultiSelectedIds((previous) => {
      const next = new Set([...previous].filter((id) => visible.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, []);

  const handleRowSelect = useCallback((id: string, shiftKey: boolean) => {
    if (hunkPendingRef.current) return;
    setSelectedRowId(id);
    if (shiftKey) {
      const anchor = latestAnchorRowIdRef.current;
      if (anchor && anchor !== id) {
        const range = visibleSelectionRange(visibleRowIdsRef.current, anchor, id);
        if (range.length > 1) {
          setMultiSelectedIds(new Set(range));
          return;
        }
      }
    }
    setAnchorRowId(id);
    setMultiSelectedIds(new Set([id]));
  }, []);

  const stableOnToggleRow = useCallback(
    async (_entry: StatusEntry, rowId: string) => {
      if (!activePath) return;
      const multiIds = latestMultiSelectedIdsRef.current;
      const rows = latestChangeRowsRef.current;
      const clickedRow = rows.find((r) => r.id === rowId);
      if (!clickedRow) return;
      const action = rowStagingAction(clickedRow);
      if (!action) return;
      const selected = multiIds.size > 1 && multiIds.has(rowId)
        ? rows.filter((r) => multiIds.has(r.id) && r.sector === clickedRow.sector && rowStagingAction(r))
        : [clickedRow];
      const paths = [...new Set(selected.map((r) => r.path))];
      try {
        if (action === "unstage") {
          await unstageFiles(activePath, paths);
        } else {
          await stageFiles(activePath, paths);
        }
      } catch (e) {
        toastError(String(e));
      }
    },
    [activePath, unstageFiles, stageFiles],
  );

  const stableOnBlame = useCallback((path: string) => setBlameTarget(path), []);

  const allState = useMemo(() => {
    if (entries.length === 0) return "unchecked" as const;
    const staged = entries.filter((e) => e.staged).length;
    if (staged === 0) return "unchecked" as const;
    if (staged === entries.length && entries.every((e) => !e.unstaged && !e.untracked))
      return "checked" as const;
    return "indeterminate" as const;
  }, [entries]);

  const toggleAllRef = useRef<() => Promise<void>>(async () => {});
  const stableOnToggleAll = useCallback(() => void toggleAllRef.current(), []);

  const stableOnStageAll = useCallback(() => {
    if (!activePath) return;
    const paths = unstagedRows.filter((r) => rowStagingAction(r)).map((r) => r.path);
    if (paths.length === 0) return;
    void stageFiles(activePath, paths).catch((e) => toastError(String(e)));
  }, [activePath, unstagedRows, stageFiles]);

  const stableOnUnstageAll = useCallback(() => {
    if (!activePath) return;
    const paths = stagedRows.filter((r) => rowStagingAction(r)).map((r) => r.path);
    if (paths.length === 0) return;
    void unstageFiles(activePath, paths).catch((e) => toastError(String(e)));
  }, [activePath, stagedRows, unstageFiles]);

  const stableOnStagePaths = useCallback(
    (paths: string[]) => {
      if (!activePath || paths.length === 0) return;
      const requested = new Set(paths);
      const eligible = latestChangeRowsRef.current.filter((row) => row.sector === "unstaged" && rowStagingAction(row) && requested.has(row.path)).map((row) => row.path);
      if (eligible.length) void stageFiles(activePath, eligible).catch((e) => toastError(String(e)));
    },
    [activePath, stageFiles],
  );

  const stableOnUnstagePaths = useCallback(
    (paths: string[]) => {
      if (!activePath || paths.length === 0) return;
      const requested = new Set(paths);
      const eligible = latestChangeRowsRef.current.filter((row) => row.sector === "staged" && rowStagingAction(row) && requested.has(row.path)).map((row) => row.path);
      if (eligible.length) void unstageFiles(activePath, eligible).catch((e) => toastError(String(e)));
    },
    [activePath, unstageFiles],
  );

  const readDiscardDiffs = useCallback((plan: DiscardPlan) => captureDiscardDiffs(plan, (file) => invoke<FileDiffResponse>("repo_file_diff", { path: plan.repoPath, file: file.path, untracked: file.entry.untracked, includeFingerprint: true })), []);

  const loadDiscardPreview = useCallback(async (plan: DiscardPlan) => {
    discardPendingRef.current = true;
    setDiscardPending(true);
    try {
      const fresh = await invoke<StatusEntry[]>("repo_status", { path: plan.repoPath });
      const next = await readDiscardDiffs(refreshDiscardPlan(plan, fresh));
      if (useRepoStore.getState().activePath !== plan.repoPath) return;
      if (next.files.length && !discardPlanVerified(next)) throw new Error(t("commitActions.missingFingerprint"));
      setDiscardDialog(next.files.length ? next : null);
      setDiscardError(null);
    } catch (e) {
      if (useRepoStore.getState().activePath === plan.repoPath) setDiscardError(translateKnownError(e instanceof Error ? e.message : String(e)));
    } finally {
      discardPendingRef.current = false;
      setDiscardPending(false);
    }
  }, [readDiscardDiffs, t]);

  const openDiscardPlan = useCallback((rows: ChangeRow[]) => {
    if (!activePath || discardPendingRef.current) return;
    const plan = makeDiscardPlan(activePath, rows);
    if (!plan.files.length) return;
    setDiscardError(null);
    setDiscardDialog(plan);
    void loadDiscardPreview(plan);
  }, [activePath, loadDiscardPreview]);

  const stableOnDiscardPaths = useCallback(
    (paths: string[], worktreeOnly: boolean) => {
      const selectedPaths = new Set(paths);
      openDiscardPlan(latestChangeRowsRef.current.filter((row) => selectedPaths.has(row.path) && row.sector === (worktreeOnly ? "unstaged" : "staged")));
    },
    [openDiscardPlan],
  );

  const stableOnIgnore = useCallback(
    (patterns: string[]) => {
      if (!activePath || patterns.length === 0) return;
      void invoke("add_to_gitignore", { path: activePath, patterns })
        .then(() => reloadStatus(activePath))
        .catch((e) => toastError(String(e)));
    },
    [activePath, reloadStatus],
  );

  const stableOnDiscardAllStaged = useCallback(() => {
    openDiscardPlan(stagedRows);
  }, [openDiscardPlan, stagedRows]);

  const discardOne = useCallback(
    (rowId: string) => {
      if (!activePath) return;
      const multiIds = latestMultiSelectedIdsRef.current;
      const rows = latestChangeRowsRef.current;

      const clickedRow = rows.find((r) => r.id === rowId);
      if (!clickedRow) return;

      openDiscardPlan(multiIds.size > 1 && multiIds.has(rowId) ? rows.filter((r) => multiIds.has(r.id)) : [clickedRow]);
    },
    [activePath, openDiscardPlan],
  );

  const confirmDiscard = useCallback(async (plan: DiscardPlan) => {
    if (discardPendingRef.current || !discardPlanVerified(plan) || useRepoStore.getState().activePath !== plan.repoPath) return;
    discardPendingRef.current = true;
    setDiscardPending(true);
    setDiscardError(null);
    setDiscardDialog(plan);
    let completedGroups = 0;
    try {
      const fresh = await invoke<StatusEntry[]>("repo_status", { path: plan.repoPath });
      const changed = changedDiscardPaths(plan, fresh);
      if (changed.length) throw new Error(t("commitActions.changedFiles", { paths: changed.join(", ") }));
      const currentDiffs = await readDiscardDiffs(plan);
      const changedContents = changedDiscardContents(plan, currentDiffs);
      if (changedContents.length) throw new Error(t("commitActions.changedFiles", { paths: changedContents.join(", ") }));
      if (useRepoStore.getState().activePath !== plan.repoPath) return;
      for (const group of discardPlanGroups(plan)) {
        await invoke(group.scope === "worktree" ? "git_discard_worktree_changes" : "git_discard_files", {
          path: plan.repoPath,
          files: group.files.map((file) => file.path),
          untracked: group.files.map((file) => file.entry.untracked),
          expectedFingerprints: group.files.map((file) => file.diff!.fingerprint!),
        });
        completedGroups += 1;
      }
      if (useRepoStore.getState().activePath === plan.repoPath) setDiscardDialog(null);
    } catch (e) {
      const error = translateKnownError(e instanceof Error ? e.message : String(e));
      if (useRepoStore.getState().activePath === plan.repoPath) {
        setDiscardError(completedGroups > 0 ? t("commitActions.partialDiscard", { error }) : error);
      }
    } finally {
      discardPendingRef.current = false;
      setDiscardPending(false);
      await reloadStatus(plan.repoPath);
      if (useRepoStore.getState().activePath === plan.repoPath) void loadDiff();
    }
  }, [reloadStatus, loadDiff, readDiscardDiffs, t]);

  const refreshDiscardPreview = useCallback(async () => {
    const plan = discardDialog;
    if (!plan || discardPendingRef.current) return;
    await loadDiscardPreview(plan);
    await reloadStatus(plan.repoPath);
  }, [discardDialog, loadDiscardPreview, reloadStatus]);

  const runAiGeneration = useCallback(async (hint?: string) => {
    if (!activePath || stagedRows.length === 0 || committingRef.current) return;
    aiAbortRef.current?.abort();
    aiStreamRef.current?.cancel();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const previousMessage = aiPreviousMessageRef.current?.message ?? useCommitMessagePrefs.getState().drafts[activePath]?.message ?? "";
    const previousResultShown = aiPreviousMessageRef.current?.resultShown ?? aiResultShown;
    aiPreviousMessageRef.current = { path: activePath, message: previousMessage, controller, resultShown: previousResultShown };
    useCommitMessagePrefs.getState().beginAiDraft(activePath);
    const stream = createCommitDraftStream((message) => {
      if (!controller.signal.aborted && aiAbortRef.current === controller) setAiPreview({ path: activePath, message });
    });
    aiStreamRef.current = stream;
    setAiPreview(null);
    setAiGenerating(true);
    setAiResultShown(true);
    let backupFinalized = false;
    try {
      const msg = await generateFreshCommitDraft({
        signal: controller.signal,
        readDiff: () => invoke<string>("repo_staged_diff", { path: activePath }),
        generate: (diff, signal) => generateAiCommitMessage(diff, activePath, { hint, signal, onDelta: (partial) => stream.push(partial) }),
      });
      if (controller.signal.aborted) return;
      stream.cancel();
      useCommitMessagePrefs.getState().completeAiDraft(activePath, msg);
      backupFinalized = true;
      setAiPreview(null);
      setAiResultShown(true);
    } catch (e) {
      if (controller.signal.aborted || (e instanceof AiError && e.kind === "aborted")) return;
      useCommitMessagePrefs.getState().cancelAiDraft(activePath);
      backupFinalized = true;
      stream.cancel();
      setAiPreview(null);
      setAiResultShown(previousResultShown);
      toastError(e instanceof StagedCommitContextChanged || e instanceof EmptyGeneratedCommitDraft ? t(e.message) : e instanceof Error ? e.message : String(e));
    } finally {
      if (aiAbortRef.current === controller) {
        if (!backupFinalized) {
          useCommitMessagePrefs.getState().cancelAiDraft(activePath);
          setAiResultShown(previousResultShown);
        }
        aiAbortRef.current = null;
        aiStreamRef.current = null;
        stream.cancel();
        aiPreviousMessageRef.current = null;
        setAiPreview(null);
        setAiGenerating(false);
      }
    }
  }, [activePath, stagedRows.length, aiResultShown, t]);

  const onGenerateAiMessage = useCallback((hint?: string) => {
    if (!activePath || stagedRows.length === 0) return;
    if (!isAiConfigured()) {
      setAiSetupOpen(true);
      return;
    }
    void runAiGeneration(hint);
  }, [activePath, stagedRows.length, runAiGeneration]);

  const cancelAiGeneration = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    aiStreamRef.current?.cancel();
    aiStreamRef.current = null;
    const previous = aiPreviousMessageRef.current;
    if (previous) useCommitMessagePrefs.getState().cancelAiDraft(previous.path);
    if (previous) setAiResultShown(previous.resultShown);
    aiPreviousMessageRef.current = null;
    setAiPreview(null);
    setAiGenerating(false);
  }, []);

  if (!activePath) return null;

  const preflightReason = commitPreflight({
    message,
    stagedFiles: totals.stagedFiles,
    conflictFiles: conflictRows.length,
    amend: draft?.amend,
  });
  const canCommit = draftsReady && !aiGenerating && !amendLoading && preflightReason === null;
  const canStash = changeRows.length > 0;
  const amendMayBePublished = amendMode && hasUpstream && aheadCount === 0;

  toggleAllRef.current = async () => {
    if (entries.length === 0) return;
    try {
      if (allState === "checked") {
        await unstageFiles(activePath, stagedRows.filter((row) => rowStagingAction(row)).map((row) => row.path));
      } else {
        await stageFiles(activePath, unstagedRows.filter((row) => rowStagingAction(row)).map((row) => row.path));
      }
    } catch (e) {
      toastError(String(e));
    }
  };

  const toggleAmend = async () => {
    if (committingRef.current || aiGenerating || amendLoading || !draftsReady) return;
    if (amendMode) {
      useCommitMessagePrefs.getState().cancelAmend(activePath);
      return;
    }
    setAmendLoading(true);
    try {
      // Read actual HEAD even if history hides T3 checkpoints.
      const head = await readCommitHead(activePath);
      useCommitMessagePrefs.getState().beginAmend(activePath, head.hash, head.commitMessage);
    } catch (e) {
      toastError(e instanceof Error ? e.message : String(e));
    } finally {
      setAmendLoading(false);
    }
  };

  const performCommit = async () => {
    if (!canCommit || committingRef.current) return;
    committingRef.current = true;
    setCommitting(true);
    setCommitError(null);
    try {
      // A watcher can lag behind an external Git operation. Re-read before mutation.
      const [freshEntries, head] = await Promise.all([
        invoke<StatusEntry[]>("repo_status", { path: activePath }),
        amendMode
          ? readCommitHead(activePath)
          : Promise.resolve(undefined),
      ]);
      const rows = buildChangeRows(freshEntries);
      const reason = commitPreflight({
        message,
        stagedFiles: rows.filter((row) => row.sector === "staged").length,
        conflictFiles: rows.filter((row) => row.sector === "conflict").length,
        amend: draft?.amend,
        headHash: head?.hash,
      });
      if (reason) {
        setCommitError(t(`commitGuidance.preflight.${reason}`));
        void reloadStatus(activePath);
        return;
      }
      const fullMessage = joinCommitMessage(subject.trim(), body.trim()).trim();
      if (amendMode) {
        await amendCommit(activePath, fullMessage, draft?.amend?.hash);
      } else {
        await commitChanges(activePath, fullMessage);
      }
      useCommitMessagePrefs.getState().completeCommit(activePath, getCommitMessageTemplate());
      setAiResultShown(false);
    } catch (e) {
      const rawError = e instanceof Error ? e.message : String(e);
      const error = rawError.includes("__HEAD_CHANGED__") ? t("commitGuidance.preflight.amendTargetChanged") : rawError;
      setCommitError(error);
      toastError(error);
    } finally {
      committingRef.current = false;
      setCommitting(false);
    }
  };

  const onCommit = () => {
    if (!canCommit || committingRef.current) return;
    if (amendMayBePublished) setPublishedAmendOpen(true);
    else void performCommit();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {blameTarget && activePath && (
        <div className="absolute inset-0 z-50 overflow-hidden">
          <GitBlameSheet
            path={activePath}
            file={blameTarget}
            onClose={() => setBlameTarget(null)}
          />
        </div>
      )}

      <MergeStatusBanner path={activePath} />
      <RebaseStatusBanner path={activePath} />

      <div ref={splitContainerRef} className="min-h-0 min-w-0 flex-1 overflow-hidden" data-testid="commit-split-container">
        <ResizablePanelGroup
          orientation={orientation}
          groupRef={groupRef}
          id="commit-panel-layout"
          defaultLayout={layouts[orientation]}
          onLayoutChanged={(layout, meta) => {
            const saved = commitPanelLayoutToPersist(layout, meta.isUserInteraction);
            if (!saved) return;
            layouts[orientation] = saved;
            writeLocalStorageDebounced(COMMIT_PANEL_LAYOUT_KEYS[orientation], JSON.stringify(saved));
          }}
        >
          <ResizablePanel
            id="files"
            defaultSize="32%"
            minSize={orientation === "horizontal" ? 220 * uiScale : splitSize.height > 0 ? Math.min(160 * uiScale, splitSize.height * 0.6) : "20%"}
            maxSize={orientation === "horizontal" ? "78%" : "65%"}
            className="flex flex-col"
          >
            <VirtualFileList
              key={activePath}
              conflictRows={conflictRows}
              stagedRows={stagedRows}
              unstagedRows={unstagedRows}
              selectedRowId={selectedRowId}
              multiSelectedIds={multiSelectedIds}
              allState={allState}
              activePath={activePath}
              onToggleAll={stableOnToggleAll}
              onReload={stableOnReload}
              onStageAll={stableOnStageAll}
              onUnstageAll={stableOnUnstageAll}
              onDiscardAllStaged={stableOnDiscardAllStaged}
              onSelect={handleRowSelect}
              onToggle={stableOnToggleRow}
              onDiscard={discardOne}
              onBlame={stableOnBlame}
              onIgnore={stableOnIgnore}
              onStagePaths={stableOnStagePaths}
              onUnstagePaths={stableOnUnstagePaths}
              onDiscardPaths={stableOnDiscardPaths}
              onVisibleRowsChange={stableOnVisibleRowsChange}
            />
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="bg-border/50 transition-colors hover:bg-primary/20"
          />

          <ResizablePanel id="diff" defaultSize="68%" minSize={orientation === "horizontal" ? 340 * uiScale : splitSize.height > 0 ? Math.min(140 * uiScale, splitSize.height * 0.35) : "20%"} className="flex min-h-0 min-w-0 flex-col">
            {selectedIsConflict && activePath ? (
              <CommitPanelConflictPlaceholder
                filePath={selectedPath ?? ""}
                repoPath={activePath}
              />
            ) : (
              <DiffViewer
                repoPath={activePath}
                selectedRow={selectedRow}
                isBinary={selectedBinary}
                onReload={stableOnReload}
                viewMode={diffViewMode}
                onViewModeChange={setDiffViewMode}
                diffPayload={diffPayload}
                diffLoading={diffLoading || hunkPending}
                diffFailed={diffFailed}
                onStageHunk={stageHunk}
                onUnstageHunk={unstageHunk}
                onDiscardHunk={requestDiscardHunk}
                parsedDiff={parsedDiff}
                focusedHunkIdx={focusedHunkIdx}
                selectedLines={selectedLines}
                onToggleLine={onToggleLine}
                onClearSelection={onClearSelection}
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {aiResultShown && (aiGenerating || message.trim().length > 0) ? (
        <AiResultActions
          className="mx-2 mt-1"
          busy={aiGenerating}
          disabled={totals.stagedFiles === 0}
          onRegenerate={() => onGenerateAiMessage()}
          onRefine={(hint) => onGenerateAiMessage(hint)}
          onCancel={cancelAiGeneration}
        />
      ) : null}

      <CommitComposer
        key={activePath}
        subject={subject}
        body={body}
        subjectLen={subjectLen}
        onSubjectChange={handleSubjectChange}
        onBodyChange={handleBodyChange}
        canCommit={canCommit}
        committing={committing}
        draftsReady={draftsReady}
        amendMode={amendMode}
        amendHash={draft?.amend?.hash}
        amendMayBePublished={amendMayBePublished}
        canAmend={!!latestCommit && draftsReady && !amendLoading}
        preflightReason={preflightReason}
        commitError={commitError}
        currentBranch={currentBranch}
        canStash={canStash}
        aiGenerating={aiGenerating}
        stagedFiles={totals.stagedFiles}
        effectiveLanguage={effectiveLanguage}
        repoAiLanguage={repoAiLanguage}
        globalAiLanguage={globalAiLanguage}
        canUndo={!!latestCommit && (!hasUpstream || aheadCount > 0)}
        signingInfo={signingInfo}
        onCommit={onCommit}
        onGenerateAi={() => onGenerateAiMessage()}
        onSetLanguage={(lang) => setRepoAiLanguage(activePath, lang)}
        onToggleAmend={() => void toggleAmend()}
        onStash={() => setStashOpen(true)}
        onUndo={() => {
          void readCommitHead(activePath).then((head) => {
            if (useRepoStore.getState().activePath !== activePath) return;
            setUndoTarget({ ...head, path: activePath });
            setUndoDialogOpen(true);
          }).catch((e) => toastError(e instanceof Error ? e.message : String(e)));
        }}
        onSplitCommits={
          activePath && aiReady && entries.length > 0
            ? () => setSplitOpen(true)
            : undefined
        }
      />

      <AlertDialog open={publishedAmendOpen} onOpenChange={setPublishedAmendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("commitGuidance.publishedAmendTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("commitGuidance.publishedAmendDescription", { hash: draft?.amend?.hash.slice(0, 8) ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction size="sm" onClick={() => void performCommit()}>{t("common.amend")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {splitOpen && activePath ? (
        <CommitSplitDialog open={splitOpen} onOpenChange={setSplitOpen} path={activePath} />
      ) : null}

      <StashCreateDialog
        open={stashOpen}
        onClose={() => setStashOpen(false)}
        path={activePath}
      />

      <AiSetupDialog
        open={aiSetupOpen}
        onOpenChange={setAiSetupOpen}
        onReady={() => void runAiGeneration()}
      />

      <CommitDiscardDialog
        plan={discardDialog}
        busy={discardPending}
        error={discardError}
        onClose={() => setDiscardDialog(null)}
        onConfirm={(plan) => void confirmDiscard(plan)}
        onRefresh={() => void refreshDiscardPreview()}
        onStash={() => { setDiscardDialog(null); setStashOpen(true); }}
      />

      <AlertDialog
        open={discardLinesDialog !== null}
        onOpenChange={(open) => { if (!open) setDiscardLinesDialog(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("commitPanel.discardDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("commitPanel.discardLinesConfirm", {
                count: discardLinesDialog?.count ?? 0,
              })}
              <span className="mt-2 block break-all font-mono text-xs">{discardLinesDialog?.plan.file}</span>
              <span className="mt-1 block">{t("commitActions.discardKeepStaged")}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="sm"
              onClick={confirmDiscardLines}
            >
              {t("commitPanel.discardVerb")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={undoDialogOpen}
        onOpenChange={(open) => { if (!open) setUndoDialogOpen(false); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("commitPanel.undoConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("commitPanel.undoConfirmDesc", {
                subject: undoTarget ? splitCommitMessage(undoTarget.commitMessage).subject : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              onClick={() => {
                setUndoDialogOpen(false);
                if (!undoTarget || committingRef.current) return;
                const target = undoTarget;
                committingRef.current = true;
                setCommitting(true);
                void (async () => {
                  try {
                    const freshHead = await readCommitHead(target.path);
                    if (freshHead.hash !== target.hash) throw new Error(t("commitGuidance.headChanged"));
                    await gitReset(target.path, "HEAD~1", "soft", target.hash);
                    useCommitMessagePrefs.getState().cancelAmend(target.path);
                    useCommitMessagePrefs.getState().setMessage(target.path, target.commitMessage);
                  } catch (e) {
                    const error = e instanceof Error ? e.message : String(e);
                    toastError(error.includes("__HEAD_CHANGED__") ? t("commitGuidance.headChanged") : error);
                  } finally {
                    committingRef.current = false;
                    setCommitting(false);
                  }
                })();
              }}
            >
              {t("commitPanel.undoVerb")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
