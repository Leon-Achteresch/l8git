import { useExplainSheet } from "@/components/ai/explain-sheet";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FileDiff, ListChecks, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import type { CommitDiffViewMode } from "@/lib/commit-prefs";
import { looksLikeLfsPointerText } from "@/lib/media";
import { useLfsPointer } from "@/lib/use-media-file";
import type { ParsedDiff } from "@/lib/unified-diff";
import { MediaDiffPanel } from "@/components/repo/media/media-diff-panel";

import type { ChangeRow, FileDiffResponse } from "./commit-panel-types";
import { StatusIcon } from "./commit-panel-status-icon";
import { UnifiedDiffBody } from "./unified-diff-body";

const loadStagingDiff = () => import("./monaco-staging-diff");
const MonacoStagingDiff = lazy(() =>
  loadStagingDiff().then((m) => ({ default: m.MonacoStagingDiff })),
);

export function DiffViewer({
  repoPath,
  selectedRow,
  isBinary,
  onReload,
  viewMode,
  onViewModeChange,
  diffPayload,
  diffLoading,
  diffFailed,
  onStageHunk,
  onUnstageHunk,
  onDiscardHunk,
  parsedDiff,
  focusedHunkIdx,
  selectedLines,
  onToggleLine,
  onClearSelection,
}: {
  repoPath: string;
  selectedRow: ChangeRow | null;
  isBinary: boolean;
  onReload: () => void;
  viewMode: CommitDiffViewMode;
  onViewModeChange: (mode: CommitDiffViewMode) => void;
  diffPayload: FileDiffResponse | null;
  diffLoading: boolean;
  diffFailed: boolean;
  onStageHunk: (patches: string[]) => void;
  onUnstageHunk: (patches: string[]) => void;
  onDiscardHunk: (patches: string[], count: number) => void;
  parsedDiff: ParsedDiff | null;
  focusedHunkIdx: number;
  selectedLines: ReadonlySet<string>;
  onToggleLine: (key: string) => void;
  onClearSelection: () => void;
}) {
  const { t } = useTranslation();
  const explain = useExplainSheet();

  useEffect(() => {
    if (viewMode !== "edit") return;
    const idle =
      typeof requestIdleCallback === "function"
        ? requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 500);
    idle(() => void loadStagingDiff());
  }, [viewMode]);

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

  const pointerFromDiff =
    looksLikeLfsPointerText(unifiedText) || looksLikeLfsPointerText(untrackedPlain);

  const workingTreePointer = useLfsPointer(
    repoPath,
    selectedRow?.path ?? null,
    null,
    !!selectedRow && !isBinary && !pointerFromDiff && viewMode === "edit",
  );

  const isLfs = pointerFromDiff || !!workingTreePointer.pointer?.isPointer;
  const showMedia = isBinary || !!diffPayload?.is_binary || isLfs;

  if (!selectedRow) {
    return (
      <Empty className="h-full border-0 bg-transparent" data-testid="diff-empty">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileDiff className="size-5" aria-hidden />
          </EmptyMedia>
          <EmptyTitle>{t("commitPanel.noFileSelectedTitle", { defaultValue: "Select a file to preview" })}</EmptyTitle>
          <EmptyDescription>
            {t("commitPanel.noFileSelectedBody", { defaultValue: "Choose a changed file on the left to see its diff here." })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const sector = selectedRow.sector === "staged" ? "staged" : "unstaged";
  const explainableDiff = showMedia ? null : unifiedText?.trim() || null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border/60 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 basis-64 items-center gap-2.5">
          <StatusIcon entry={selectedRow.entry} sector={selectedRow.sector} />
          <span className="truncate text-sm font-medium" title={selectedRow.path}>
            {selectedRow.path}
          </span>
          <span className="shrink-0 rounded-sm border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {selectedRow.sector === "staged" ? t("commitPanel.sectorStaged") : t("commitPanel.sectorUnstaged")}
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-primary hover:bg-primary/10 hover:text-primary"
            disabled={!explainableDiff}
            title={t("commitPanel.explainDiff")}
            onClick={() => {
              if (!explainableDiff) return;
              explain.open({
                kind: "diff",
                repoPath,
                file: selectedRow.path,
                diff: explainableDiff,
              });
            }}
          >
            <Sparkles className="h-4 w-4" />
            {t("commitPanel.explainDiff")}
          </Button>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) =>
              value && onViewModeChange(value as CommitDiffViewMode)
            }
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem
              value="stage"
              aria-label={t("commitPanel.viewModeStage")}
              title={t("commitPanel.viewModeStageTitle")}
            >
              <ListChecks />
              {t("commitPanel.viewModeStage")}
            </ToggleGroupItem>
            <ToggleGroupItem
              value="edit"
              aria-label={t("commitPanel.viewModeEdit")}
              title={t("commitPanel.viewModeEditTitle")}
            >
              <Pencil />
              {t("commitPanel.viewModeEdit")}
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md"
            onClick={onReload}
            aria-label={t("commitPanel.reloadDiff", { defaultValue: "Reload diff" })}
            title={t("commitPanel.reloadDiff", { defaultValue: "Reload diff" })}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {showMedia ? (
          <MediaDiffPanel
            key={selectedRow.id}
            repoPath={repoPath}
            filePath={selectedRow.path}
            beforeTreeish="HEAD"
            afterTreeish={null}
            beforeLabel={t("media.sideHead")}
            afterLabel={t("media.sideWorkingTree")}
            checkLfs={isLfs}
          />
        ) : viewMode === "stage" ? (
          <UnifiedDiffBody
            loading={diffLoading}
            failed={diffFailed}
            isBinary={!!diffPayload?.is_binary}
            unifiedText={unifiedText}
            untrackedPlain={untrackedPlain}
            emptyHint={t("commitInspect.noTextChanges")}
            failedHint={t("commitPanel.diffLoadFailed")}
            filePath={selectedRow?.path}
            sector={sector}
            onStageHunk={onStageHunk}
            onUnstageHunk={onUnstageHunk}
            onDiscardHunk={onDiscardHunk}
            parsedDiff={parsedDiff}
            focusedHunkIdx={focusedHunkIdx}
            selectedLines={selectedLines}
            onToggleLine={onToggleLine}
            onClearSelection={onClearSelection}
          />
        ) : (
          <Suspense
            fallback={
              <div
                role="status"
                aria-label={t("diff.loading", { defaultValue: "Loading editor" })}
                className="flex h-full flex-col gap-2 p-4"
              >
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-32 w-full" />
              </div>
            }
          >
            <MonacoStagingDiff
              key={selectedRow.id}
              repoPath={repoPath}
              filePath={selectedRow.path}
              onSaved={onReload}
            />
          </Suspense>
        )}
      </div>
      {explain.element}
    </div>
  );
}
