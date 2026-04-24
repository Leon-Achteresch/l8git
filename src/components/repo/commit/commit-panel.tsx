import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { StashCreateDialog } from "@/components/repo/stash/stash-create-dialog";
import { UnifiedDiffBody } from "./unified-diff-body";
import { getCommitMessageTemplate, useCommitPrefs } from "@/lib/commit-prefs";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type StatusEntry } from "@/lib/repo-store";
import { writeLocalStorageDebounced } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import {
  Archive,
  Check,
  CheckSquare,
  FileCode2,
  FileDiff,
  FileMinus,
  FilePlus,
  Loader2,
  MinusSquare,
  RefreshCw,
  Send,
  Square,
  Undo2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

const EMPTY_STATUS: StatusEntry[] = [];

type FileDiffResponse = {
  staged: string | null;
  unstaged: string | null;
  untracked_plain: string | null;
  is_binary: boolean;
};

type ChangeSector = "staged" | "unstaged";

type ChangeRow = {
  id: string;
  path: string;
  sector: ChangeSector;
  entry: StatusEntry;
};

function rowId(path: string, sector: ChangeSector): string {
  return `${path}\n${sector}`;
}

function StatusIcon({
  entry,
  sector,
}: {
  entry: StatusEntry;
  sector: ChangeSector;
}) {
  if (sector === "unstaged" && entry.untracked) {
    return <FilePlus className="h-4 w-4 text-emerald-500" />;
  }
  const code = sector === "staged" ? entry.index_status : entry.worktree_status;
  switch (code.trim()) {
    case "M":
      return <FileDiff className="h-4 w-4 text-amber-500" />;
    case "A":
      return <FilePlus className="h-4 w-4 text-emerald-500" />;
    case "D":
      return <FileMinus className="h-4 w-4 text-destructive" />;
    case "R":
    case "C":
      return <FileCode2 className="h-4 w-4 text-sky-500" />;
    case "U":
      return <FileDiff className="h-4 w-4 text-destructive" />;
    default:
      return <FileCode2 className="h-4 w-4 text-muted-foreground" />;
  }
}

function buildChangeRows(entries: StatusEntry[]): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const e of entries) {
    if (e.staged) {
      rows.push({
        id: rowId(e.path, "staged"),
        path: e.path,
        sector: "staged",
        entry: e,
      });
    }
    if (e.unstaged || e.untracked) {
      rows.push({
        id: rowId(e.path, "unstaged"),
        path: e.path,
        sector: "unstaged",
        entry: e,
      });
    }
  }
  return rows;
}

type CheckState = "checked" | "unchecked" | "indeterminate";

function checkState(entry: StatusEntry): CheckState {
  if (entry.staged && (entry.unstaged || entry.untracked))
    return "indeterminate";
  if (entry.staged) return "checked";
  return "unchecked";
}

const FileRow = memo(FileRowInner);

