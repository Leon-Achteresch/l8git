import { FlaskConical } from "lucide-react";
import { useTranslation } from "react-i18next";

import { BlameIgnoreTool, FunctionHistoryTool, PickaxeTool, RangeDiffTool } from "./history-tools";
import { RerereTool, RestoreHunkTool, SnapshotsTool } from "./restore-tools";
import { BehaviorCompareTool, BisectRunTool, ConflictRadarTool, GitPlanTool, IntegrationLabTool } from "./run-tools";
import { IdentityProfilesTool } from "./identity-tool";
import { SparseCheckoutTool, WorktreeHousekeepingTool, WorktreeProfilesTool } from "./worktree-tools";

/** Advanced Git tools backed by the validated `git_expansion` command. Local repositories only. */
export function GitWorkbench({ path }: { path: string }) {
  const { t } = useTranslation();
  const groups = [
    { id: "history", tools: [PickaxeTool, FunctionHistoryTool, RangeDiffTool, BlameIgnoreTool] },
    { id: "safety", tools: [SnapshotsTool, RestoreHunkTool, RerereTool] },
    { id: "worktrees", tools: [WorktreeHousekeepingTool, WorktreeProfilesTool, SparseCheckoutTool, IdentityProfilesTool] },
    { id: "lab", tools: [IntegrationLabTool, ConflictRadarTool, BehaviorCompareTool, GitPlanTool, BisectRunTool] },
  ];
  return (
    <div className="space-y-3 px-4 pb-4">
      <h3 className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <FlaskConical className="size-3.5" />
        {t("wb.title")}
      </h3>
      {groups.map((g) => (
        <div key={g.id} className="space-y-1.5">
          <p className="text-[0.6875rem] font-semibold text-muted-foreground">{t(`wb.group.${g.id}`)}</p>
          {g.tools.map((Tool) => <Tool key={Tool.name} path={path} />)}
        </div>
      ))}
    </div>
  );
}
