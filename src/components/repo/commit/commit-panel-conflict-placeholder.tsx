import { Button } from "@/components/ui/button";
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
      <div className="rounded-full bg-git-modified/10 p-4 ring-1 ring-git-modified/30">
        <AlertTriangle className="h-8 w-8 text-git-modified" />
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
      <Button
        type="button"
        variant="warning"
        onClick={() => openMergeEditor(repoPath, filePath || undefined)}
      >
        <GitMerge />
        {t("commitPanel.openConflictEditor")}
      </Button>
    </div>
  );
}
