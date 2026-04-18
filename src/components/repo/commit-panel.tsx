import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useRepoStore, type StatusEntry } from "@/lib/repo-store";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

const EMPTY_STATUS: StatusEntry[] = [];

type FileDiffResponse = {
  staged: string | null;
  unstaged: string | null;
  untracked_plain: string | null;
  is_binary: boolean;
};

type DiffLineKind = "hunk" | "add" | "del" | "ctx" | "meta";

type DiffLine = { kind: DiffLineKind; text: string };

function parseUnifiedDiff(text: string): DiffLine[] {
  const lines = text.split("\n");
  const out: DiffLine[] = [];
  for (const line of lines) {
    if (line.startsWith("@@")) {
      out.push({ kind: "hunk", text: line });
    } else if (
      line.startsWith("+++ ") ||
      line.startsWith("--- ") ||
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("similarity ") ||
      line.startsWith("rename ")
    ) {
      out.push({ kind: "meta", text: line });
    } else if (line.startsWith("+")) {
      out.push({ kind: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      out.push({ kind: "del", text: line.slice(1) });
    } else if (line.startsWith("\\")) {
      out.push({ kind: "meta", text: line });
    } else if (line.startsWith(" ")) {
      out.push({ kind: "ctx", text: line.slice(1) });
    } else {
      out.push({ kind: "ctx", text: line });
    }
  }
  return out;
}

function linesFromUntracked(content: string): DiffLine[] {
  return content.split("\n").map((text) => ({ kind: "add" as const, text }));
}

function DiffLineRow({ line }: { line: DiffLine }) {
  if (line.kind === "meta" || line.kind === "hunk") {
    return (
      <div className="whitespace-pre break-all px-2 py-0.5 font-mono text-xs text-muted-foreground">
        {line.text}
      </div>
    );
  }
  if (line.kind === "ctx") {
    return (
      <div className="whitespace-pre break-all px-2 py-0.5 font-mono text-xs text-foreground/90">
        {line.text}
      </div>
    );
  }
  if (line.kind === "add") {
    return (
      <div className="whitespace-pre break-all border-l-2 border-git-added bg-git-added-subtle px-2 py-0.5 font-mono text-xs text-git-added">
        {line.text}
      </div>
    );
  }
  return (
    <div className="whitespace-pre break-all border-l-2 border-git-removed bg-git-removed-subtle px-2 py-0.5 font-mono text-xs text-git-removed">
      {line.text}
    </div>
  );
}

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

function statusLabelForSector(
  entry: StatusEntry,
  sector: ChangeSector,
): { label: string; tone: string } {
  if (sector === "unstaged" && entry.untracked) {
    return { label: "Neu", tone: "text-emerald-600" };
  }
  const code =
    sector === "staged" ? entry.index_status : entry.worktree_status;
  switch (code.trim()) {
    case "M":
      return { label: "Geändert", tone: "text-amber-600" };
    case "A":
      return { label: "Hinzugefügt", tone: "text-emerald-600" };
    case "D":
      return { label: "Gelöscht", tone: "text-destructive" };
    case "R":
      return { label: "Umbenannt", tone: "text-sky-600" };
    case "C":
      return { label: "Kopiert", tone: "text-sky-600" };
    case "U":
      return { label: "Konflikt", tone: "text-destructive" };
    default:
      return { label: code.trim() || "?", tone: "text-muted-foreground" };
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
  if (entry.staged && (entry.unstaged || entry.untracked)) return "indeterminate";
  if (entry.staged) return "checked";
  return "unchecked";
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

  const [message, setMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [diffPayload, setDiffPayload] = useState<FileDiffResponse | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  useEffect(() => {
    if (activePath) void reloadStatus(activePath);
  }, [activePath, reloadStatus]);

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
      setDiffError(null);
      return;
    }
    setDiffLoading(true);
    setDiffError(null);
    try {
      const r = await invoke<FileDiffResponse>("repo_file_diff", {
        path: activePath,
        file: path,
        untracked: entry.untracked,
      });
      setDiffPayload(r);
    } catch (e) {
      setDiffError(String(e));
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
    if (staged === entries.length && entries.every((e) => !e.unstaged && !e.untracked))
      return "checked";
    return "indeterminate";
  }, [entries]);

  const displayedDiffLines = useMemo(() => {
    if (!diffPayload || diffPayload.is_binary || !selectedRow) return [];
    if (
      selectedRow.sector === "unstaged" &&
      diffPayload.untracked_plain != null
    ) {
      return linesFromUntracked(diffPayload.untracked_plain);
    }
    if (selectedRow.sector === "staged" && diffPayload.staged?.trim()) {
      return parseUnifiedDiff(diffPayload.staged);
    }
    if (selectedRow.sector === "unstaged" && diffPayload.unstaged?.trim()) {
      return parseUnifiedDiff(diffPayload.unstaged);
    }
    return [];
  }, [diffPayload, selectedRow]);

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
      setError(String(e));
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
      setError(String(e));
    }
  };

  const onCommit = async () => {
    if (!canCommit || !activePath) return;
    setCommitting(true);
    setError(null);
    try {
      await commitChanges(activePath, message.trim());
      setMessage("");
    } catch (e) {
      setError(String(e));
    } finally {
      setCommitting(false);
    }
  };

  const renderDiffScroll = (lines: DiffLine[]) => (
    <ScrollArea className="h-full min-h-0">
      <div className="min-h-[12rem] min-w-0 py-1">
        {lines.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Keine Zeilen.</p>
        ) : (
          lines.map((line, i) => <DiffLineRow key={i} line={line} />)
        )}
      </div>
    </ScrollArea>
  );

  const sectorBadge =
    selectedRow?.sector === "staged" ? (
      <span className="shrink-0 rounded border border-border bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Gestaged
      </span>
    ) : selectedRow?.sector === "unstaged" ? (
      <span className="shrink-0 rounded border border-border bg-muted/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Nicht gestaged
      </span>
    ) : null;

  const diffPane = (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-md border bg-muted/20">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-mono text-xs text-muted-foreground">
            {selectedRow?.path ?? "—"}
          </span>
          {sectorBadge}
        </div>
        {selectedRow && (
          <Button variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={() => void loadDiff()}>
            Diff neu laden
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
        {!selectedRow ? (
          <p className="p-4 text-sm text-muted-foreground">Datei wählen.</p>
        ) : diffLoading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Diff wird geladen …
          </div>
        ) : diffError ? (
          <p className="p-4 text-sm text-destructive">{diffError}</p>
        ) : !diffPayload ? null : diffPayload.is_binary ? (
          <p className="p-4 text-sm text-muted-foreground">Binärdatei, keine Textvorschau.</p>
        ) : displayedDiffLines.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {renderDiffScroll(displayedDiffLines)}
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">Keine Textänderungen in diesem Bereich.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pb-1">
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-sm font-semibold">
          Änderungen
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {changeRows.length}
          </span>
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void reloadStatus(activePath)}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aktualisieren"}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-muted/15">
        <div className="flex min-h-0 flex-1 gap-3 p-2">
          <div className="flex min-h-0 w-[min(100%,22rem)] shrink-0 flex-col overflow-hidden rounded-md border bg-background">
            <ScrollArea className="min-h-0 flex-1">
            {changeRows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                Keine ausstehenden Änderungen.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                  <Checkbox
                    checked={
                      allState === "indeterminate" ? "indeterminate" : allState === "checked"
                    }
                    onCheckedChange={() => void toggleAll()}
                    aria-label="Alle auswählen"
                  />
                  <span className="flex-1">Datei</span>
                  <span className="w-20 text-right">Δ</span>
                </div>
                <div className="border-b bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Gestaged
                </div>
                {stagedRows.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Leer</p>
                ) : (
                  <ul className="divide-y">
                    {stagedRows.map((row) => {
                      const { label, tone } = statusLabelForSector(
                        row.entry,
                        row.sector,
                      );
                      const state = checkState(row.entry);
                      const additions = row.entry.additions_staged;
                      const deletions = row.entry.deletions_staged;
                      const sel = row.id === selectedRowId;
                      return (
                        <li
                          key={row.id}
                          onClick={() => setSelectedRowId(row.id)}
                          className={`flex cursor-pointer items-center gap-2 px-2 py-2 text-sm transition-colors hover:bg-muted/50 ${
                            sel ? "bg-muted/60" : ""
                          }`}
                        >
                          <Checkbox
                            className="shrink-0"
                            checked={
                              state === "indeterminate"
                                ? "indeterminate"
                                : state === "checked"
                            }
                            onClick={(ev) => ev.stopPropagation()}
                            onCheckedChange={() => void toggleEntry(row.entry)}
                            aria-label={`${row.path} stagen`}
                          />
                          <span
                            className={`w-16 shrink-0 text-xs font-medium ${tone}`}
                          >
                            {label}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">
                            {row.path}
                          </span>
                          <span className="flex w-20 shrink-0 justify-end gap-1.5 font-mono text-xs">
                            {row.entry.binary ? (
                              <span className="text-muted-foreground">bin</span>
                            ) : (
                              <>
                                <span className="text-git-added">+{additions}</span>
                                <span className="text-git-removed">−{deletions}</span>
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="border-b bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Nicht gestaged
                </div>
                {unstagedRows.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Leer</p>
                ) : (
                  <ul className="divide-y">
                    {unstagedRows.map((row) => {
                      const { label, tone } = statusLabelForSector(
                        row.entry,
                        row.sector,
                      );
                      const state = checkState(row.entry);
                      const additions = row.entry.additions_unstaged;
                      const deletions = row.entry.deletions_unstaged;
                      const sel = row.id === selectedRowId;
                      return (
                        <li
                          key={row.id}
                          onClick={() => setSelectedRowId(row.id)}
                          className={`flex cursor-pointer items-center gap-2 px-2 py-2 text-sm transition-colors hover:bg-muted/50 ${
                            sel ? "bg-muted/60" : ""
                          }`}
                        >
                          <Checkbox
                            className="shrink-0"
                            checked={
                              state === "indeterminate"
                                ? "indeterminate"
                                : state === "checked"
                            }
                            onClick={(ev) => ev.stopPropagation()}
                            onCheckedChange={() => void toggleEntry(row.entry)}
                            aria-label={`${row.path} stagen`}
                          />
                          <span
                            className={`w-16 shrink-0 text-xs font-medium ${tone}`}
                          >
                            {label}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">
                            {row.path}
                          </span>
                          <span className="flex w-20 shrink-0 justify-end gap-1.5 font-mono text-xs">
                            {row.entry.binary ? (
                              <span className="text-muted-foreground">bin</span>
                            ) : (
                              <>
                                <span className="text-git-added">+{additions}</span>
                                <span className="text-git-removed">−{deletions}</span>
                              </>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
            </ScrollArea>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border bg-background">
            {diffPane}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <span className="text-muted-foreground">
          Gestaged: {totals.stagedFiles} Datei
          {totals.stagedFiles === 1 ? "" : "en"}
        </span>
        <span className="flex gap-3 font-mono">
          <span className="text-emerald-600">+{totals.additionsStaged}</span>
          <span className="text-destructive">−{totals.deletionsStaged}</span>
        </span>
      </div>

      <Separator className="shrink-0" />

      <div className="flex shrink-0 flex-col gap-2">
        <Textarea
          placeholder="Commit-Nachricht …"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="resize-none"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button onClick={onCommit} disabled={!canCommit || committing}>
            {committing && <Loader2 className="h-4 w-4 animate-spin" />}
            Lokal committen
          </Button>
        </div>
      </div>
    </div>
  );
}
