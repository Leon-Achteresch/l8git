import { GitMerge, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useUiStore } from "@/lib/ui-store";

export function CommitPanelConflictPlaceholder({
  filePath,
  repoPath,
}: {
  filePath: string;
  repoPath: string;
}) {
  const { t } = useTranslation();
  const openMergeEditor = useUiStore((s) => s.openMergeEditor);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="rounded-full bg-amber-500/10 p-4 ring-1 ring-amber-500/30">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
      </div>
      <div className="grid gap-1">
        <p className="text-sm font-medium">{t("commitPanel.mergeConflict")}</p>
        <p className="max-w-48 text-xs text-muted-foreground">
          {t("commitPanel.mergeConflictHint")}
        </p>
        <p className="font-mono text-[11px] text-muted-foreground/60">
          {filePath.split("/").pop()}
        </p>
      </div>
      <button
        type="button"
        onClick={() => openMergeEditor(repoPath, filePath || undefined)}
        className="flex items-center gap-2 rounded-lg bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-600 hover:bg-amber-500/25 dark:text-amber-400"
      >
        <GitMerge className="h-4 w-4" />
        {t("commitPanel.openConflictEditor")}
      </button>
    </div>
  );
}
