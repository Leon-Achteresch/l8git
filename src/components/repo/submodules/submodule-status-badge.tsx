import { cn } from "@/lib/utils";
import type { SubmoduleEntry, SubmoduleStatus } from "@/lib/repo-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

const CONFIG: Record<
  DisplayStatus,
  { label: (entry: SubmoduleEntry) => string; hint: string; className: string }
> = {
  synchronized: {
    label: () => "Synchron",
    hint: "Submodule ist initialisiert und synchron mit dem Remote.",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  behind: {
    label: (e) =>
      e.behind_count ? `Hinterher ↓${e.behind_count}` : "Hinterher",
    hint: "Der Remote-Branch hat neue Commits, die noch nicht gepinnt wurden.",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
  local_modified: {
    label: (e) =>
      e.local_changes
        ? `Lokal geändert · ${e.local_changes}`
        : "Lokal geändert",
    hint: "Das Submodule hat lokale, nicht committete Änderungen.",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  detached: {
    label: () => "Detached",
    hint: "HEAD des Submodules ist nicht an einen Branch gebunden.",
    className: "bg-muted text-muted-foreground",
  },
  modified: {
    label: () => "Abweichend",
    hint: "Der ausgecheckte Commit weicht vom registrierten Commit ab.",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  uninitialized: {
    label: () => "Nicht init.",
    hint: "Submodule wurde noch nicht initialisiert.",
    className: "bg-muted text-muted-foreground",
  },
  conflict: {
    label: () => "Konflikt",
    hint: "Merge-Konflikt im Submodule. Muss manuell aufgelöst werden.",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
};

export function SubmoduleStatusBadge({
  entry,
  status,
}: {
  entry?: SubmoduleEntry;
  status?: SubmoduleStatus;
}) {
  const displayStatus: DisplayStatus = entry
    ? getDisplayStatus(entry)
    : status === "initialized"
      ? "synchronized"
      : status === "modified"
        ? "modified"
        : status === "uninitialized"
          ? "uninitialized"
          : "conflict";

  const cfg = CONFIG[displayStatus];
  const label = entry ? cfg.label(entry) : cfg.label({} as SubmoduleEntry);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex shrink-0 cursor-default items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
            cfg.className,
          )}
        >
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px] text-xs">
        {cfg.hint}
      </TooltipContent>
    </Tooltip>
  );
}
