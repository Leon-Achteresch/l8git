import {
  buildHunkPatch,
  buildPatchesForSelection,
  flattenParsedDiff,
  linesFromUntracked,
  parseUnifiedDiff,
  parseDiffWithHunks,
  type DiffLine,
  type InteractiveDiffLine,
  type ParsedDiff,
} from "@/lib/unified-diff";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const LINE_HEIGHT_PX = 18;
const EMPTY_SET: ReadonlySet<string> = new Set();

// ──────────────────────────────────────────────────────────────────────────────
// Non-interactive diff renderer (original behaviour)
// ──────────────────────────────────────────────────────────────────────────────

const lineWrap =
  "box-border block w-max min-w-full whitespace-pre px-4 py-0.5 font-mono text-[11px]";

function diffLineNode(line: DiffLine) {
  if (line.kind === "meta" || line.kind === "hunk") {
    return (
      <div className={`${lineWrap} bg-muted/5 text-muted-foreground/70`}>
        {line.text}
      </div>
    );
  }
  if (line.kind === "ctx") {
    return (
      <div className={`${lineWrap} text-foreground/80 transition-colors hover:bg-muted/10`}>
        {line.text}
      </div>
    );
  }
  if (line.kind === "add") {
    return (
      <div
        className={`${lineWrap} border-l-[3px] border-git-added bg-git-added-subtle/40 text-git-added transition-colors hover:bg-git-added-subtle/60`}
      >
        {line.text}
      </div>
    );
  }
  return (
    <div
      className={`${lineWrap} border-l-[3px] border-git-removed bg-git-removed-subtle/40 text-git-removed transition-colors hover:bg-git-removed-subtle/60`}
    >
      {line.text}
    </div>
  );
}

