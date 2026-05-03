import { Button } from "@/components/ui/button";
import { FileDiff, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { StatusIcon } from "./commit-panel-status-icon";
import type { ChangeRow, FileDiffResponse } from "./commit-panel-types";
import { UnifiedDiffBody } from "./unified-diff-body";

export function DiffViewer({
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
          <span className="truncate text-sm font-medium">{selectedRow.path}</span>
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
