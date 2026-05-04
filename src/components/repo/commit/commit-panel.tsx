import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Textarea } from "@/components/ui/textarea";
import { StashCreateDialog } from "@/components/repo/stash/stash-create-dialog";
import { GitBlameSheet } from "@/components/repo/blame/git-blame-sheet";
import { getCommitMessageTemplate, useCommitPrefs } from "@/lib/commit-prefs";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type StatusEntry } from "@/lib/repo-store";
import { writeLocalStorageDebounced } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import {
  Archive,
  Check,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffViewer } from "./commit-panel-diff-viewer";
import { VirtualFileList } from "./commit-panel-file-list";
import {
  buildChangeRows,
  checkState,
  type FileDiffResponse,
} from "./commit-panel-types";
import { generateAiCommitMessage } from "@/lib/ai-commit";

const EMPTY_STATUS: StatusEntry[] = [];

export function CommitPanel() {
  const activePath = useRepoStore((s) => s.activePath);
  const entries =
    useRepoStore((s) => (activePath ? s.status[activePath] : undefined)) ?? EMPTY_STATUS;
  const loading = useRepoStore((s) => (activePath ? !!s.statusLoading[activePath] : false));
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const stageFiles = useRepoStore((s) => s.stageFiles);
  const unstageFiles = useRepoStore((s) => s.unstageFiles);
  const commitChanges = useRepoStore((s) => s.commitChanges);
  const discardFiles = useRepoStore((s) => s.discardFiles);

  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [diffPayload, setDiffPayload] = useState<FileDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffFailed, setDiffFailed] = useState(false);
  const [blameTarget, setBlameTarget] = useState<string | null>(null);

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
  }, [changeRows]);

  const selectedRow = useMemo(
    () => changeRows.find((r) => r.id === selectedRowId) ?? null,
    [changeRows, selectedRowId],
  );

  const selectedPath = selectedRow?.path ?? null;
  const selectedSector = selectedRow?.sector ?? null;
  const selectedBinary = !!selectedRow?.entry.binary;
  const selectedUntracked = !!selectedRow?.entry.untracked;
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

  const loadDiff = useCallback(async () => {
    if (!activePath || !selectedPath) {
      setDiffPayload(null);
      return;
    }
    if (selectedBinary) {
      setDiffPayload({ staged: null, unstaged: null, untracked_plain: null, is_binary: true });
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
  }, [activePath, selectedPath, selectedSector, selectedBinary, selectedUntracked, selectedSignature]);

  useEffect(() => {
    void loadDiff();
  }, [loadDiff]);

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

  const allState = useMemo(() => {
    if (entries.length === 0) return "unchecked" as const;
    const staged = entries.filter((e) => e.staged).length;
    if (staged === 0) return "unchecked" as const;
    if (staged === entries.length && entries.every((e) => !e.unstaged && !e.untracked))
      return "checked" as const;
    return "indeterminate" as const;
  }, [entries]);

  if (!activePath) return null;

  const canCommit = totals.stagedFiles > 0 && message.trim().length > 0;
  const canStash = changeRows.length > 0;

  const toggleEntry = async (entry: StatusEntry) => {
    if (!activePath) return;
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

  const toggleEntryRef = useRef(toggleEntry);
  toggleEntryRef.current = toggleEntry;

  const stableOnSelectRow = useCallback((id: string) => setSelectedRowId(id), []);
  const stableOnToggleRow = useCallback(
    (entry: StatusEntry) => void toggleEntryRef.current(entry),
    [],
  );
  const stableOnBlame = useCallback((path: string) => setBlameTarget(path), []);
  const stableOnReload = useCallback(() => void loadDiff(), [loadDiff]);

  const toggleAllRef = useRef(async () => {
    if (!activePath || entries.length === 0) return;
    try {
      if (allState === "checked") {
        await unstageFiles(activePath, entries.map((e) => e.path));
      } else {
        await stageFiles(activePath, entries.map((e) => e.path));
      }
    } catch (e) {
      toastError(String(e));
    }
  });
  toggleAllRef.current = async () => {
    if (!activePath || entries.length === 0) return;
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
  const stableOnToggleAll = useCallback(() => void toggleAllRef.current(), []);

  const discardOne = useCallback(
    (filePath: string) => {
      if (!activePath) return;
      const ok = window.confirm(`Änderungen an „${filePath}" unwiderruflich verwerfen?`);
      if (!ok) return;
      void (async () => {
        try {
          await discardFiles(activePath, [filePath]);
        } catch (e) {
          toastError(String(e));
        }
      })();
    },
    [activePath, discardFiles],
  );

  const onGenerateAiMessage = useCallback(async () => {
    if (!activePath || stagedRows.length === 0) return;
    setAiGenerating(true);
    try {
      const stagedDiff = await invoke<string>("repo_staged_diff", { path: activePath });
      const msg = await generateAiCommitMessage(stagedDiff);
      setMessage(msg);
    } catch (e) {
      toastError(String(e));
    } finally {
      setAiGenerating(false);
    }
  }, [activePath, stagedRows.length]);

  const onCommit = async () => {
    if (!canCommit || !activePath) return;
    setCommitting(true);
    try {
      await commitChanges(activePath, message.trim());
      const next = getCommitMessageTemplate();
      setMessage(next.trim() ? next : "");
    } catch (e) {
      toastError(String(e));
    } finally {
      setCommitting(false);
    }
  };

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

  return (
    <div className="relative flex h-full flex-col gap-3 p-3">
      {blameTarget && activePath && (
        <div className="absolute inset-0 z-50 overflow-hidden rounded-xl">
          <GitBlameSheet
            path={activePath}
            file={blameTarget}
            onClose={() => setBlameTarget(null)}
          />
        </div>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <Check className="h-[18px] w-[18px] self-center text-muted-foreground" />
          <h2 className="text-base font-semibold tracking-tight">Änderungen</h2>
          <span className="text-xs text-muted-foreground">
            · {changeRows.length} {changeRows.length === 1 ? "Datei" : "Dateien"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md"
          onClick={() => void reloadStatus(activePath)}
          disabled={loading}
        >
          <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden rounded-2xl border border-border/60 shadow-sm">
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
              stagedRows={stagedRows}
              unstagedRows={unstagedRows}
              selectedRowId={selectedRowId}
              allState={allState}
              onToggleAll={stableOnToggleAll}
              onSelect={stableOnSelectRow}
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
            <DiffViewer
              selectedRow={selectedRow}
              diffPayload={diffPayload}
              loading={diffLoading}
              diffFailed={diffFailed}
              onReload={stableOnReload}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/60 p-3 shadow-sm">
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>
            <span className="tabular-nums font-medium text-foreground">{totals.stagedFiles}</span>{" "}
            {totals.stagedFiles === 1 ? "Datei" : "Dateien"} gestaged
          </span>
          <span className="font-mono tabular-nums">
            <span className="text-git-added">+{totals.additionsStaged}</span>
            <span className="mx-1 opacity-40">·</span>
            <span className="text-git-removed">−{totals.deletionsStaged}</span>
          </span>
        </div>

        <div className="relative">
          <Textarea
            placeholder="Commit-Nachricht eingeben..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="resize-none rounded-md border-0 bg-muted/30 px-4 py-3 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0"
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              title="Commit-Nachricht mit AI generieren"
              aria-label="AI generieren"
              disabled={stagedRows.length === 0 || aiGenerating}
              onClick={() => void onGenerateAiMessage()}
              className="h-9 w-9 rounded-md border-border/60 bg-background/80"
            >
              {aiGenerating ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <Sparkles className="h-[18px] w-[18px]" />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              title="Änderungen stashen"
              aria-label="Stashen"
              disabled={!canStash}
              onClick={() => setStashOpen(true)}
              className="h-9 w-9 rounded-md border-border/60 bg-background/80"
            >
              <Archive className="h-[18px] w-[18px]" />
            </Button>
            <Button
              size="icon"
              onClick={onCommit}
              disabled={!canCommit || committing}
              className={`h-9 w-9 rounded-md ${
                canCommit ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {committing ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <Send className="h-[18px] w-[18px]" />
              )}
            </Button>
          </div>
        </div>
      </div>

      <StashCreateDialog
        open={stashOpen}
        onClose={() => setStashOpen(false)}
        path={activePath}
      />
    </div>
  );
}