function FileRowInner({
  row,
  selected,
  onSelect,
  onToggle,
  onDiscard,
}: {
  row: ChangeRow;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (entry: StatusEntry) => void;
  onDiscard: (path: string) => void;
}) {
  const state = checkState(row.entry);
  const additions =
    row.sector === "staged"
      ? row.entry.additions_staged
      : row.entry.additions_unstaged;
  const deletions =
    row.sector === "staged"
      ? row.entry.deletions_staged
      : row.entry.deletions_unstaged;

  const inner = (
    <div
      onClick={() => onSelect(row.id)}
      className={`group relative flex cursor-pointer items-center gap-3 px-4 py-2 text-sm transition-colors ${
        selected
          ? "bg-accent/40 text-foreground before:absolute before:left-0 before:top-0 before:h-full before:w-[2px] before:bg-primary"
          : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
      }`}
    >
      <div
        className="flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(row.entry);
        }}
      >
        {state === "checked" ? (
          <CheckSquare className="h-[18px] w-[18px] text-primary" />
        ) : state === "indeterminate" ? (
          <MinusSquare className="h-[18px] w-[18px] text-primary/70" />
        ) : (
          <Square className="h-[18px] w-[18px] text-muted-foreground/40 group-hover:text-muted-foreground" />
        )}
      </div>
      <StatusIcon entry={row.entry} sector={row.sector} />
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{row.path.split("/").pop()}</span>
        <span className="ml-2 truncate text-[11px] opacity-50">
          {row.path.split("/").slice(0, -1).join("/")}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums">
        {!row.entry.binary && (
          <>
            {additions > 0 && (
              <span className="text-git-added">+{additions}</span>
            )}
            {deletions > 0 && (
              <span className="text-git-removed">−{deletions}</span>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDiscard(row.path)}
        >
          <Undo2 className="h-3.5 w-3.5" />
          Änderungen verwerfen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function DiffViewer({
  selectedRow,
  diffPayload,
  loading,
  diffFailed,
  onReload,
}: {
  selectedRow: ChangeRow | null;
  diffPayload: FileDiffResponse | null;
  loading: boolean;
  diffFailed: boolean;
  onReload: () => void;
}) {
  const unifiedText = useMemo(() => {
    if (!diffPayload || !selectedRow) return null;
    if (selectedRow.sector === "staged" && diffPayload.staged?.trim()) {
      return diffPayload.staged;
    }
    if (selectedRow.sector === "unstaged" && diffPayload.unstaged?.trim()) {
      return diffPayload.unstaged;
    }
    return null;
  }, [diffPayload, selectedRow]);

  const untrackedPlain = useMemo(() => {
    if (
      !diffPayload ||
      !selectedRow ||
      selectedRow.sector !== "unstaged" ||
      diffPayload.untracked_plain == null
    ) {
      return null;
    }
    return diffPayload.untracked_plain;
  }, [diffPayload, selectedRow]);

  if (!selectedRow) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground/50">
        <FileDiff className="h-12 w-12 opacity-20" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusIcon entry={selectedRow.entry} sector={selectedRow.sector} />
          <span className="truncate text-sm font-medium">
            {selectedRow.path}
          </span>
          <span className="shrink-0 rounded-sm border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {selectedRow.sector === "staged" ? "Gestaged" : "Nicht gestaged"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-md"
          onClick={onReload}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden">
        <UnifiedDiffBody
          loading={loading}
          failed={diffFailed}
          isBinary={!!diffPayload?.is_binary}
          unifiedText={unifiedText}
          untrackedPlain={untrackedPlain}
          emptyHint="Keine Textänderungen"
          failedHint="Diff konnte nicht geladen werden."
        />
      </div>
    </div>
  );
}

export function CommitPanel() {
  const activePath = useRepoStore((s) => s.activePath);
  const entries =
    useRepoStore((s) => (activePath ? s.status[activePath] : undefined)) ??
    EMPTY_STATUS;
  const loading = useRepoStore((s) =>
    activePath ? !!s.statusLoading[activePath] : false,
  );
  const reloadStatus = useRepoStore((s) => s.reloadStatus);
  const stageFiles = useRepoStore((s) => s.stageFiles);
  const unstageFiles = useRepoStore((s) => s.unstageFiles);
  const commitChanges = useRepoStore((s) => s.commitChanges);
  const discardFiles = useRepoStore((s) => s.discardFiles);

  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [stashOpen, setStashOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [diffPayload, setDiffPayload] = useState<FileDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffFailed, setDiffFailed] = useState(false);

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
  const stagedRows = useMemo(
    () => changeRows.filter((r) => r.sector === "staged"),
    [changeRows],
  );
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
      setDiffPayload({
        staged: null,
        unstaged: null,
        untracked_plain: null,
        is_binary: true,
      });
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
  }, [
    activePath,
    selectedPath,
    selectedSector,
    selectedBinary,
    selectedUntracked,
    selectedSignature,
  ]);

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

  const allState: CheckState = useMemo(() => {
    if (entries.length === 0) return "unchecked";
    const staged = entries.filter((e) => e.staged).length;
    if (staged === 0) return "unchecked";
    if (
      staged === entries.length &&
      entries.every((e) => !e.unstaged && !e.untracked)
    )
      return "checked";
    return "indeterminate";
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
  const stableOnSelectRow = useCallback((id: string) => {
    setSelectedRowId(id);
  }, []);
  const stableOnToggleRow = useCallback((entry: StatusEntry) => {
    void toggleEntryRef.current(entry);
  }, []);

  const toggleAll = async () => {
    if (!activePath || entries.length === 0) return;
    try {
      if (allState === "checked") {
        await unstageFiles(
          activePath,
          entries.map((e) => e.path),
        );
      } else {
        await stageFiles(
          activePath,
          entries.map((e) => e.path),
        );
      }
    } catch (e) {
      toastError(String(e));
    }
  };

  const discardOne = useCallback(
    (filePath: string) => {
      if (!activePath) return;
      const ok = window.confirm(
        `Änderungen an „${filePath}“ unwiderruflich verwerfen?`,
      );
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
    <div className="flex h-full flex-col gap-3 p-3">
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
          <RefreshCw
            className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden rounded-md border border-border/60">
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
            <div className="flex items-center gap-3 border-b border-border/60 px-4 py-2.5">
              <div
                className="flex cursor-pointer items-center justify-center"
                onClick={() => void toggleAll()}
              >
                {allState === "checked" ? (
                  <CheckSquare className="h-[18px] w-[18px] text-primary" />
                ) : allState === "indeterminate" ? (
                  <MinusSquare className="h-[18px] w-[18px] text-primary/70" />
                ) : (
                  <Square className="h-[18px] w-[18px] text-muted-foreground/40" />
                )}
              </div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Alle Dateien
              </span>
            </div>

            <ScrollArea className="flex-1">
              <div className="py-1">
                {stagedRows.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <span>Gestaged</span>
                      <span className="tabular-nums">{stagedRows.length}</span>
                    </div>
                    {stagedRows.map((row) => (
                      <FileRow
                        key={row.id}
                        row={row}
                        selected={row.id === selectedRowId}
                        onSelect={stableOnSelectRow}
                        onToggle={stableOnToggleRow}
                        onDiscard={discardOne}
                      />
                    ))}
                  </div>
                )}

                {unstagedRows.length > 0 && (
                  <div className={stagedRows.length > 0 ? "mt-2" : undefined}>
                    <div className="flex items-center justify-between px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      <span>Nicht gestaged</span>
                      <span className="tabular-nums">{unstagedRows.length}</span>
                    </div>
                    {unstagedRows.map((row) => (
                      <FileRow
                        key={row.id}
                        row={row}
                        selected={row.id === selectedRowId}
                        onSelect={stableOnSelectRow}
                        onToggle={stableOnToggleRow}
                        onDiscard={discardOne}
                      />
                    ))}
                  </div>
                )}

                {changeRows.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/60">
                    <Check className="mb-2 h-6 w-6 opacity-40" />
                    <p className="text-xs">Keine Änderungen</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="bg-border/50 transition-colors hover:bg-primary/20"
          />

          <ResizablePanel
            id="diff"
            defaultSize="68%"
            minSize="22%"
            className="flex flex-col"
          >
            <DiffViewer
              selectedRow={selectedRow}
              diffPayload={diffPayload}
              loading={diffLoading}
              diffFailed={diffFailed}
              onReload={() => void loadDiff()}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <div className="flex flex-col gap-2.5 rounded-md border border-border/60 p-3">
        <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
          <span>
            <span className="tabular-nums font-medium text-foreground">
              {totals.stagedFiles}
            </span>{" "}
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
                canCommit
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
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
