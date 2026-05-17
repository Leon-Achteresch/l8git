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
import { useTranslation } from "react-i18next";

const LINE_HEIGHT_PX = 18;
const EMPTY_SET: ReadonlySet<string> = new Set();

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

type SelectionKey = string;

function makeKey(hunkIdx: number, hunkLineIdx: number): SelectionKey {
  return `${hunkIdx}:${hunkLineIdx}`;
}

function HunkActionButton({
  sector,
  onClick,
}: {
  sector: "staged" | "unstaged";
  onClick: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const isStaged = sector === "staged";
  return (
    <button
      type="button"
      onClick={onClick}
      title={isStaged ? t("commitPanel.hunkUnstageTitle") : t("commitPanel.hunkStageTitle")}
      className={
        "flex h-[14px] shrink-0 items-center gap-0.5 rounded px-1 text-[9px] font-semibold uppercase tracking-wider transition-opacity " +
        (isStaged
          ? "bg-git-removed/20 text-git-removed hover:bg-git-removed/40"
          : "bg-git-added/20 text-git-added hover:bg-git-added/40")
      }
    >
      {isStaged ? <Minus className="h-2 w-2" /> : <Plus className="h-2 w-2" />}
      {isStaged ? t("commitPanel.hunkUnstageVerb") : t("commitPanel.hunkStageVerb")}
    </button>
  );
}

function LineCheckbox({
  checked,
  kind,
  onToggle,
}: {
  checked: boolean;
  kind: "add" | "del";
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const color = kind === "add" ? "border-git-added" : "border-git-removed";
  const bg = kind === "add" ? "bg-git-added" : "bg-git-removed";
  return (
    <button
      type="button"
      title={checked ? t("diff.lineDeselectTitle") : t("diff.lineSelectTitle")}
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

function InteractiveVirtualDiffList({
  parsed,
  sector,
  focusedHunkIdx,
  selectedLines,
  onToggleLine,
  onClearSelection,
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
  const { t } = useTranslation();
  const flatLines = useMemo(() => flattenParsedDiff(parsed), [parsed]);

  const stageableIndices = useMemo(
    () =>
      flatLines.reduce<number[]>((acc, line, i) => {
        if (line.kind === "add" || line.kind === "del") acc.push(i);
        return acc;
      }, []),
    [flatLines],
  );

  const [lineNavIdx, setLineNavIdx] = useState(-1);

  useEffect(() => {
    setLineNavIdx(-1);
  }, [parsed]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: flatLines.length,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => LINE_HEIGHT_PX,
    overscan: 20,
  });

  useEffect(() => {
    if (focusedHunkIdx < 0) return;
    const idx = flatLines.findIndex(
      (l) => l.kind === "hunk" && l.hunkIdx === focusedHunkIdx,
    );
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "start" });
  }, [focusedHunkIdx, flatLines, virtualizer]);

  useEffect(() => {
    if (lineNavIdx < 0) return;
    const flatIdx = stageableIndices[lineNavIdx];
    if (flatIdx !== undefined) {
      virtualizer.scrollToIndex(flatIdx, { align: "auto" });
    }
  }, [lineNavIdx, stageableIndices, virtualizer]);

  const handleStageHunk = useCallback(
    (hunkIdx: number) => {
      const patch = buildHunkPatch(parsed, hunkIdx);
      if (patch) onStageHunk(patch);
    },
    [parsed, onStageHunk],
  );

  const handleUnstageHunk = useCallback(
    (hunkIdx: number) => {
      const patch = buildHunkPatch(parsed, hunkIdx);
      if (patch) onUnstageHunk(patch);
    },
    [parsed, onUnstageHunk],
  );

  const handleApplySelectionButton = useCallback(() => {
    if (!selectedLines.size) return;
    const patches = buildPatchesForSelection(parsed, selectedLines);
    const applyPatch = sector === "unstaged" ? onStageHunk : onUnstageHunk;
    for (const patch of patches) applyPatch(patch);
    onClearSelection();
  }, [parsed, selectedLines, sector, onStageHunk, onUnstageHunk, onClearSelection]);

  const selectionCount = useMemo(() => {
    let n = 0;
    for (const key of selectedLines) {
      const [h, l] = key.split(":").map(Number);
      const line = parsed.hunks[h]?.lines[l];
      if (line && (line.kind === "add" || line.kind === "del")) n++;
    }
    return n;
  }, [selectedLines, parsed]);

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
        onToggleLine(key);
      }
    },
    [stageableIndices, lineNavIdx, flatLines, onToggleLine],
  );

  const items = virtualizer.getVirtualItems();
  const navFlatIdx = lineNavIdx >= 0 ? (stageableIndices[lineNavIdx] ?? -1) : -1;

  const linesSelectedLabel = t("diff.linesSelected", { count: selectionCount });

  const applyLabel =
    sector === "unstaged"
      ? t("commitPanel.stageSelectionLines", { count: selectionCount })
      : t("commitPanel.unstageSelectionLines", { count: selectionCount });

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {selectionCount > 0 && (
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5">
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{linesSelectedLabel}</span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/60"
            >
              {t("diff.cancel")}
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
              {applyLabel}
            </button>
          </div>
        </div>
      )}

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

export function UnifiedDiffBody({
  loading,
  failed,
  isBinary,
  unifiedText,
  untrackedPlain,
  emptyHint,
  failedHint,
  sector,
  onStageHunk,
  onUnstageHunk,
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
  parsedDiff?: ParsedDiff | null;
  focusedHunkIdx?: number;
  selectedLines?: ReadonlySet<string>;
  onToggleLine?: (key: string) => void;
  onClearSelection?: () => void;
}) {
  const { t } = useTranslation();
  const interactive = !!(sector && (onStageHunk ?? onUnstageHunk));

  const resolvedParsedDiff = useMemo(() => {
    if (parsedDiffProp != null) return parsedDiffProp;
    if (!interactive || !unifiedText?.trim()) return null;
    return parseDiffWithHunks(unifiedText);
  }, [parsedDiffProp, interactive, unifiedText]);

  const displayedDiffLines = useMemo(() => {
    if (interactive) return [];
    if (isBinary) return [];
    if (untrackedPlain != null && untrackedPlain.length > 0)
      return linesFromUntracked(untrackedPlain);
    if (unifiedText?.trim()) return parseUnifiedDiff(unifiedText);
    return [];
  }, [interactive, isBinary, unifiedText, untrackedPlain]);

  const stableOnStageHunk = useCallback(
    (patch: string) => onStageHunk?.(patch),
    [onStageHunk],
  );
  const stableOnUnstageHunk = useCallback(
    (patch: string) => onUnstageHunk?.(patch),
    [onUnstageHunk],
  );
  const stableOnToggleLine = useCallback(
    (key: string) => onToggleLine?.(key),
    [onToggleLine],
  );
  const stableOnClearSelection = useCallback(
    () => onClearSelection?.(),
    [onClearSelection],
  );

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
        {t("diff.binaryFile")}
      </div>
    );
  }

  if (
    interactive &&
    resolvedParsedDiff &&
    resolvedParsedDiff.hunks.length > 0 &&
    sector
  ) {
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
