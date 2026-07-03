import { Button } from "@/components/ui/button";
import { FileDiff, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ChangeRow } from "./commit-panel-types";
import { StatusIcon } from "./commit-panel-status-icon";
import { MonacoStagingDiff } from "./monaco-staging-diff";

export function DiffViewer({
  repoPath,
  selectedRow,
  isBinary,
  onReload,
}: {
  repoPath: string;
  selectedRow: ChangeRow | null;
  isBinary: boolean;
  onReload: () => void;
}) {
  const { t } = useTranslation();

  return !selectedRow ? (
    <div className="flex h-full items-center justify-center text-muted-foreground/50">
      <FileDiff className="h-12 w-12 opacity-20" />
    </div>
  ) : (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <StatusIcon entry={selectedRow.entry} sector={selectedRow.sector} />
          <span className="truncate text-sm font-medium">{selectedRow.path}</span>
          <span className="shrink-0 rounded-sm border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {selectedRow.sector === "staged" ? t("commitPanel.sectorStaged") : t("commitPanel.sectorUnstaged")}
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
        {isBinary ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t("diff.binaryFile")}
          </div>
        ) : (
          <MonacoStagingDiff
            key={selectedRow.id}
            repoPath={repoPath}
            filePath={selectedRow.path}
            onSaved={onReload}
          />
        )}
      </div>
    </div>
  );
}
