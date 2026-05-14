import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SubmoduleEntry, SubmoduleStatus } from "@/lib/repo-store";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export type DisplayStatus =
  | "synchronized"
  | "behind"
  | "local_modified"
  | "detached"
  | "modified"
  | "uninitialized"
  | "conflict";

export function getDisplayStatus(entry: SubmoduleEntry): DisplayStatus {
  if (entry.status === "conflict") return "conflict";
  if (entry.status === "uninitialized") return "uninitialized";
  if ((entry.local_changes ?? 0) > 0) return "local_modified";
  if (entry.is_detached) return "detached";
  if ((entry.behind_count ?? 0) > 0) return "behind";
  if (entry.status === "modified") return "modified";
  return "synchronized";
}

const CLASS_BY_STATUS: Record<DisplayStatus, string> = {
  synchronized: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  behind: "bg-red-500/15 text-red-600 dark:text-red-400",
  local_modified: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  detached: "bg-muted text-muted-foreground",
  modified: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  uninitialized: "bg-muted text-muted-foreground",
  conflict: "bg-red-500/15 text-red-600 dark:text-red-400",
};

export function SubmoduleStatusBadge({
  entry,
  status,
}: {
  entry?: SubmoduleEntry;
  status?: SubmoduleStatus;
}) {
  const { t } = useTranslation();
  const displayStatus: DisplayStatus = entry
    ? getDisplayStatus(entry)
    : status === "initialized"
      ? "synchronized"
      : status === "modified"
        ? "modified"
        : status === "uninitialized"
          ? "uninitialized"
          : "conflict";

  const { label, hint } = useMemo(() => {
    const e = entry ?? ({} as SubmoduleEntry);
    switch (displayStatus) {
      case "synchronized":
        return { label: t("submodule.badgeSyncLabel"), hint: t("submodule.badgeSyncHint") };
      case "behind":
        return {
          label: e.behind_count ? t("submodule.badgeBehindWithCount", { count: e.behind_count }) : t("submodule.badgeBehindLabel"),
          hint: t("submodule.badgeBehindHint"),
        };
      case "local_modified":
        return {
          label: e.local_changes ? t("submodule.badgeLocalWithCount", { count: e.local_changes }) : t("submodule.badgeLocalLabel"),
          hint: t("submodule.badgeLocalHint"),
        };
      case "detached":
        return { label: t("submodule.badgeDetachedLabel"), hint: t("submodule.badgeDetachedHint") };
      case "modified":
        return { label: t("submodule.badgeModifiedLabel"), hint: t("submodule.badgeModifiedHint") };
      case "uninitialized":
        return { label: t("submodule.badgeUninitializedLabel"), hint: t("submodule.badgeUninitializedHint") };
      case "conflict":
      default:
        return { label: t("submodule.badgeConflictLabel"), hint: t("submodule.badgeConflictHint") };
    }
  }, [displayStatus, entry, t]);

  const className = CLASS_BY_STATUS[displayStatus];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 cursor-default items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
            className,
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
