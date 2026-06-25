import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "@/components/ui/input-group";
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
import { useRepoStore, type StatusEntry } from "@/lib/repo-store";
import { writeLocalStorageDebounced } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import {
  Archive,
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  Undo2,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffViewer } from "./commit-panel-diff-viewer";
import { VirtualFileList } from "./commit-panel-file-list";
import { MergeStatusBanner } from "@/components/repo/merge/merge-status-banner";
import { CommitPanelConflictPlaceholder } from "@/components/repo/commit/commit-panel-conflict-placeholder";
import {
  buildChangeRows,
  checkState,
} from "./commit-panel-types";
import { generateAiCommitMessage } from "@/lib/ai-commit";
import { useTranslation } from "react-i18next";

const EMPTY_STATUS: StatusEntry[] = [];

const AI_LANGUAGES = [
  { label: "English", short: "EN" },
  { label: "Deutsch", short: "DE" },
  { label: "Français", short: "FR" },
  { label: "Español", short: "ES" },
  { label: "Italiano", short: "IT" },
  { label: "Português", short: "PT" },
  { label: "中文", short: "ZH" },
  { label: "日本語", short: "JA" },
] as const;

function languageShort(lang: string): string {
  return AI_LANGUAGES.find((l) => l.label.toLowerCase() === lang.toLowerCase())?.short
    ?? lang.slice(0, 2).toUpperCase();
}

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

  const globalAiLanguage = useCommitPrefs((s) => s.aiOutputLanguage);
  const repoAiLanguage = useRepoPrefs((s) => activePath ? s.getAiOutputLanguage(activePath) : undefined);
  const setRepoAiLanguage = useRepoPrefs((s) => s.setAiOutputLanguage);
  const effectiveLanguage = repoAiLanguage ?? globalAiLanguage;

  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [amendMode, setAmendMode] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [blameTarget, setBlameTarget] = useState<string | null>(null);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);

  const [anchorRowId, setAnchorRowId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<ReadonlySet<string>>(new Set<string>());
  const [discardDialog, setDiscardDialog] = useState<{ files: string[]; worktreeOnly: boolean } | null>(null);

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

  const stableOnReload = useCallback(() => {
    if (activePath) void reloadStatus(activePath);
  }, [activePath, reloadStatus]);

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

  const onGenerateAiMessage = useCallback(async () => {
    if (!activePath || stagedRows.length === 0) return;
    setAiGenerating(true);
    try {
      const stagedDiff = await invoke<string>("repo_staged_diff", { path: activePath });
      const msg = await generateAiCommitMessage(stagedDiff, activePath);
      setMessage(msg);
    } catch (e) {
      toastError(String(e));
    } finally {
      setAiGenerating(false);
    }
  }, [activePath, stagedRows.length]);

  if (!activePath) return null;

  const nothingToCommit = totals.stagedFiles === 0 && !amendMode;
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
              />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-border/60 px-2 py-2">
        <InputGroup className="border-border/50 bg-muted/20 dark:bg-muted/10">
          <InputGroupInput
            placeholder={t("commitPanel.messagePlaceholder")}
            value={subject}
            onChange={(e) => handleSubjectChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canCommit && !committing) {
                e.preventDefault();
                void onCommit();
              }
            }}
            className="text-sm"
          />
          <InputGroupAddon align="inline-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <InputGroupButton
                  title={t("commitPanel.aiLanguageTitle")}
                  className={
                    "font-mono text-[10px] tabular-nums " +
                    (repoAiLanguage ? "opacity-100" : "opacity-40 hover:opacity-100")
                  }
                >
                  {languageShort(effectiveLanguage)}
                </InputGroupButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top">
                <DropdownMenuLabel>{t("commitPanel.aiLanguageLabel")}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => activePath && setRepoAiLanguage(activePath, undefined)}
                  className={!repoAiLanguage ? "font-medium" : ""}
                >
                  {t("commitPanel.aiLanguageDefault", { lang: languageShort(globalAiLanguage) })}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {AI_LANGUAGES.map(({ label, short }) => (
                  <DropdownMenuItem
                    key={label}
                    onClick={() => activePath && setRepoAiLanguage(activePath, label)}
                    className={repoAiLanguage === label ? "font-medium" : ""}
                  >
                    <span className="w-7 text-muted-foreground">{short}</span>
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <InputGroupButton
              title={t("commitPanel.aiTitle")}
              aria-label={t("commitPanel.aiAria")}
              disabled={stagedRows.length === 0 || aiGenerating}
              onClick={() => void onGenerateAiMessage()}
              className="opacity-40 hover:opacity-100 disabled:opacity-20"
            >
              {aiGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        <InputGroup className="border-border/50 bg-muted/20 dark:bg-muted/10">
          <InputGroupTextarea
            placeholder="Description"
            value={body}
            onChange={(e) => handleBodyChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canCommit && !committing) {
                e.preventDefault();
                void onCommit();
              }
            }}
            rows={2}
            className="text-sm"
          />
          <InputGroupAddon align="block-end">
            <InputGroupButton
              title={t("commitPanel.stashTitle")}
              aria-label={t("commitPanel.stashAria")}
              disabled={!canStash}
              onClick={() => setStashOpen(true)}
              className="opacity-40 hover:opacity-100 disabled:opacity-20"
            >
              <Archive className="h-3.5 w-3.5" />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>

        {subjectLen > 0 && (
          <div className="px-0.5">
            <span
              className={`font-mono text-[10px] tabular-nums transition-colors ${
                subjectLen > 72
                  ? "text-destructive"
                  : subjectLen > 60
                    ? "text-amber-500"
                    : "text-muted-foreground/40"
              }`}
            >
              {subjectLen}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <Button
            onClick={() => void onCommit()}
            disabled={!canCommit || committing}
            className={
              "h-8 flex-1 truncate rounded-lg text-sm " +
              (amendMode
                ? "bg-amber-500 text-white hover:bg-amber-600"
                : canCommit
                  ? ""
                  : "bg-muted text-muted-foreground")
            }
          >
            {committing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            <span className="truncate">
              {committing
                ? (amendMode ? t("commitPanel.amendTitle") : t("commitPanel.commitTitle"))
                : amendMode
                  ? t("common.amend")
                  : nothingToCommit
                    ? "Add & Commit"
                    : `Commit to ${currentBranch ?? "..."}`}
            </span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0 rounded-lg border-border/60"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <DropdownMenuItem
                onClick={() => {
                  const next = !amendMode;
                  setAmendMode(next);
                  if (next && latestCommit) {
                    const full = latestCommit.body.trim()
                      ? `${latestCommit.subject}\n\n${latestCommit.body}`
                      : latestCommit.subject;
                    setMessage(full);
                  }
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                {t("common.amend")}
                {amendMode && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
              </DropdownMenuItem>
              {latestCommit && (!hasUpstream || aheadCount > 0) && (
                <DropdownMenuItem onClick={() => setUndoDialogOpen(true)}>
                  <Undo2 className="h-3.5 w-3.5" />
                  {t("commitPanel.undoLastCommit")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <StashCreateDialog
        open={stashOpen}
        onClose={() => setStashOpen(false)}
        path={activePath}
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
