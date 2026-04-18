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
import { UnifiedDiffBody } from "@/components/repo/unified-diff-body";
import { getCommitMessageTemplate, useCommitPrefs } from "@/lib/commit-prefs";
import { toastError } from "@/lib/error-toast";
import { useRepoStore, type StatusEntry } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import {
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
import { useCallback, useEffect, useMemo, useState } from "react";

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
    return <FilePlus className="h-3.5 w-3.5 text-emerald-500" />;
  }
  const code = sector === "staged" ? entry.index_status : entry.worktree_status;
  switch (code.trim()) {
    case "M":
      return <FileDiff className="h-3.5 w-3.5 text-amber-500" />;
    case "A":
      return <FilePlus className="h-3.5 w-3.5 text-emerald-500" />;
    case "D":
      return <FileMinus className="h-3.5 w-3.5 text-destructive" />;
    case "R":
    case "C":
      return <FileCode2 className="h-3.5 w-3.5 text-sky-500" />;
    case "U":
      return <FileDiff className="h-3.5 w-3.5 text-destructive" />;
    default:
      return <FileCode2 className="h-3.5 w-3.5 text-muted-foreground" />;
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

function FileRow({
  row,
  selected,
  onSelect,
  onToggle,
  onDiscard,
}: {
  row: ChangeRow;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
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
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-all duration-200 ${
        selected
          ? "bg-primary/10 text-primary shadow-sm"
          : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
      }`}
    >
      <div
        className="flex items-center justify-center"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {state === "checked" ? (
          <CheckSquare className="h-4 w-4 text-primary transition-transform group-hover:scale-110" />
        ) : state === "indeterminate" ? (
          <MinusSquare className="h-4 w-4 text-primary/70 transition-transform group-hover:scale-110" />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground/50 transition-transform group-hover:scale-110 group-hover:text-muted-foreground" />
        )}
      </div>
      <StatusIcon entry={row.entry} sector={row.sector} />
      <span className="min-w-0 flex-1 truncate font-medium text-[13px]">
        {row.path.split("/").pop()}
        <span className="ml-2 text-[10px] font-normal opacity-50 truncate">
          {row.path.split("/").slice(0, -1).join("/")}
        </span>
      </span>
      <div className="flex items-center gap-2 text-[10px] font-mono opacity-80">
        {!row.entry.binary && (
          <>
            {additions > 0 && (
              <span className="text-git-added">+{additions}</span>
            )}
            {deletions > 0 && (
              <span className="text-git-removed">-{deletions}</span>
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
    <div className="flex h-full flex-col overflow-hidden bg-background/50">
      <div className="flex items-center justify-between px-4 py-2.5 bg-muted/20 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <StatusIcon entry={selectedRow.entry} sector={selectedRow.sector} />
          <span className="truncate font-medium text-sm">
            {selectedRow.path}
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary uppercase tracking-wider">
            {selectedRow.sector === "staged" ? "Gestaged" : "Nicht gestaged"}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full hover:bg-muted/50"
          onClick={onReload}
        >
          <RefreshCw className="h-3.5 w-3.5" />
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

  const loadDiff = useCallback(async () => {
    if (!activePath || !selectedRow) {
      setDiffPayload(null);
      return;
    }
    const { path, entry } = selectedRow;
    if (entry.binary) {
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
        file: path,
        untracked: entry.untracked,
      });
      setDiffPayload(r);
    } catch (e) {
      toastError(String(e));
      setDiffFailed(true);
      setDiffPayload(null);
    } finally {
      setDiffLoading(false);
    }
  }, [activePath, selectedRow]);

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

  const layoutStorageKey = "gitit.commit-panel.layout.v2";

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
    <div className="flex h-full flex-col gap-4 p-4 bg-background/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
            <Check className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-tight">Änderungen</h2>
            <p className="text-[11px] text-muted-foreground font-medium">
              {changeRows.length} Dateien
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-muted/60 transition-colors"
          onClick={() => void reloadStatus(activePath)}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex-1 overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border/50">
        <ResizablePanelGroup
          orientation="horizontal"
          id="commit-panel-layout"
          defaultLayout={defaultLayout}
          onLayoutChanged={(layout) =>
            localStorage.setItem(layoutStorageKey, JSON.stringify(layout))
          }
        >
          <ResizablePanel
            id="files"
            defaultSize="32%"
            minSize="16%"
            maxSize="78%"
            className="flex flex-col bg-muted/10"
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-background/50 backdrop-blur-sm">
              <div
                className="flex cursor-pointer items-center justify-center hover:scale-110 transition-transform"
                onClick={() => void toggleAll()}
              >
                {allState === "checked" ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : allState === "indeterminate" ? (
                  <MinusSquare className="h-4 w-4 text-primary/70" />
                ) : (
                  <Square className="h-4 w-4 text-muted-foreground/50" />
                )}
              </div>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Alle Dateien
              </span>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-2 space-y-4">
                {stagedRows.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-primary/60">
                      Gestaged
                    </div>
                    {stagedRows.map((row) => (
                      <FileRow
                        key={row.id}
                        row={row}
                        selected={row.id === selectedRowId}
                        onSelect={() => setSelectedRowId(row.id)}
                        onToggle={() => void toggleEntry(row.entry)}
                        onDiscard={discardOne}
                      />
                    ))}
                  </div>
                )}

                {unstagedRows.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                      Nicht gestaged
                    </div>
                    {unstagedRows.map((row) => (
                      <FileRow
                        key={row.id}
                        row={row}
                        selected={row.id === selectedRowId}
                        onSelect={() => setSelectedRowId(row.id)}
                        onToggle={() => void toggleEntry(row.entry)}
                        onDiscard={discardOne}
                      />
                    ))}
                  </div>
                )}

                {changeRows.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
                    <Check className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm font-medium">Alles sauber</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </ResizablePanel>

          <ResizableHandle
            withHandle
            className="bg-border/50 hover:bg-primary/20 transition-colors"
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

      <div className="flex flex-col gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border/50">
        <div className="flex items-center gap-4 px-2">
          <div className="flex flex-1 items-center gap-2">
            <div className="flex h-6 items-center rounded-full bg-primary/10 px-2.5 text-[11px] font-semibold text-primary">
              {totals.stagedFiles}
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-git-added font-medium">
                +{totals.additionsStaged}
              </span>
              <span className="text-git-removed font-medium">
                -{totals.deletionsStaged}
              </span>
            </div>
          </div>
        </div>

        <div className="relative group">
          <Textarea
            placeholder="Commit-Nachricht eingeben..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="resize-none border-0 bg-muted/30 px-4 py-3 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl transition-all group-hover:bg-muted/50"
          />
          <Button
            size="icon"
            onClick={onCommit}
            disabled={!canCommit || committing}
            className={`absolute bottom-2 right-2 h-8 w-8 rounded-lg transition-all duration-300 ${
              canCommit
                ? "bg-primary text-primary-foreground shadow-md hover:scale-105"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {committing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
