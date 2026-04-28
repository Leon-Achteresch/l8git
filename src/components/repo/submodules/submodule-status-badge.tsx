import { cn } from "@/lib/utils";
import type { SubmoduleStatus } from "@/lib/repo-store";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CONFIG: Record<
  SubmoduleStatus,
  { label: string; hint: string; className: string }
> = {
  initialized: {
    label: "Synchron",
    hint: "Submodule ist initialisiert und zeigt auf den in .gitmodules registrierten Commit.",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  modified: {
    label: "Abweichend",
    hint: "Der ausgecheckte Commit weicht vom registrierten Commit ab. Entweder wurde das Submodule manuell aktualisiert oder es muss mit 'git submodule update' synchronisiert werden.",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  uninitialized: {
    label: "Nicht init.",
    hint: "Submodule wurde noch nicht initialisiert. Führe 'git submodule init' aus, um es in .git/config zu registrieren, dann 'git submodule update' zum Auschecken.",
    className: "bg-muted text-muted-foreground",
  },
  conflict: {
    label: "Konflikt",
    hint: "Merge-Konflikt im Submodule. Der Konflikt muss manuell aufgelöst werden.",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
};

export function SubmoduleStatusBadge({ status }: { status: SubmoduleStatus }) {
  const { label, hint, className } = CONFIG[status];
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
