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
import { useRepoPrefs } from "@/lib/repo-prefs";
import { toastError } from "@/lib/error-toast";
import { loadSigningInfo, type SigningInfo } from "@/lib/git-signing";
import { useRepoStore, type StatusEntry } from "@/lib/repo-store";
import { useSigningRevision } from "@/lib/signing-store";
import { writeLocalStorageDebounced } from "@/lib/utils";
import { parseDiffWithHunks, type ParsedDiff } from "@/lib/unified-diff";
import { useCommitPanelHotkeys } from "@/lib/use-commit-panel-hotkeys";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffViewer } from "./commit-panel-diff-viewer";
import { VirtualFileList } from "./commit-panel-file-list";
import { MergeStatusBanner } from "@/components/repo/merge/merge-status-banner";
import { RebaseStatusBanner } from "@/components/repo/rebase/rebase-status-banner";
import { CommitPanelConflictPlaceholder } from "@/components/repo/commit/commit-panel-conflict-placeholder";
import { CommitComposer } from "@/components/repo/commit/commit-composer";
import {
  buildChangeRows,
  checkState,
  type FileDiffResponse,
} from "./commit-panel-types";
import { generateAiCommitMessage } from "@/lib/ai-commit";
import { AiError } from "@/lib/ai/core";
import { AiResultActions } from "@/components/ai/ai-result-actions";
import { isAiConfigured } from "@/lib/ai-setup";
import { AiSetupDialog } from "@/components/onboarding/ai-setup-dialog";
import { CommitSplitDialog } from "@/components/repo/commit/commit-split-dialog";
import { useTranslation } from "react-i18next";

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
  const discardFiles = useRepoStore((s) => s.discardFiles);
  const discardWorktreeChanges = useRepoStore((s) => s.discardWorktreeChanges);
  const gitReset = useRepoStore((s) => s.gitReset);

  const diffViewMode = useCommitPrefs((s) => s.diffViewMode);
  const setDiffViewMode = useCommitPrefs((s) => s.setDiffViewMode);

  const globalAiLanguage = useCommitPrefs((s) => s.aiOutputLanguage);
  const repoAiLanguage = useRepoPrefs((s) => activePath ? s.getAiOutputLanguage(activePath) : undefined);
  const setRepoAiLanguage = useRepoPrefs((s) => s.setAiOutputLanguage);
  const effectiveLanguage = repoAiLanguage ?? globalAiLanguage;

  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiResultShown, setAiResultShown] = useState(false);
  const aiAbortRef = useRef<AbortController | null>(null);
  const [aiSetupOpen, setAiSetupOpen] = useState(false);
  const [amendMode, setAmendMode] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const aiReady = useCommitPrefs(() => isAiConfigured());
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [blameTarget, setBlameTarget] = useState<string | null>(null);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [signingInfo, setSigningInfo] = useState<SigningInfo | null>(null);
  const signingRevision = useSigningRevision((s) => s.revision);

  const [anchorRowId, setAnchorRowId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<ReadonlySet<string>>(new Set<string>());
  const [discardDialog, setDiscardDialog] = useState<{ files: string[]; worktreeOnly: boolean } | null>(null);

  const [diffPayload, setDiffPayload] = useState<FileDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffFailed, setDiffFailed] = useState(false);
  const [focusedHunkIdx, setFocusedHunkIdx] = useState(-1);
  const [selectedLines, setSelectedLines] = useState<ReadonlySet<string>>(EMPTY_LINES);
  const [discardLinesDialog, setDiscardLinesDialog] = useState<{ patches: string[]; count: number } | null>(null);

  const subject = message.split("\n")[0] ?? "";
  const bodyStart = message.indexOf("\n\n");
  const body = bodyStart >= 0 ? message.slice(bodyStart + 2) : "";
  const subjectLen = subject.length;

  const handleSubjectChange = useCallback((val: string) => {
    const currentBody = (() => {
      const idx = message.indexOf("\n\n");
      return idx >= 0 ? message.slice(idx + 2) : "";
    })();
    setMessage(currentBody.trim() ? `${val}\n\n${currentBody}` : val);
  }, [message]);

  const handleBodyChange = useCallback((val: string) => {
    const currentSubject = message.split("\n")[0] ?? "";
    setMessage(val.trim() ? `${currentSubject}\n\n${val}` : currentSubject);
  }, [message]);

  const layoutStorageKey = "l8git.commit-panel.layout.v2";
  const [defaultLayout] = useState(() => {
    const saved = localStorage.getItem(layoutStorageKey);
    if (saved) {
      try {
        return JSON.parse(saved) as Record<string, number>;
      } catch {
        return undefined;
      }
    }
    return undefined;
  });

  const seedMessageFromTemplate = useCallback(() => {
    const raw = getCommitMessageTemplate();
    if (!raw.trim()) return;
    setMessage((m) => (m.trim() === "" ? raw : m));
  }, []);

  useEffect(() => {
    const run = () => seedMessageFromTemplate();
    if (useCommitPrefs.persist.hasHydrated()) {
      run();
      return;
    }
    return useCommitPrefs.persist.onFinishHydration(run);
  }, [activePath, seedMessageFromTemplate]);

  useEffect(() => {
    setAiResultShown(false);
    return () => aiAbortRef.current?.abort();
  }, [activePath]);

  useEffect(() => {
    if (!activePath) {
      setSigningInfo(null);
      return;
    }
    let alive = true;
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
      setMessage((m) => (m.trim() === "" ? raw : m));
    });
  }, []);

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

  const loadDiff = useCallback(async () => {
    if (!activePath || !selectedPath || !stagingMode || selectedIsConflict) {
      setDiffPayload(null);
      setDiffLoading(false);
      setDiffFailed(false);
      return;
    }
    if (selectedBinary) {
      setDiffPayload({ staged: null, unstaged: null, untracked_plain: null, is_binary: true });
      setDiffLoading(false);
      setDiffFailed(false);
      return;
    }
    setDiffLoading(true);
    setDiffFailed(false);
    try {
      const r = await invoke<FileDiffResponse>("repo_file_diff", {
        path: activePath,
        file: selectedPath,
        untracked: selectedUntracked,
      });
      setDiffPayload(r);
    } catch (e) {
      toastError(String(e));
      setDiffFailed(true);
      setDiffPayload(null);
    } finally {
      setDiffLoading(false);
    }
  }, [activePath, selectedPath, stagingMode, selectedIsConflict, selectedBinary, selectedUntracked]);

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

  useEffect(() => {
    setFocusedHunkIdx(-1);
    setSelectedLines(EMPTY_LINES);
  }, [selectedRowId, stagingMode]);

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
    (command: "stage_hunk" | "unstage_hunk" | "discard_hunk", patches: string[]) => {
      if (!activePath || patches.length === 0) return;
      void (async () => {
        try {
          for (const patch of patches) {
            await invoke(command, { path: activePath, patch });
          }
        } catch (e) {
          toastError(String(e));
        } finally {
          await reloadStatus(activePath);
          await loadDiff();
        }
      })();
    },
    [activePath, reloadStatus, loadDiff],
  );

  const stageHunk = useCallback(
    (patches: string[]) => applyHunkPatches("stage_hunk", patches),
    [applyHunkPatches],
  );

  const unstageHunk = useCallback(
    (patches: string[]) => applyHunkPatches("unstage_hunk", patches),
    [applyHunkPatches],
  );

  const requestDiscardHunk = useCallback((patches: string[], count: number) => {
    setDiscardLinesDialog({ patches, count });
  }, []);

  const confirmDiscardLines = useCallback(() => {
    if (!discardLinesDialog) return;
    const { patches } = discardLinesDialog;
    setDiscardLinesDialog(null);
    applyHunkPatches("discard_hunk", patches);
  }, [discardLinesDialog, applyHunkPatches]);

  const latestSelectedRowRef = useRef(selectedRow);
  latestSelectedRowRef.current = selectedRow;

  const stableOnToggleFile = useCallback(() => {
    const row = latestSelectedRowRef.current;
    if (!activePath || !row) return;
    const state = checkState(row.entry);
    void (async () => {
      try {
        if (state === "checked") {
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
    enabled: stagingMode && !!selectedRow && !selectedIsConflict && !diffLoading,
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

  const handleRowSelect = useCallback((id: string, shiftKey: boolean) => {
    setSelectedRowId(id);
    if (shiftKey) {
      const anchor = latestAnchorRowIdRef.current;
      const rows = latestChangeRowsRef.current;
      if (anchor && anchor !== id) {
        const anchorIdx = rows.findIndex((r) => r.id === anchor);
        const targetIdx = rows.findIndex((r) => r.id === id);
        if (anchorIdx >= 0 && targetIdx >= 0) {
          const [from, to] =
            anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
          setMultiSelectedIds(new Set(rows.slice(from, to + 1).map((r) => r.id)));
          return;
        }
      }
    }
    setAnchorRowId(id);
    setMultiSelectedIds(new Set([id]));
  }, []);

  const toggleEntryRef = useRef<(entry: StatusEntry) => void>(() => {});
  const stableOnToggleRow = useCallback(
    async (entry: StatusEntry, rowId: string) => {
      if (!activePath) return;
      const multiIds = latestMultiSelectedIdsRef.current;
      const rows = latestChangeRowsRef.current;
      if (multiIds.size > 1 && multiIds.has(rowId)) {
        const clickedRow = rows.find((r) => r.id === rowId);
        if (!clickedRow) return;
        const state = checkState(entry);
        const sectorRows = rows.filter(
          (r) => multiIds.has(r.id) && r.sector === clickedRow.sector,
        );
        const paths = sectorRows.map((r) => r.path);
        try {
          if (state === "checked") {
            await unstageFiles(activePath, paths);
          } else {
            await stageFiles(activePath, paths);
          }
        } catch (e) {
          toastError(String(e));
        }
      } else {
        void toggleEntryRef.current(entry);
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
    const paths = unstagedRows.map((r) => r.path);
    if (paths.length === 0) return;
    void stageFiles(activePath, paths).catch((e) => toastError(String(e)));
  }, [activePath, unstagedRows, stageFiles]);

  const stableOnUnstageAll = useCallback(() => {
    if (!activePath) return;
    const paths = stagedRows.map((r) => r.path);
    if (paths.length === 0) return;
    void unstageFiles(activePath, paths).catch((e) => toastError(String(e)));
  }, [activePath, stagedRows, unstageFiles]);

  const stableOnDiscardAllStaged = useCallback(() => {
    if (!activePath) return;
    const files = [...new Set(stagedRows.map((r) => r.path))];
    if (files.length === 0) return;
    setDiscardDialog({ files, worktreeOnly: false });
  }, [activePath, stagedRows]);

  const discardOne = useCallback(
    (rowId: string) => {
      if (!activePath) return;
      const multiIds = latestMultiSelectedIdsRef.current;
      const rows = latestChangeRowsRef.current;

      const clickedRow = rows.find((r) => r.id === rowId);
      if (!clickedRow) return;

      if (multiIds.size > 1 && multiIds.has(rowId)) {
        const selectedRows = rows.filter((r) => multiIds.has(r.id));
        const allUnstaged = selectedRows.every((r) => r.sector === "unstaged");
        const files = [...new Set(selectedRows.map((r) => r.path))];
        setDiscardDialog({ files, worktreeOnly: allUnstaged });
        return;
      }

      setDiscardDialog({ files: [clickedRow.path], worktreeOnly: clickedRow.sector === "unstaged" });
    },
    [activePath],
  );

  const confirmDiscard = useCallback(async () => {
    if (!activePath || !discardDialog) return;
    const { files, worktreeOnly } = discardDialog;
    setDiscardDialog(null);
    try {
      if (worktreeOnly) {
        await discardWorktreeChanges(activePath, files);
      } else {
        await discardFiles(activePath, files);
      }
    } catch (e) {
      toastError(String(e));
    }
  }, [activePath, discardFiles, discardWorktreeChanges, discardDialog]);

  const runAiGeneration = useCallback(async (hint?: string) => {
    if (!activePath || stagedRows.length === 0) return;
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiGenerating(true);
    try {
      const stagedDiff = await invoke<string>("repo_staged_diff", { path: activePath });
      const msg = await generateAiCommitMessage(stagedDiff, activePath, {
        hint,
        signal: controller.signal,
        onDelta: (partial) => {
          if (!controller.signal.aborted) setMessage(partial);
        },
      });
      if (controller.signal.aborted) return;
      setMessage(msg);
      setAiResultShown(true);
    } catch (e) {
      if (e instanceof AiError && e.kind === "aborted") return;
      toastError(e instanceof Error ? e.message : String(e));
    } finally {
      if (aiAbortRef.current === controller) {
        aiAbortRef.current = null;
        setAiGenerating(false);
      }
    }
  }, [activePath, stagedRows.length]);

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
    setAiGenerating(false);
  }, []);

  if (!activePath) return null;

  const canCommit = subject.trim().length > 0 && (amendMode || totals.stagedFiles > 0);
  const canStash = changeRows.length > 0;

  toggleAllRef.current = async () => {
    if (entries.length === 0) return;
    try {
      if (allState === "checked") {
        await unstageFiles(activePath, entries.map((e) => e.path));
      } else {
        await stageFiles(activePath, entries.map((e) => e.path));
      }
    } catch (e) {
      toastError(String(e));
    }
  };

  const toggleEntry = async (entry: StatusEntry) => {
    const state = checkState(entry);
    try {
      if (state === "checked") {
        await unstageFiles(activePath, [entry.path]);
      } else {
        await stageFiles(activePath, [entry.path]);
      }
    } catch (e) {
      toastError(String(e));
    }
  };
  toggleEntryRef.current = toggleEntry;

  const onCommit = async () => {
    if (!canCommit) return;
    setCommitting(true);
    try {
      const fullMessage = body.trim() ? `${subject}\n\n${body}` : subject;
      if (amendMode) {
        await amendCommit(activePath, fullMessage.trim());
        setAmendMode(false);
      } else {
        await commitChanges(activePath, fullMessage.trim());
      }
      const next = getCommitMessageTemplate();
      setMessage(next.trim() ? next : "");
    } catch (e) {
      toastError(String(e));
    } finally {
      setCommitting(false);
    }
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

      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          id="commit-panel-layout"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) =>
            writeLocalStorageDebounced(layoutStorageKey, JSON.stringify(layout))
          }
        >
          <ResizablePanel
            id="files"
            defaultSize="32%"
            minSize="16%"
            maxSize="78%"
            className="flex flex-col"
          >
            <VirtualFileList
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
            />
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="bg-border/50 transition-colors hover:bg-primary/20"
          />

          <ResizablePanel id="diff" defaultSize="68%" minSize="22%" className="flex flex-col">
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
                diffLoading={diffLoading}
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
        subject={subject}
        body={body}
        subjectLen={subjectLen}
        onSubjectChange={handleSubjectChange}
        onBodyChange={handleBodyChange}
        canCommit={canCommit}
        committing={committing}
        amendMode={amendMode}
        currentBranch={currentBranch}
        canStash={canStash}
        aiGenerating={aiGenerating}
        stagedFiles={totals.stagedFiles}
        effectiveLanguage={effectiveLanguage}
        repoAiLanguage={repoAiLanguage}
        globalAiLanguage={globalAiLanguage}
        canUndo={!!latestCommit && (!hasUpstream || aheadCount > 0)}
        signingInfo={signingInfo}
        onCommit={() => void onCommit()}
        onGenerateAi={() => onGenerateAiMessage()}
        onSetLanguage={(lang) => setRepoAiLanguage(activePath, lang)}
        onToggleAmend={() => {
          const next = !amendMode;
          setAmendMode(next);
          if (next && latestCommit) {
            const full = latestCommit.body.trim()
              ? `${latestCommit.subject}\n\n${latestCommit.body}`
              : latestCommit.subject;
            setMessage(full);
          }
        }}
        onStash={() => setStashOpen(true)}
        onUndo={() => setUndoDialogOpen(true)}
        onSplitCommits={
          activePath && aiReady && entries.length > 0
            ? () => setSplitOpen(true)
            : undefined
        }
      />

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

      <AlertDialog
        open={discardDialog !== null}
        onOpenChange={(open) => { if (!open) setDiscardDialog(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("commitPanel.discardDialogTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {discardDialog?.files.length === 1
                ? t("commitPanel.discardConfirm", { path: discardDialog.files[0] })
                : t("commitPanel.discardManyConfirm", { count: discardDialog?.files.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              size="sm"
              onClick={() => void confirmDiscard()}
            >
              {t("commitPanel.discardVerb")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                subject: latestCommit?.subject ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              onClick={() => {
                setUndoDialogOpen(false);
                if (!activePath) return;
                void (async () => {
                  try {
                    await gitReset(activePath, "HEAD~1", "soft");
                    if (latestCommit) {
                      const full = latestCommit.body.trim()
                        ? `${latestCommit.subject}\n\n${latestCommit.body}`
                        : latestCommit.subject;
                      setMessage(full);
                    }
                  } catch (e) {
                    toastError(String(e));
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