function VirtualDiffList({ lines }: { lines: DiffLine[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => LINE_HEIGHT_PX,
    overscan: 20,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div ref={scrollerRef} className="h-full min-h-0 min-w-0 overflow-auto">
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
        className="py-2"
      >
        {items.map((vi) => {
          const line = lines[vi.index];
          if (!line) return null;
          return (
            <div
              key={vi.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transform: `translateY(${vi.start}px)`,
                height: LINE_HEIGHT_PX,
              }}
            >
              {diffLineNode(line)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Interactive diff renderer
// ──────────────────────────────────────────────────────────────────────────────

/** Key format: "<hunkIdx>:<hunkLineIdx>" */
type SelectionKey = string;

function makeKey(hunkIdx: number, hunkLineIdx: number): SelectionKey {
  return `${hunkIdx}:${hunkLineIdx}`;
}

/** Visual indicator for staged/unstaged action on hunk headers. */
function HunkActionButton({
  sector,
  onClick,
}: {
  sector: "staged" | "unstaged";
  onClick: (e: React.MouseEvent) => void;
}) {
  const isStaged = sector === "staged";
  return (
    <button
      type="button"
      onClick={onClick}
      title={isStaged ? "Hunk unstagen" : "Hunk stagen"}
      className={
        "flex h-[14px] shrink-0 items-center gap-0.5 rounded px-1 text-[9px] font-semibold uppercase tracking-wider transition-opacity " +
        (isStaged
          ? "bg-git-removed/20 text-git-removed hover:bg-git-removed/40"
          : "bg-git-added/20 text-git-added hover:bg-git-added/40")
      }
    >
      {isStaged ? <Minus className="h-2 w-2" /> : <Plus className="h-2 w-2" />}
      {isStaged ? "unstage" : "stage"}
    </button>
  );
}

/** Checkbox indicator for change-line selection. */
function LineCheckbox({
  checked,
  kind,
  onToggle,
}: {
  checked: boolean;
  kind: "add" | "del";
  onToggle: () => void;
}) {
  const color = kind === "add" ? "border-git-added" : "border-git-removed";
  const bg = kind === "add" ? "bg-git-added" : "bg-git-removed";
  return (
    <button
      type="button"
      title={checked ? "Zeile abwählen" : "Zeile auswählen"}
      onClick={onToggle}
      className="flex h-full w-5 shrink-0 cursor-pointer items-center justify-center"
    >
      <span
        className={`block h-2.5 w-2.5 rounded-sm border ${color} transition-colors ${checked ? bg : "bg-transparent"}`}
      />
    </button>
  );
}

function interactiveLineNode(
  line: InteractiveDiffLine,
  selection: ReadonlySet<SelectionKey>,
  sector: "staged" | "unstaged",
  onToggleLine: (key: SelectionKey) => void,
  onStageHunk: (hunkIdx: number) => void,
  onUnstageHunk: (hunkIdx: number) => void,
) {
  if (line.kind === "meta") {
    return (
      <div className="flex h-full items-center">
        <div className="w-5 shrink-0" />
        <div className="whitespace-pre font-mono text-[11px] text-muted-foreground/70">
          {line.text}
        </div>
      </div>
    );
  }

  if (line.kind === "hunk") {
    return (
      <div className="flex h-full items-center gap-1 bg-muted/5 px-1">
        <div className="w-4 shrink-0" />
        <div className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/70">
          {line.text}
        </div>
        <HunkActionButton
          sector={sector}
          onClick={(e) => {
            e.stopPropagation();
            if (sector === "unstaged") onStageHunk(line.hunkIdx);
            else onUnstageHunk(line.hunkIdx);
          }}
        />
        <div className="w-1 shrink-0" />
      </div>
    );
  }

  if (line.kind === "ctx") {
    return (
      <div className="flex h-full items-center">
        <div className="w-5 shrink-0" />
        <div className="whitespace-pre font-mono text-[11px] text-foreground/80">
          {line.text}
        </div>
      </div>
    );
  }

  // add / del
  const key = makeKey(line.hunkIdx, line.hunkLineIdx);
  const checked = selection.has(key);
  const isAdd = line.kind === "add";
  const lineBg = isAdd
    ? checked
      ? "bg-git-added-subtle/70 border-l-[3px] border-git-added"
      : "bg-git-added-subtle/40 border-l-[3px] border-git-added"
    : checked
      ? "bg-git-removed-subtle/70 border-l-[3px] border-git-removed"
      : "bg-git-removed-subtle/40 border-l-[3px] border-git-removed";

  return (
    <div className={`flex h-full items-center transition-colors ${lineBg}`}>
      <LineCheckbox
        checked={checked}
        kind={isAdd ? "add" : "del"}
        onToggle={() => onToggleLine(key)}
      />
      <div
        className={`whitespace-pre font-mono text-[11px] ${isAdd ? "text-git-added" : "text-git-removed"}`}
      >
        {line.text}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Controlled interactive virtualised diff list
// ──────────────────────────────────────────────────────────────────────────────

function InteractiveVirtualDiffList({
  parsed,
  sector,
  // Lifted state from CommitPanel
  focusedHunkIdx,
  selectedLines,
  onToggleLine,
  onClearSelection,
  // Patch application
  onStageHunk,
  onUnstageHunk,
}: {
  parsed: ParsedDiff;
  sector: "staged" | "unstaged";
  focusedHunkIdx: number;
  selectedLines: ReadonlySet<SelectionKey>;
  onToggleLine: (key: SelectionKey) => void;
  onClearSelection: () => void;
  onStageHunk: (patch: string) => void;
  onUnstageHunk: (patch: string) => void;
}) {
  // ── Flat lines for virtualizer ───────────────────────────────────────────
  const flatLines = useMemo(() => flattenParsedDiff(parsed), [parsed]);

  // ── Indices of stageable (add/del) lines ─────────────────────────────────
  const stageableIndices = useMemo(
    () =>
      flatLines.reduce<number[]>((acc, line, i) => {
        if (line.kind === "add" || line.kind === "del") acc.push(i);
        return acc;
      }, []),
    [flatLines],
  );

  // ── Keyboard cursor within stageable lines ───────────────────────────────
  const [lineNavIdx, setLineNavIdx] = useState(-1);

  // Reset cursor when diff changes
  useEffect(() => {
    setLineNavIdx(-1);
  }, [parsed]);

  // ── Virtualizer ──────────────────────────────────────────────────────────
  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatLines.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => LINE_HEIGHT_PX,
    overscan: 20,
  });

  // ── Scroll to focused hunk (triggered by [ / ] hotkeys) ─────────────────
  useEffect(() => {
    if (focusedHunkIdx < 0) return;
    const idx = flatLines.findIndex(
      (l) => l.kind === "hunk" && l.hunkIdx === focusedHunkIdx,
    );
    console.log("[interactive-diff] scroll to hunk", focusedHunkIdx, "flatIdx:", idx);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "start" });
  }, [focusedHunkIdx, flatLines, virtualizer]);

  // ── Scroll to navigated line (arrow key navigation) ──────────────────────
  useEffect(() => {
    if (lineNavIdx < 0) return;
    const flatIdx = stageableIndices[lineNavIdx];
    if (flatIdx !== undefined) {
      console.log("[interactive-diff] scroll to nav line", lineNavIdx, "flatIdx:", flatIdx);
      virtualizer.scrollToIndex(flatIdx, { align: "auto" });
    }
  }, [lineNavIdx, stageableIndices, virtualizer]);

  // ── Hunk patch helpers ───────────────────────────────────────────────────
  const handleStageHunk = useCallback(
    (hunkIdx: number) => {
      const patch = buildHunkPatch(parsed, hunkIdx);
      console.log("[interactive-diff] stageHunk", hunkIdx, "patch len:", patch.length);
      if (patch) onStageHunk(patch);
    },
    [parsed, onStageHunk],
  );

  const handleUnstageHunk = useCallback(
    (hunkIdx: number) => {
      const patch = buildHunkPatch(parsed, hunkIdx);
      console.log("[interactive-diff] unstageHunk", hunkIdx, "patch len:", patch.length);
      if (patch) onUnstageHunk(patch);
    },
    [parsed, onUnstageHunk],
  );

  // ── Selection bar "Apply" button ─────────────────────────────────────────
  const handleApplySelectionButton = useCallback(() => {
    if (!selectedLines.size) return;
    const patches = buildPatchesForSelection(parsed, selectedLines);
    console.log("[interactive-diff] applySelection patches:", patches.length);
    const applyPatch = sector === "unstaged" ? onStageHunk : onUnstageHunk;
    for (const patch of patches) applyPatch(patch);
    onClearSelection();
  }, [parsed, selectedLines, sector, onStageHunk, onUnstageHunk, onClearSelection]);

  // ── Selection count (only add/del lines count) ───────────────────────────
  const selectionCount = useMemo(() => {
    let n = 0;
    for (const key of selectedLines) {
      const [h, l] = key.split(":").map(Number);
      const line = parsed.hunks[h]?.lines[l];
      if (line && (line.kind === "add" || line.kind === "del")) n++;
    }
    return n;
  }, [selectedLines, parsed]);

  // ── Arrow-key / Space navigation (local to scroll container) ─────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        setLineNavIdx((prev) => {
          if (stageableIndices.length === 0) return -1;
          if (e.key === "ArrowUp")
            return prev <= 0 ? stageableIndices.length - 1 : prev - 1;
          return prev >= stageableIndices.length - 1 ? 0 : prev + 1;
        });
      } else if (e.key === " ") {
        e.preventDefault();
        if (lineNavIdx < 0) return;
        const flatIdx = stageableIndices[lineNavIdx];
        if (flatIdx === undefined) return;
        const line = flatLines[flatIdx];
        if (!line || (line.kind !== "add" && line.kind !== "del")) return;
        const key = makeKey(line.hunkIdx, line.hunkLineIdx);
        console.log("[interactive-diff] Space → toggle line", key);
        onToggleLine(key);
      }
    },
    [stageableIndices, lineNavIdx, flatLines, onToggleLine],
  );

  const items = virtualizer.getVirtualItems();
  const navFlatIdx = lineNavIdx >= 0 ? (stageableIndices[lineNavIdx] ?? -1) : -1;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Selection action bar */}
      {selectionCount > 0 && (
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{selectionCount}</span>{" "}
            {selectionCount === 1 ? "Zeile" : "Zeilen"} ausgewählt
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={handleApplySelectionButton}
              className={
                "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors " +
                (sector === "unstaged"
                  ? "bg-git-added/20 text-git-added hover:bg-git-added/40"
                  : "bg-git-removed/20 text-git-removed hover:bg-git-removed/40")
              }
            >
              {sector === "unstaged" ? (
                <Plus className="h-3 w-3" />
              ) : (
                <Minus className="h-3 w-3" />
              )}
              {sector === "unstaged"
                ? `${selectionCount} ${selectionCount === 1 ? "Zeile" : "Zeilen"} stagen`
                : `${selectionCount} ${selectionCount === 1 ? "Zeile" : "Zeilen"} unstagen`}
            </button>
          </div>
        </div>
      )}

      {/* Virtualised diff lines – tabIndex enables arrow-key / Space navigation */}
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-auto outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div
          style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          className="py-2"
        >
          {items.map((vi) => {
            const line = flatLines[vi.index];
            if (!line) return null;

            // Visual highlights
            const isFocusedHunk =
              line.kind === "hunk" && line.hunkIdx === focusedHunkIdx;
            const isNavLine = vi.index === navFlatIdx;

            return (
              <div
                key={vi.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${vi.start}px)`,
                  height: LINE_HEIGHT_PX,
                }}
                className={
                  isFocusedHunk
                    ? "bg-primary/8 ring-1 ring-inset ring-primary/40"
                    : isNavLine
                      ? "ring-1 ring-inset ring-primary/60"
                      : undefined
                }
              >
                {interactiveLineNode(
                  line,
                  selectedLines,
                  sector,
                  onToggleLine,
                  handleStageHunk,
                  handleUnstageHunk,
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Public component
// ──────────────────────────────────────────────────────────────────────────────

export function UnifiedDiffBody({
  loading,
  failed,
  isBinary,
  unifiedText,
  untrackedPlain,
  emptyHint,
  failedHint,
  // Interactive staging props (optional – enables interactive mode)
  sector,
  onStageHunk,
  onUnstageHunk,
  // Lifted interactive state (pre-computed by CommitPanel to avoid double parsing)
  parsedDiff: parsedDiffProp,
  focusedHunkIdx = -1,
  selectedLines = EMPTY_SET,
  onToggleLine,
  onClearSelection,
}: {
  loading: boolean;
  failed: boolean;
  isBinary: boolean;
  unifiedText: string | null;
  untrackedPlain: string | null;
  emptyHint: string;
  failedHint: string;
  sector?: "staged" | "unstaged";
  onStageHunk?: (patch: string) => void;
  onUnstageHunk?: (patch: string) => void;
  // Lifted state (all optional – non-interactive callers don't need these)
  parsedDiff?: ParsedDiff | null;
  focusedHunkIdx?: number;
  selectedLines?: ReadonlySet<string>;
  onToggleLine?: (key: string) => void;
  onClearSelection?: () => void;
}) {
  const interactive = !!(sector && (onStageHunk ?? onUnstageHunk));

  // If a pre-computed parsedDiff is provided use it; otherwise parse unifiedText.
  const resolvedParsedDiff = useMemo(() => {
    if (parsedDiffProp != null) return parsedDiffProp;
    if (!interactive || !unifiedText?.trim()) return null;
    return parseDiffWithHunks(unifiedText);
  }, [parsedDiffProp, interactive, unifiedText]);

  // Flat diff lines (non-interactive mode)
  const displayedDiffLines = useMemo(() => {
    if (interactive) return [];
    if (isBinary) return [];
    if (untrackedPlain != null && untrackedPlain.length > 0)
      return linesFromUntracked(untrackedPlain);
    if (unifiedText?.trim()) return parseUnifiedDiff(unifiedText);
    return [];
  }, [interactive, isBinary, unifiedText, untrackedPlain]);

  // Stable callbacks for child
  const stableOnStageHunk = useCallback(
    (patch: string) => onStageHunk?.(patch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onStageHunk],
  );
  const stableOnUnstageHunk = useCallback(
    (patch: string) => onUnstageHunk?.(patch),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onUnstageHunk],
  );
  const stableOnToggleLine = useCallback(
    (key: string) => onToggleLine?.(key),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onToggleLine],
  );
  const stableOnClearSelection = useCallback(
    () => onClearSelection?.(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onClearSelection],
  );

  // ─── Status overlays ─────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {failedHint}
      </div>
    );
  }
  if (isBinary) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Binärdatei
      </div>
    );
  }

  // ─── Interactive mode ─────────────────────────────────────────────────────
  if (interactive && resolvedParsedDiff && resolvedParsedDiff.hunks.length > 0 && sector) {
    return (
      <InteractiveVirtualDiffList
        parsed={resolvedParsedDiff}
        sector={sector}
        focusedHunkIdx={focusedHunkIdx}
        selectedLines={selectedLines}
        onToggleLine={stableOnToggleLine}
        onClearSelection={stableOnClearSelection}
        onStageHunk={stableOnStageHunk}
        onUnstageHunk={stableOnUnstageHunk}
      />
    );
  }

  // ─── Non-interactive / untracked / empty fallback ─────────────────────────
  if (
    (!interactive && displayedDiffLines.length > 0) ||
    (untrackedPlain != null && untrackedPlain.length > 0)
  ) {
    const lines =
      untrackedPlain != null && untrackedPlain.length > 0
        ? linesFromUntracked(untrackedPlain)
        : displayedDiffLines;
    return <VirtualDiffList lines={lines} />;
  }

  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {emptyHint}
    </div>
  );
}
